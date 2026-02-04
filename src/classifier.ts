import { updateFilters } from './filters.js'
import { composeItemIdentifier, resolveIdentityDepth } from './hashes.js'
import { generateHash, isDefined } from './helpers.js'
import { computeFeedProfile, findMatchCandidates, selectMatchingItem } from './matching.js'
import { hashKeys } from './meta.js'
import {
  composeItemIdentifiers,
  computeAllHashes,
  deduplicateItemsByIdentifier,
  filterItemsWithIdentifier,
} from './pipeline.js'
import type {
  ClassifyItemsInput,
  ClassifyItemsResult,
  HashableItem,
  InsertAction,
  ItemHashes,
  MatchableItem,
  UpdateAction,
} from './types.js'

// Convert MatchableItem (string | null) to ItemHashes (string | undefined).
const toItemHashes = (item: MatchableItem): ItemHashes => {
  const hashes: ItemHashes = {}

  for (const key of hashKeys) {
    const value = item[key]

    if (value) {
      hashes[key] = value
    }
  }

  return hashes
}

// Classify new items against existing items into inserts/updates.
// Uses level-based identity with auto-computed depth when not provided.
export const classifyItems = <TItem extends HashableItem>(
  input: ClassifyItemsInput<TItem>,
): ClassifyItemsResult<TItem> => {
  const { newItems, existingItems, identityDepth: inputDepth } = input

  const hashedNewItems = computeAllHashes(newItems)
  const newItemsHashes = hashedNewItems.map((item) => item.hashes)

  // Compute profile early — used for both pre-match exclusion and final
  // classification. Uses raw (not deduped) incoming link hashes; duplicates
  // lower uniqueness slightly, which is conservative (fewer link matches).
  const newItemsLinkHashes = newItemsHashes.map((hashes) => hashes.linkHash).filter(isDefined)
  const profile = computeFeedProfile(existingItems, newItemsLinkHashes)

  // Pre-match: find existing items that are true updates and exclude them
  // from the depth collision set. A match is "strong enough" when it's by
  // guid, enclosure, or title — those are unambiguously the same item. A
  // link match is only trusted when the max-depth identifiers agree (true
  // duplicate); a bare link match with different titles could be hub onset
  // and must stay in the collision set so the depth can detect it.
  const matchedExistingIds = new Set<string>()

  for (const newItemHashes of newItemsHashes) {
    const candidates = findMatchCandidates(newItemHashes, existingItems)
    const result = selectMatchingItem({
      hashes: newItemHashes,
      candidates,
      linkUniquenessRate: profile.linkUniquenessRate,
    })

    if (!result) {
      continue
    }

    if (result.identifierSource !== 'link') {
      matchedExistingIds.add(result.match.id)
      continue
    }

    // Link match: only exclude when max-depth identifiers agree (true duplicate).
    const incomingMaxKey = composeItemIdentifier(newItemHashes, 'title')
    const existingMaxKey = composeItemIdentifier(toItemHashes(result.match), 'title')

    if (incomingMaxKey === existingMaxKey) {
      matchedExistingIds.add(result.match.id)
    }
  }

  const unmatchedExistingItemsHashes = existingItems
    .filter((item) => !matchedExistingIds.has(item.id))
    .map(toItemHashes)

  // Dedup by max-depth identifier so identity-equivalent items (literal
  // duplicates, or same item with slightly different hash coverage) don't
  // cause false downgrades. Items with no level identity are skipped.
  const seenKeys = new Set<string>()
  const depthHashes = [...newItemsHashes, ...unmatchedExistingItemsHashes].filter((hashes) => {
    const maxKey = composeItemIdentifier(hashes, 'title')

    if (!maxKey) {
      return false
    }

    if (seenKeys.has(maxKey)) {
      return false
    }

    seenKeys.add(maxKey)

    return true
  })

  // Resolve identity depth: validate/downgrade if provided, compute from data otherwise.
  const resolvedDepth = resolveIdentityDepth(depthHashes, inputDepth)

  // Build composed items using level identity at the resolved depth.
  const composedItems = composeItemIdentifiers(hashedNewItems, resolvedDepth)
  const identifiedItems = filterItemsWithIdentifier(composedItems)
  const deduplicatedItems = deduplicateItemsByIdentifier(identifiedItems)

  // Classify against existing items.
  const inserts: Array<InsertAction<TItem>> = []
  const updates: Array<UpdateAction<TItem>> = []

  for (const item of deduplicatedItems) {
    const identifierHash = generateHash(item.identifier)
    const candidates = findMatchCandidates(item.hashes, existingItems)

    // Reject candidates whose identifier differs from the incoming item.
    // This prevents matching (and merging) items that the levels consider distinct.
    const depthFilteredCandidates = candidates.filter((candidate) => {
      return composeItemIdentifier(toItemHashes(candidate), resolvedDepth) === item.identifier
    })

    const result = selectMatchingItem({
      hashes: item.hashes,
      candidates: depthFilteredCandidates,
      linkUniquenessRate: profile.linkUniquenessRate,
    })

    if (!result) {
      inserts.push({
        item: item.item,
        hashes: item.hashes,
        identifierHash,
      })

      continue
    }

    const shouldUpdate = updateFilters.every((filter) => {
      return filter.shouldUpdate({
        existing: result.match,
        incomingHashes: item.hashes,
        identifierSource: result.identifierSource,
      })
    })

    if (shouldUpdate) {
      updates.push({
        item: item.item,
        hashes: item.hashes,
        identifierHash,
        existingItemId: result.match.id,
        identifierSource: result.identifierSource,
      })
    }
  }

  return { inserts, updates, identityDepth: resolvedDepth }
}
