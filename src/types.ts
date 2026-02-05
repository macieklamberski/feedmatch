import type { fingerprintLevels } from './constants.js'

export type FingerprintLevel = (typeof fingerprintLevels)[number]

export type NewItem = {
  guid?: string
  link?: string
  title?: string
  summary?: string
  content?: string
  enclosures?: Array<{ url?: string; isDefault?: boolean }>
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

export type IncomingItem = NewItem & ItemHashes

export type ExistingItem = ItemHashes & {
  id: string
}

export type FingerprintedItem = IncomingItem & {
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
  normalizeFn: (item: NewItem) => string | undefined
  level?: FingerprintLevel
}

export type FingerprintLevelMeta = {
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

export type FeedProfile = {
  guid: FeedProfileSignal
  link: FeedProfileSignal
  enclosure: FeedProfileSignal
  title: FeedProfileSignal
}

export type MatchedBy = 'guid' | 'link' | 'enclosure' | 'title'

export type MatchResult = {
  match: ExistingItem
  matchedBy: MatchedBy
}

export type MatchStrategyResult =
  | { outcome: 'matched'; result: MatchResult }
  | { outcome: 'ambiguous'; source: MatchedBy; count: number }
  | { outcome: 'pass' }

export type MatchStrategyContext = {
  incoming: IncomingItem
  candidates: Array<ExistingItem>
  filtered: (matchedBy: MatchedBy, candidates: Array<ExistingItem>) => Array<ExistingItem>
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
}

export type InsertAction = {
  item: IncomingItem
  fingerprintHash: string
}

export type UpdateAction = {
  item: IncomingItem
  fingerprintHash: string
  existingItemId: string
  matchedBy: MatchedBy
}

export type CandidateFilterContext = {
  matchedBy: MatchedBy
  incoming: IncomingItem
  candidate: ExistingItem
  matchPolicy: MatchPolicy
}

export type CandidateFilterResult = { allow: true } | { allow: false; reason: string }

export type CandidateFilter = {
  name: string
  appliesTo: Array<MatchedBy> | 'all'
  evaluate: (context: CandidateFilterContext) => CandidateFilterResult
}

export type UpdateFilterContext = {
  existing: ExistingItem
  incoming: IncomingItem
  matchedBy: MatchedBy
}

export type UpdateFilter = {
  name: string
  shouldUpdate: (context: UpdateFilterContext) => boolean
}

export type ClassifyItemsInput = {
  newItems: Array<NewItem>
  existingItems: Array<ExistingItem>
  fingerprintLevel?: FingerprintLevel
}

export type ClassifyItemsResult = {
  inserts: Array<InsertAction>
  updates: Array<UpdateAction>
  fingerprintLevel: FingerprintLevel
}
