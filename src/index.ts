export {
  buildFingerprints,
  classifyItems,
  composeIncomingItems as computeAllHashes,
  deduplicateItemsByFingerprint,
} from './classifier.js'
export { fingerprintLevels, fingerprintMeta } from './constants.js'
export {
  buildFingerprint,
  computeItemHashes,
  normalizeEnclosureForHashing,
  normalizeGuidForHashing,
  normalizeGuidFragmentForHashing,
  normalizeHtmlForHashing,
  normalizeLinkForHashing,
  normalizeLinkFragmentForHashing,
  normalizeTextForHashing,
  resolveFingerprintLevel,
} from './hashes.js'
export type {
  ClassifyItemsInput,
  ClassifyItemsResult,
  CleanUrlFn,
  ExistingItem,
  FingerprintedItem,
  FingerprintLevel,
  IncomingItem,
  InsertAction,
  ItemHashes,
  ItemIdLike,
  MatchedBy,
  NewItem,
  Nullish,
  UpdateAction,
} from './types.js'
