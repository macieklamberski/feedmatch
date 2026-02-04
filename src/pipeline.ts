import { composeItemIdentifier, computeItemHashes } from './hashes.js'
import { hashMeta } from './meta.js'
import type {
  ComposedFeedItem,
  HashableItem,
  HashedFeedItem,
  IdentifiedFeedItem,
  IdentityDepth,
  ItemHashes,
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

// Step 1: Map each item to its computed hashes.
export const computeAllHashes = <TItem extends HashableItem>(
  items: Array<TItem>,
): Array<HashedFeedItem<TItem>> => {
  return items.map((item) => ({ item, hashes: computeItemHashes(item) }))
}

// Step 2: Remove items where identifier is undefined.
export const filterItemsWithIdentifier = <TItem>(
  items: Array<ComposedFeedItem<TItem>>,
): Array<IdentifiedFeedItem<TItem>> => {
  return items.filter((item): item is IdentifiedFeedItem<TItem> => item.identifier !== undefined)
}

// Best-copy helper: keep the richer item (more hash slots populated).
// On tie, keep existing (earlier — deterministic).
const keepBest = <TItem>(
  map: Map<string, IdentifiedFeedItem<TItem>>,
  key: string,
  item: IdentifiedFeedItem<TItem>,
): void => {
  const existing = map.get(key)

  if (!existing || scoreItem(item.hashes) > scoreItem(existing.hashes)) {
    map.set(key, item)
  }
}

// Step 2b: Compose identifiers for all hashed items at a given depth.
export const composeItemIdentifiers = <TItem>(
  items: Array<HashedFeedItem<TItem>>,
  depth: IdentityDepth,
): Array<ComposedFeedItem<TItem>> => {
  return items.map((item) => ({
    ...item,
    identifier: composeItemIdentifier(item.hashes, depth),
  }))
}

// Step 3: Best-copy-wins dedup by identifier.
export const deduplicateItemsByIdentifier = <TItem>(
  items: Array<IdentifiedFeedItem<TItem>>,
): Array<IdentifiedFeedItem<TItem>> => {
  const bestByIdentifier = new Map<string, IdentifiedFeedItem<TItem>>()

  for (const item of items) {
    keepBest(bestByIdentifier, item.identifier, item)
  }

  return [...bestByIdentifier.values()]
}
