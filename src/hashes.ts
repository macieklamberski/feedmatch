import { createHash } from 'node:crypto'
import {
  normalizeEnclosureForHashing,
  normalizeGuidForHashing,
  normalizeGuidFragmentForHashing,
  normalizeHtmlForHashing,
  normalizeLinkForHashing,
  normalizeLinkFragmentForHashing,
  normalizeTextForHashing,
} from './normalize.js'
import type { FingerprintLevel, ItemHashes, NewItem } from './types.js'

export {
  normalizeEnclosureForHashing,
  normalizeGuidForHashing,
  normalizeGuidFragmentForHashing,
  normalizeHtmlForHashing,
  normalizeLinkForHashing,
  normalizeLinkFragmentForHashing,
  normalizeLinkWithFragmentForHashing,
  normalizeTextForHashing,
} from './normalize.js'

export const generateHash = (...values: Array<string | null | undefined>) => {
  return createHash('sha256').update(values.join('\0')).digest('hex').slice(0, 32)
}

export const isDefined = <T>(value: T | null | undefined): value is T => {
  return value != null
}

// Hash key from ItemHashes.
export type HashKey = keyof ItemHashes

// Metadata for a single hash key.
export type HashMeta = {
  key: HashKey
  tag: string
  weight: number
  isStrongHash: boolean
  isMatchable: boolean
  isContent: boolean
  normalizeFn: (item: NewItem) => string | undefined
  level?: FingerprintLevel
}

// Single source of truth for hash key metadata.
// Order determines fingerprintLevelMeta derivation order.
export const hashMeta: Array<HashMeta> = [
  {
    key: 'guidHash',
    tag: 'g',
    weight: 32,
    isStrongHash: true,
    isMatchable: true,
    isContent: false,
    normalizeFn: (item) => normalizeGuidForHashing(item.guid),
    level: 'guid',
  },
  {
    key: 'guidFragmentHash',
    tag: 'gf',
    weight: 0,
    isStrongHash: false,
    isMatchable: false,
    isContent: false,
    normalizeFn: (item) => normalizeGuidFragmentForHashing(item.guid),
    level: 'guidFragment',
  },
  {
    key: 'linkHash',
    tag: 'l',
    weight: 8,
    isStrongHash: true,
    isMatchable: true,
    isContent: false,
    normalizeFn: (item) => normalizeLinkForHashing(item.link),
    level: 'link',
  },
  {
    key: 'linkFragmentHash',
    tag: 'lf',
    weight: 0,
    isStrongHash: false,
    isMatchable: false,
    isContent: false,
    normalizeFn: (item) => normalizeLinkFragmentForHashing(item.link),
    level: 'linkFragment',
  },
  {
    key: 'enclosureHash',
    tag: 'e',
    weight: 16,
    isStrongHash: true,
    isMatchable: true,
    isContent: true,
    normalizeFn: (item) => normalizeEnclosureForHashing(item.enclosures),
    level: 'enclosure',
  },
  {
    key: 'titleHash',
    tag: 't',
    weight: 4,
    isStrongHash: false,
    isMatchable: true,
    isContent: true,
    normalizeFn: (item) => normalizeTextForHashing(item.title),
    level: 'title',
  },
  {
    key: 'contentHash',
    tag: 'c',
    weight: 2,
    isStrongHash: false,
    isMatchable: false,
    isContent: true,
    normalizeFn: (item) => normalizeHtmlForHashing(item.content),
  },
  {
    key: 'summaryHash',
    tag: 's',
    weight: 1,
    isStrongHash: false,
    isMatchable: false,
    isContent: true,
    normalizeFn: (item) => normalizeHtmlForHashing(item.summary),
  },
]

// Check if any strong hash (guid/link/enclosure) is present.
export const hasStrongHash = (hashes: ItemHashes): boolean => {
  return hashMeta.some((meta) => meta.isStrongHash && hashes[meta.key])
}

// Fingerprint level metadata ordered strongest → weakest.
export type FingerprintLevelMeta = {
  level: FingerprintLevel
  key: HashKey
  tag: string
}

// Derived from hashMeta — entries with level form the fingerprint level metadata.
export const fingerprintLevelMeta: Array<FingerprintLevelMeta> = hashMeta
  .filter((meta): meta is HashMeta & { level: FingerprintLevel } => {
    return meta.level !== undefined
  })
  .map((meta) => {
    return { level: meta.level, key: meta.key, tag: meta.tag }
  })

// All hash keys derived from hashMeta.
export const hashKeys: Array<HashKey> = hashMeta.map((meta) => meta.key)

// Build a tagged fingerprint using the level prefix up to and including
// the given level. Returns undefined when no hashes exist in the prefix.
export const buildFingerprint = (
  hashes: ItemHashes,
  level: FingerprintLevel,
): string | undefined => {
  const levelIndex = fingerprintLevelMeta.findIndex((entry) => entry.level === level)
  const prefix = fingerprintLevelMeta.slice(0, levelIndex + 1)

  const hasAny = prefix.some((entry) => hashes[entry.key])

  if (!hasAny) {
    return
  }

  return prefix.map((entry) => `${entry.tag}:${hashes[entry.key] ?? ''}`).join('|')
}

// Compute the optimal fingerprint level for a set of item hashes. Finds the
// strongest level where buildFingerprint produces zero collisions and full
// coverage (every identifiable item produces a fingerprint). When a
// currentLevel is provided and is valid it is returned unchanged; if it
// collides or loses coverage, only weaker levels are considered (fast
// downgrade, never upgrades).
export const resolveFingerprintLevel = (
  allItemHashes: Array<ItemHashes>,
  currentLevel?: FingerprintLevel,
): FingerprintLevel => {
  // Count items identifiable at max level (title). A valid level must identify
  // the same number — otherwise some items become unidentifiable.
  const maxLevel = fingerprintLevelMeta[fingerprintLevelMeta.length - 1].level
  const maxIdentifiable = allItemHashes.filter(
    (hashes) => buildFingerprint(hashes, maxLevel) !== undefined,
  ).length

  if (maxIdentifiable === 0) {
    return currentLevel ?? 'title'
  }

  const startIndex = currentLevel
    ? fingerprintLevelMeta.findIndex((entry) => entry.level === currentLevel)
    : 0

  for (let index = startIndex; index < fingerprintLevelMeta.length; index++) {
    const level = fingerprintLevelMeta[index].level
    const keys = new Set<string>()
    let hasCollision = false

    for (const hashes of allItemHashes) {
      const key = buildFingerprint(hashes, level)

      if (!key) {
        continue
      }

      if (keys.has(key)) {
        hasCollision = true
        break
      }

      keys.add(key)
    }

    // Valid level: no collisions AND full coverage of identifiable items.
    if (!hasCollision && keys.size >= maxIdentifiable) {
      return level
    }
  }

  // Even title collides — return weakest possible level.
  return 'title'
}

// Compute all available hashes for a feed item. Returns null for fields
// that cannot be computed (absent or empty source data).
export const computeItemHashes = <TItem extends NewItem>(item: TItem): ItemHashes => {
  const hashes: ItemHashes = {
    guidHash: null,
    guidFragmentHash: null,
    linkHash: null,
    linkFragmentHash: null,
    enclosureHash: null,
    titleHash: null,
    summaryHash: null,
    contentHash: null,
  }

  for (const meta of hashMeta) {
    const normalized = meta.normalizeFn(item)

    if (normalized) {
      hashes[meta.key] = generateHash(normalized)
    }
  }

  return hashes
}
