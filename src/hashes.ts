import { generateHash } from './helpers.js'
import { hashMeta, identityLevels } from './meta.js'
import type { HashableItem, IdentityDepth, ItemHashes } from './types.js'

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

// Build a tagged identifier using the level prefix up to and including
// the given depth. Returns undefined when no hashes exist in the prefix.
export const composeItemIdentifier = (
  hashes: ItemHashes,
  depth: IdentityDepth,
): string | undefined => {
  const depthIndex = identityLevels.findIndex((entry) => entry.depth === depth)
  const prefix = identityLevels.slice(0, depthIndex + 1)

  const hasAny = prefix.some((entry) => hashes[entry.key])

  if (!hasAny) {
    return
  }

  return prefix.map((entry) => `${entry.tag}:${hashes[entry.key] ?? ''}`).join('|')
}

// Compute the optimal identity depth for a set of item hashes. Finds the
// strongest depth where composeItemIdentifier produces zero collisions and full
// coverage (every identifiable item produces an identifier). When a
// currentDepth is provided and is valid it is returned unchanged; if it
// collides or loses coverage, only weaker depths are considered (fast
// downgrade, never upgrades).
export const resolveIdentityDepth = (
  allItemHashes: Array<ItemHashes>,
  currentDepth?: IdentityDepth,
): IdentityDepth => {
  // Count items identifiable at max depth (title). A valid depth must identify
  // the same number — otherwise some items become unidentifiable.
  const maxDepth = identityLevels[identityLevels.length - 1].depth
  const maxIdentifiable = allItemHashes.filter(
    (hashes) => composeItemIdentifier(hashes, maxDepth) !== undefined,
  ).length

  if (maxIdentifiable === 0) {
    return currentDepth ?? 'title'
  }

  const startIndex = currentDepth
    ? identityLevels.findIndex((entry) => entry.depth === currentDepth)
    : 0

  for (let index = startIndex; index < identityLevels.length; index++) {
    const depth = identityLevels[index].depth
    const keys = new Set<string>()
    let hasCollision = false

    for (const hashes of allItemHashes) {
      const key = composeItemIdentifier(hashes, depth)

      if (!key) {
        continue
      }

      if (keys.has(key)) {
        hasCollision = true
        break
      }

      keys.add(key)
    }

    // Valid depth: no collisions AND full coverage of identifiable items.
    if (!hasCollision && keys.size >= maxIdentifiable) {
      return depth
    }
  }

  // Even title collides — return weakest possible depth.
  return 'title'
}

// Compute all available hashes for a feed item. Returns only the hashes
// that can be computed (undefined fields omitted).
export const computeItemHashes = <TItem extends HashableItem>(item: TItem): ItemHashes => {
  const hashes: ItemHashes = {}

  for (const meta of hashMeta) {
    const normalized = meta.normalizeFn(item)

    if (normalized) {
      hashes[meta.key] = generateHash(normalized)
    }
  }

  return hashes
}
