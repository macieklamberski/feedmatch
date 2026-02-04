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

export type ItemWithHashes = NewItem & ItemHashes

export type ExistingItem = ItemWithHashes & {
  id: string
}

export type FingerprintedItem = ItemWithHashes & {
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
  incoming: ItemWithHashes
  candidates: Array<ExistingItem>
  filtered: (matchedBy: MatchedBy, candidates: Array<ExistingItem>) => Array<ExistingItem>
}

export type InsertAction = {
  item: ItemWithHashes
  fingerprintHash: string
}

export type UpdateAction = {
  item: ItemWithHashes
  fingerprintHash: string
  existingItemId: string
  matchedBy: MatchedBy
}

export type CandidateFilterContext = {
  matchedBy: MatchedBy
  incoming: ItemWithHashes
  candidate: ExistingItem
  channel: { linkUniquenessRate: number }
}

export type CandidateFilterResult = { allow: true } | { allow: false; reason: string }

export type CandidateFilter = {
  name: string
  appliesTo: Array<MatchedBy> | 'all'
  evaluate: (context: CandidateFilterContext) => CandidateFilterResult
}

export type UpdateFilterContext = {
  existing: ExistingItem
  incoming: ItemWithHashes
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
