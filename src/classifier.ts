import { hashMeta } from './constants.js'
import {
  buildFingerprint,
  computeItemHashes,
  generateHash,
  resolveFingerprintLevel,
} from './hashes.js'
import { findMatchCandidates, selectMatchingItem, updateFilters } from './matching.js'
import { computeFeedProfile } from './profile.js'
import type {
  ClassifyItemsInput,
  ClassifyItemsResult,
  FingerprintedItem,
  FingerprintLevel,
  InsertAction,
  ItemHashes,
  ItemWithHashes,
  NewItem,
  UpdateAction,
} from './types.js'

// Score an item by how many hash slots are populated, weighted by signal strength.
export const scoreItem = (hashes: ItemHashes): number => {
  let score = 0

  for (const { key, weight } of hashMeta) {
    if (hashes[key]) {
      score += weight
    }
  }

  return score
}

export const composeHashedItems = (items: Array<NewItem>): Array<ItemWithHashes> => {
  return items.map((item) => ({ ...item, ...computeItemHashes(item) }))
}

// Build fingerprints for all hashed items at a given level.
// Items that produce no fingerprint (no hashes in prefix) are dropped.
export const buildFingerprints = (
  items: Array<ItemWithHashes>,
  level: FingerprintLevel,
): Array<FingerprintedItem> => {
  const result: Array<FingerprintedItem> = []

  for (const item of items) {
    const fingerprint = buildFingerprint(item, level)

    if (fingerprint) {
      result.push({ ...item, fingerprint })
    }
  }

  return result
}

export const deduplicateItemsByFingerprint = (
  items: Array<FingerprintedItem>,
): Array<FingerprintedItem> => {
  const bestByFingerprint = new Map<string, FingerprintedItem>()

  for (const item of items) {
    const existing = bestByFingerprint.get(item.fingerprint)

    if (!existing || scoreItem(item) > scoreItem(existing)) {
      bestByFingerprint.set(item.fingerprint, item)
    }
  }

  return [...bestByFingerprint.values()]
}

// Classify new items against existing items into inserts/updates.
// Uses level-based fingerprinting with auto-computed level when not provided.
export const classifyItems = (input: ClassifyItemsInput): ClassifyItemsResult => {
  const { newItems, existingItems, fingerprintLevel: inputLevel } = input

  const hashedNewItems = composeHashedItems(newItems)

  // Compute profile early — used for both pre-match exclusion and final
  // classification. Uses raw (not deduped) incoming hashes; duplicates
  // lower uniqueness slightly, which is conservative (fewer link matches).
  const feedProfile = computeFeedProfile(existingItems, hashedNewItems)
  const linkUniquenessRate = feedProfile.link.uniquenessRate

  // Pre-match: find existing items that are true updates and exclude them
  // from the level collision set. A match is "strong enough" when it's by
  // guid, enclosure, or title — those are unambiguously the same item. A
  // link match is only trusted when the max-level fingerprints agree (true
  // duplicate); a bare link match with different titles could be hub onset
  // and must stay in the collision set so the level can detect it.
  const matchedExistingIds = new Set<string>()

  for (const hashedItem of hashedNewItems) {
    const candidates = findMatchCandidates(hashedItem, existingItems)
    const result = selectMatchingItem({
      incoming: hashedItem,
      candidates,
      linkUniquenessRate,
    })

    if (!result) {
      continue
    }

    if (result.matchedBy !== 'link') {
      matchedExistingIds.add(result.match.id)
      continue
    }

    // Link match: only exclude when max-level fingerprints agree (true duplicate).
    const incomingMaxKey = buildFingerprint(hashedItem, 'title')
    const existingMaxKey = buildFingerprint(result.match, 'title')

    if (incomingMaxKey === existingMaxKey) {
      matchedExistingIds.add(result.match.id)
    }
  }

  const unmatchedExistingItems = existingItems.filter((item) => {
    return !matchedExistingIds.has(item.id)
  })

  // Dedup by max-level fingerprint so identity-equivalent items (literal
  // duplicates, or same item with slightly different hash coverage) don't
  // cause false downgrades. Items with no level identity are skipped.
  const seenKeys = new Set<string>()
  const levelHashes = [...hashedNewItems, ...unmatchedExistingItems].filter((item) => {
    const maxKey = buildFingerprint(item, 'title')

    if (!maxKey) {
      return false
    }

    if (seenKeys.has(maxKey)) {
      return false
    }

    seenKeys.add(maxKey)

    return true
  })

  // Resolve fingerprint level: validate/downgrade if provided, compute from data otherwise.
  const resolvedLevel = resolveFingerprintLevel(levelHashes, inputLevel)

  // Build fingerprinted items at the resolved level.
  const fingerprintedItems = buildFingerprints(hashedNewItems, resolvedLevel)
  const deduplicatedItems = deduplicateItemsByFingerprint(fingerprintedItems)

  // Classify against existing items.
  const inserts: Array<InsertAction> = []
  const updates: Array<UpdateAction> = []

  for (const fingerprintedItem of deduplicatedItems) {
    const { fingerprint, ...item } = fingerprintedItem
    const fingerprintHash = generateHash(fingerprint)
    const candidates = findMatchCandidates(item, existingItems)

    // Reject candidates whose fingerprint differs from the incoming item.
    // This prevents matching (and merging) items that the levels consider distinct.
    const levelFilteredCandidates = candidates.filter((candidate) => {
      return buildFingerprint(candidate, resolvedLevel) === fingerprint
    })

    const result = selectMatchingItem({
      incoming: item,
      candidates: levelFilteredCandidates,
      linkUniquenessRate,
    })

    if (!result) {
      inserts.push({
        item,
        fingerprintHash,
      })

      continue
    }

    const shouldUpdate = updateFilters.every((filter) => {
      return filter.shouldUpdate({
        existing: result.match,
        incoming: item,
        matchedBy: result.matchedBy,
      })
    })

    if (shouldUpdate) {
      updates.push({
        item,
        fingerprintHash,
        existingItemId: result.match.id,
        matchedBy: result.matchedBy,
      })
    }
  }

  return { inserts, updates, fingerprintLevel: resolvedLevel }
}
