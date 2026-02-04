export { classifyItems } from './classifier.js'
export {
  composeIdentifier,
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
  computeAllHashes,
  deduplicateByIdentifier,
  filterWithIdentifier,
} from './pipeline.js'
export type {
  ClassifyItemsInput,
  ClassifyItemsResult as ClassificationResult,
  HashableItem,
  HashedFeedItem,
  IdentityDepth,
  InsertAction,
  ItemHashes,
  KeyedFeedItem,
  MatchableItem,
  MatchSource,
  UpdateAction,
} from './types.js'
export { identityDepths } from './types.js'
