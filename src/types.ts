// Fingerprint levels, strongest → weakest.
export const fingerprintLevels = [
  'guid',
  'guidFragment',
  'link',
  'linkFragment',
  'enclosure',
  'title',
] as const

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
  enclosureHash: string | null
  titleHash: string | null
  summaryHash: string | null
  contentHash: string | null
}

// Minimal shape for existing items — what matching + change detection need.
export type ExistingItem = {
  id: string
  guidHash: string | null
  guidFragmentHash: string | null
  linkHash: string | null
  linkFragmentHash: string | null
  enclosureHash: string | null
  titleHash: string | null
  summaryHash: string | null
  contentHash: string | null
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
