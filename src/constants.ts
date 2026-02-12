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
  MatchedBy,
} from './types.js'

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
export const hashMeta: Array<HashMeta> = [
  {
    key: 'guidHash',
    tag: 'g',
    weight: 32,
    isStrongHash: true,
    isMatchable: true,
    isContent: false,
    normalizeFn: (item) => normalizeGuidForHashing(item.guid),
    level: 'guid',
  },
  {
    key: 'guidFragmentHash',
    tag: 'gf',
    weight: 0,
    isStrongHash: false,
    isMatchable: false,
    isContent: false,
    normalizeFn: (item) => normalizeGuidFragmentForHashing(item.guid),
    level: 'guidFragment',
  },
  {
    key: 'linkHash',
    tag: 'l',
    weight: 8,
    isStrongHash: true,
    isMatchable: true,
    isContent: false,
    normalizeFn: (item) => normalizeLinkForHashing(item.link),
    level: 'link',
  },
  {
    key: 'linkFragmentHash',
    tag: 'lf',
    weight: 0,
    isStrongHash: false,
    isMatchable: false,
    isContent: false,
    normalizeFn: (item) => normalizeLinkFragmentForHashing(item.link),
    level: 'linkFragment',
  },
  {
    key: 'enclosureHash',
    tag: 'e',
    weight: 16,
    isStrongHash: true,
    isMatchable: true,
    isContent: true,
    normalizeFn: (item) => normalizeEnclosureForHashing(item.enclosures),
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
]

// Derived from hashMeta — entries with level form the fingerprint level metadata.
export const fingerprintMeta: Array<FingerprintMeta> = hashMeta
  .filter((meta): meta is HashMeta & { level: FingerprintLevel } => {
    return meta.level !== undefined
  })
  .map((meta) => {
    return { level: meta.level, key: meta.key, tag: meta.tag }
  })

// All hash keys derived from hashMeta.
export const hashKeys: Array<HashKey> = hashMeta.map((meta) => meta.key)

// Signal-to-hash-key mapping for the four matchable signals.
export const signalHashKeys: Array<[MatchedBy, keyof ItemHashes]> = hashMeta
  .filter((meta) => meta.isMatchable)
  .map((meta) => [meta.level as MatchedBy, meta.key])
