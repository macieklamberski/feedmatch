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
  isMediaEnclosure,
  normalizeEnclosureForHashing,
  normalizeGuidForHashing,
  normalizeGuidFragmentForHashing,
  normalizeHtmlForHashing,
  normalizeLinkForHashing,
  normalizeLinkFragmentForHashing,
  normalizeTextForHashing,
  resolveFingerprintLevel,
  selectEnclosure,
} from './hashes.js'
export type {
  ClassifyItemsInput,
  ClassifyItemsResult,
  CleanUrlFn,
  Enclosure,
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
