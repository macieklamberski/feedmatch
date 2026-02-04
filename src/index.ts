export { classifyItems } from './classifier.js'
export { contentChangeGate, enclosureConflictGate } from './gates.js'
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
  CandidateGate,
  CandidateGateContext,
  CandidateGateResult,
  ClassifyItemsInput,
  ClassifyItemsResult as ClassificationResult,
  ClassifyPolicy,
  HashableItem,
  HashedFeedItem,
  IdentityDepth,
  InsertAction,
  ItemHashes,
  KeyedFeedItem,
  MatchableItem,
  MatchSource,
  UpdateAction,
  UpdateGate,
  UpdateGateContext,
} from './types.js'
export { identityDepths } from './types.js'
