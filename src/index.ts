export {
  buildFingerprints,
  classifyItems,
  composeIncomingItems as computeAllHashes,
  deduplicateItemsByFingerprint,
} from './classifier.js'
export { fingerprintLevelMeta, fingerprintLevels } from './constants.js'
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
  ExistingItem,
  FingerprintedItem,
  FingerprintLevel,
  IncomingItem,
  InsertAction,
  ItemHashes,
  MatchedBy,
  NewItem,
  UpdateAction,
} from './types.js'
