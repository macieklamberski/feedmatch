import { createHash } from 'node:crypto'
import { fingerprintMeta, fingerprintPrefixByLevel, hashMeta } from './constants.js'
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

export const hasStrongHash = (hashes: ItemHashes): boolean => {
  return hashMeta.some((meta) => meta.isStrongHash && hashes[meta.key])
}

// Build a tagged fingerprint using the level prefix up to and including
// the given level. Returns undefined when no hashes exist in the prefix.
export const buildFingerprint = (
  hashes: ItemHashes,
  level: FingerprintLevel,
): string | undefined => {
  const prefix = fingerprintPrefixByLevel.get(level) ?? []

  if (!prefix.some((entry) => hashes[entry.key])) {
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
  const maxLevelIndex = fingerprintMeta.length - 1

  // Precompute fingerprints for every item at every level in one pass.
  // Each entry is built incrementally by extending the prefix string,
  // producing the same output as buildFingerprint but without repeated
  // Map lookups, .some() checks, or .map().join() per level.
  const allFingerprints: Array<Array<string | undefined>> = []

  for (const hashes of allItemHashes) {
    const perLevel: Array<string | undefined> = []
    let prefix = ''
    let hasAny = false

    for (let i = 0; i < fingerprintMeta.length; i++) {
      const entry = fingerprintMeta[i]
      const value = hashes[entry.key]

      if (value) {
        hasAny = true
      }

      if (i > 0) {
        prefix += '|'
      }

      prefix += `${entry.tag}:${value ?? ''}`
      perLevel.push(hasAny ? prefix : undefined)
    }

    allFingerprints.push(perLevel)
  }

  // Count items identifiable at max level (title). A valid level must identify
  // the same number — otherwise some items become unidentifiable.
  let maxIdentifiable = 0

  for (const fingerprints of allFingerprints) {
    if (fingerprints[maxLevelIndex] !== undefined) {
      maxIdentifiable++
    }
  }

  if (maxIdentifiable === 0) {
    return currentLevel ?? 'title'
  }

  const startIndex = currentLevel
    ? fingerprintMeta.findIndex((entry) => entry.level === currentLevel)
    : 0

  if (startIndex === -1) {
    throw new Error(`Invalid fingerprint level: ${currentLevel}`)
  }

  for (let index = startIndex; index < fingerprintMeta.length; index++) {
    const keys = new Set<string>()
    let hasCollision = false

    for (const fingerprints of allFingerprints) {
      const key = fingerprints[index]

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
      return fingerprintMeta[index].level
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
