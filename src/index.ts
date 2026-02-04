export {
  buildFingerprints,
  classifyItems,
  computeAllHashes,
  deduplicateItemsByFingerprint,
} from './classifier.js'
export {
  buildFingerprint,
  computeItemHashes,
  fingerprintLevelMeta,
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
  ExistingItem,
  FingerprintedItem,
  FingerprintLevel,
  InsertAction,
  ItemHashes,
  MatchedBy,
  NewItem,
  UpdateAction,
} from './types.js'
export { fingerprintLevels } from './types.js'
