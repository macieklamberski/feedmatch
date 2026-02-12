import { createHash } from 'node:crypto'
import { fingerprintMeta, hashMeta } from './constants.js'
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
  const levelIndex = fingerprintMeta.findIndex((entry) => entry.level === level)
  const prefix = fingerprintMeta.slice(0, levelIndex + 1)

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
  const maxLevel = fingerprintMeta[fingerprintMeta.length - 1].level
  const maxIdentifiable = allItemHashes.filter(
    (hashes) => buildFingerprint(hashes, maxLevel) !== undefined,
  ).length

  if (maxIdentifiable === 0) {
    return currentLevel ?? 'title'
  }

  const startIndex = currentLevel
    ? fingerprintMeta.findIndex((entry) => entry.level === currentLevel)
    : 0

  for (let index = startIndex; index < fingerprintMeta.length; index++) {
    const level = fingerprintMeta[index].level
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
