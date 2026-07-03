import {
  normalizeEnclosureForHashing,
  normalizeGuidForHashing,
  normalizeGuidFragmentForHashing,
  normalizeHtmlForHashing,
  normalizeLinkForHashing,
  normalizeLinkFragmentForHashing,
  normalizeTextForHashing,
} from './normalize.js'
import type {
  FingerprintLevel,
  FingerprintMeta,
  HashKey,
  HashMeta,
  ItemHashes,
  MatchSignal,
} from './types.js'

// Minimum number of content hash fields (title, content, summary, enclosure)
// that must be non-null on both sides and match for reconciliation to accept
// a merge. Items with fewer matching fields are too sparse to safely merge
// (e.g. two items with only the same generic title like "Newsletter").
export const minReconciliationFields = 2

// Minimum feed-wide uniqueness rate for a signal to be trusted as an item
// identifier. Gates both link reliability in computeMatchPolicy (which match
// strategy order to use) and the guid agreement bypass in the level filter
// (two items sharing a guid on such a feed are the same logical item; below
// the gate the feed reuses the signal, so agreement proves nothing).
export const uniqueIdentifierThreshold = 0.95

export const fingerprintLevels = [
  'guid',
  'guidFragment',
  'link',
  'linkFragment',
  'enclosure',
  'title',
] as const

// Single source of truth for hash key metadata.
// Order determines fingerprintMeta derivation order.
export const hashMeta = [
  {
    key: 'guidHash',
    tag: 'g',
    weight: 32,
    isStrongHash: true,
    isMatchable: true,
    isContent: false,
    normalizeFn: (item, cleanUrlFn) => normalizeGuidForHashing(item.guid, cleanUrlFn),
    level: 'guid',
  },
  {
    key: 'guidFragmentHash',
    tag: 'gf',
    weight: 0,
    isStrongHash: false,
    isMatchable: false,
    isContent: false,
    normalizeFn: (item, cleanUrlFn) => normalizeGuidFragmentForHashing(item.guid, cleanUrlFn),
    level: 'guidFragment',
  },
  {
    key: 'linkHash',
    tag: 'l',
    weight: 8,
    isStrongHash: true,
    isMatchable: true,
    isContent: false,
    normalizeFn: (item, cleanUrlFn) => normalizeLinkForHashing(item.link, cleanUrlFn),
    level: 'link',
  },
  {
    key: 'linkFragmentHash',
    tag: 'lf',
    weight: 0,
    isStrongHash: false,
    isMatchable: false,
    isContent: false,
    normalizeFn: (item, cleanUrlFn) => normalizeLinkFragmentForHashing(item.link, cleanUrlFn),
    level: 'linkFragment',
  },
  {
    key: 'enclosureHash',
    tag: 'e',
    weight: 16,
    isStrongHash: true,
    isMatchable: true,
    isContent: true,
    normalizeFn: (item, cleanUrlFn) => normalizeEnclosureForHashing(item.enclosures, cleanUrlFn),
    level: 'enclosure',
  },
  {
    key: 'titleHash',
    tag: 't',
    weight: 4,
    isStrongHash: false,
    isMatchable: true,
    isContent: true,
    normalizeFn: (item) => normalizeTextForHashing(item.title),
    level: 'title',
  },
  {
    key: 'contentHash',
    tag: 'c',
    weight: 2,
    isStrongHash: false,
    isMatchable: false,
    isContent: true,
    normalizeFn: (item) => normalizeHtmlForHashing(item.content),
  },
  {
    key: 'summaryHash',
    tag: 's',
    weight: 1,
    isStrongHash: false,
    isMatchable: false,
    isContent: true,
    normalizeFn: (item) => normalizeHtmlForHashing(item.summary),
  },
] as const satisfies ReadonlyArray<HashMeta>

// A single hashMeta entry, and the subset that participates in matching.
export type HashMetaEntry = (typeof hashMeta)[number]
export type HashMetaMatchableEntry = Extract<HashMetaEntry, { isMatchable: true }>

// Derived from hashMeta — entries with level form the fingerprint level metadata.
export const fingerprintMeta: Array<FingerprintMeta> = hashMeta
  .filter((meta): meta is Extract<HashMetaEntry, { level: FingerprintLevel }> => {
    return 'level' in meta
  })
  .map((meta) => {
    return { level: meta.level, key: meta.key, tag: meta.tag }
  })

// All hash keys derived from hashMeta.
export const hashKeys: Array<HashKey> = hashMeta.map((meta) => meta.key)

// Signal-to-hash-key mapping for the matchable signals.
export const signalHashKeys: Array<[MatchSignal, keyof ItemHashes]> = hashMeta
  .filter((meta): meta is HashMetaMatchableEntry => {
    return meta.isMatchable
  })
  .map((meta) => [meta.level, meta.key])

// Pre-computed fingerprint prefix arrays per level (avoids findIndex + slice per call).
export const fingerprintPrefixByLevel = new Map<FingerprintLevel, Array<FingerprintMeta>>(
  fingerprintMeta.map((entry, index) => [entry.level, fingerprintMeta.slice(0, index + 1)]),
)
