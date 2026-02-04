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

export type ExistingItem = ItemHashes & {
  id: string
}

export type FingerprintedItem<TItem> = {
  item: TItem
  hashes: ItemHashes
  fingerprint: string
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
  hashes: ItemHashes
  candidates: Array<ExistingItem>
  filtered: (matchedBy: MatchedBy, candidates: Array<ExistingItem>) => Array<ExistingItem>
}

export type InsertAction<TItem> = {
  item: TItem
  hashes: ItemHashes
  fingerprintHash: string
}

export type UpdateAction<TItem> = {
  item: TItem
  hashes: ItemHashes
  fingerprintHash: string
  existingItemId: string
  matchedBy: MatchedBy
}

export type CandidateFilterContext = {
  matchedBy: MatchedBy
  incoming: { hashes: ItemHashes }
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
  incomingHashes: ItemHashes
  matchedBy: MatchedBy
}

export type UpdateFilter = {
  name: string
  shouldUpdate: (context: UpdateFilterContext) => boolean
}

export type ClassifyItemsInput<TItem extends NewItem = NewItem> = {
  newItems: Array<TItem>
  existingItems: Array<ExistingItem>
  fingerprintLevel?: FingerprintLevel
}

export type ClassifyItemsResult<TItem> = {
  inserts: Array<InsertAction<TItem>>
  updates: Array<UpdateAction<TItem>>
  fingerprintLevel: FingerprintLevel
}
