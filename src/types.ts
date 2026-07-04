import type { fingerprintLevels, HashMetaMatchableEntry } from './constants.js'

export type Nullish<T> = T | null | undefined

export type CleanUrlFn = (url: string) => string

export type FingerprintLevel = (typeof fingerprintLevels)[number]

export type ItemIdLike = string | number

export type Enclosure = {
  url?: string
  isDefault?: boolean
  type?: string | null
}

export type NewItem = {
  guid?: string | null
  link?: string | null
  title?: string | null
  summary?: string | null
  content?: string | null
  enclosures?: Array<Enclosure> | null
  publishedAt?: Date | null
}

export type ItemHashes = {
  guidHash: string | null
  guidFragmentHash: string | null
  linkHash: string | null
  linkFragmentHash: string | null
  titleHash: string | null
  summaryHash: string | null
  contentHash: string | null
  enclosureHash: string | null
}

export type IncomingItem<T extends NewItem = NewItem> = T & ItemHashes

export type ExistingItem = ItemHashes & {
  id: ItemIdLike
  publishedAt?: Date
  // Raw enclosures as stored by the caller. When present, the classifier checks
  // their type to decide whether the stored item's enclosure counts toward
  // identity or is excluded from it. When absent, there is no type to check, so
  // the stored item reuses the decision made for the incoming item.
  enclosures?: Array<Enclosure> | null
}

export type FingerprintedItem<T extends NewItem = NewItem> = IncomingItem<T> & {
  fingerprint: string
}

export type HashKey = keyof ItemHashes

export type HashMeta = {
  key: HashKey
  tag: string
  weight: number
  isStrongHash: boolean
  isMatchable: boolean
  isContent: boolean
  normalizeFn: (item: NewItem, cleanUrlFn?: CleanUrlFn) => string | undefined
  level?: FingerprintLevel
}

export type FingerprintMeta = {
  level: FingerprintLevel
  key: HashKey
  tag: string
}

export type FeedProfileStats = {
  present: number
  total: number
  presenceRate: number
  distinct: number
  uniquenessRate: number
}

export type FeedProfileSignal = {
  existing: FeedProfileStats
  incoming: FeedProfileStats
  effective: {
    presenceRate: number
    uniquenessRate: number
  }
}

export type FeedProfile = { [Key in MatchSignal]: FeedProfileSignal }

// The matchable signals, derived from hashMeta so the set stays in sync: the
// level of every matchable hash (guid, link, enclosure, title). Fragments and
// content hashes are not matchable and so are excluded.
export type MatchSignal = HashMetaMatchableEntry['level']

export type MatchedBy = MatchSignal | 'reconciled'

export type MatchResult = {
  match: ExistingItem
  matchedBy: MatchedBy
}

export type MatchStrategyResult =
  | { outcome: 'matched'; result: MatchResult }
  | { outcome: 'ambiguous'; source: MatchSignal; count: number }
  | { outcome: 'pass' }

export type MatchStrategyContext = {
  incoming: IncomingItem
  candidates: Array<ExistingItem>
  filtered: (matchedBy: MatchSignal, candidates: Array<ExistingItem>) => Array<ExistingItem>
}

export type MatchStrategyGateContext = {
  incoming: IncomingItem
}

export type MatchStrategy = {
  execute: (context: MatchStrategyContext) => MatchStrategyResult
  gate?: (context: MatchStrategyGateContext) => boolean
}

export type MatchPolicy = {
  linkReliable: boolean
  dateProximityDays: number
}

export type InsertAction<T extends NewItem = NewItem> = {
  item: IncomingItem<T>
  fingerprintHash: string
}

export type UpdateAction<T extends NewItem = NewItem> = {
  item: IncomingItem<T>
  fingerprintHash: string
  existingItemId: ItemIdLike
  matchedBy: MatchedBy
}

export type CandidateFilterContext = {
  matchedBy: MatchSignal
  incoming: IncomingItem
  candidate: ExistingItem
  matchPolicy: MatchPolicy
}

export type CandidateFilterResult = { allow: true } | { allow: false; reason: string }

export type CandidateFilter = {
  name: string
  appliesTo: Array<MatchSignal>
  evaluate: (context: CandidateFilterContext) => CandidateFilterResult
}

export type UpdateFilterContext = {
  incoming: IncomingItem
  existing: ExistingItem
  matchedBy: MatchedBy
}

export type UpdateFilter = {
  name: string
  shouldUpdate: (context: UpdateFilterContext) => boolean
}

export type ClassifyItemsInput<T extends NewItem = NewItem> = {
  newItems: Array<T>
  existingItems: Array<ExistingItem>
  fingerprintLevel?: FingerprintLevel
  cleanUrlFn?: CleanUrlFn
}

export type ClassifyItemsResult<T extends NewItem = NewItem> = {
  inserts: Array<InsertAction<T>>
  updates: Array<UpdateAction<T>>
  fingerprintLevel: FingerprintLevel
}
