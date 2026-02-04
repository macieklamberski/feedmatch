export { classifyItems } from './classifier.js'
export {
  composeItemIdentifier,
  computeItemHashes,
  normalizeEnclosureForHashing,
  normalizeGuidForHashing,
  normalizeGuidFragmentForHashing,
  normalizeHtmlForHashing,
  normalizeLinkForHashing,
  normalizeLinkFragmentForHashing,
  normalizeTextForHashing,
  resolveIdentityDepth,
} from './hashes.js'
export { identityLevels } from './meta.js'
export {
  composeItemIdentifiers,
  computeAllHashes,
  deduplicateItemsByIdentifier,
  filterItemsWithIdentifier,
} from './pipeline.js'
export type {
  ClassifyItemsInput,
  ClassifyItemsResult as ClassificationResult,
  ComposedFeedItem,
  HashableItem,
  HashedFeedItem,
  IdentityDepth,
  InsertAction,
  ItemHashes,
  MatchableItem,
  MatchSource,
  UpdateAction,
} from './types.js'
export { identityDepths } from './types.js'
