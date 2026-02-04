// Identity depths, strongest → weakest.
export const identityDepths = [
  'guid',
  'guidFragment',
  'link',
  'linkFragment',
  'enclosure',
  'title',
] as const

export type IdentityDepth = (typeof identityDepths)[number]

export type HashableItem = {
  guid?: string
  link?: string
  title?: string
  summary?: string
  content?: string
  enclosures?: Array<{ url?: string; isDefault?: boolean }>
}

export type ItemHashes = {
  guidHash?: string
  guidFragmentHash?: string
  linkHash?: string
  linkFragmentHash?: string
  enclosureHash?: string
  titleHash?: string
  summaryHash?: string
  contentHash?: string
}

// Minimal shape for existing items — what matching + change detection need.
export type MatchableItem = {
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

export type HashedFeedItem<TItem> = {
  item: TItem
  hashes: ItemHashes
}

export type ComposedFeedItem<TItem> = HashedFeedItem<TItem> & {
  identifier: string | undefined
}

// ComposedFeedItem after filterItemsWithIdentifier — identifier is guaranteed set.
export type IdentifiedFeedItem<TItem> = HashedFeedItem<TItem> & {
  identifier: string
}

export type FeedProfile = {
  linkUniquenessRate: number
}

export type MatchSource = 'guid' | 'link' | 'enclosure' | 'title'

export type MatchResult = {
  match: MatchableItem
  identifierSource: MatchSource
}

export type TierResult =
  | { outcome: 'matched'; result: MatchResult }
  | { outcome: 'ambiguous'; identifierSource: MatchSource; count: number }
  | { outcome: 'pass' }

export type TierContext = {
  hashes: ItemHashes
  candidates: Array<MatchableItem>
  filtered: (
    identifierSource: MatchSource,
    candidates: Array<MatchableItem>,
  ) => Array<MatchableItem>
}

export type InsertAction<TItem> = {
  item: TItem
  hashes: ItemHashes
  identifierHash: string
}

export type UpdateAction<TItem> = {
  item: TItem
  hashes: ItemHashes
  identifierHash: string
  existingItemId: string
  identifierSource: MatchSource
}

export type CandidateFilterContext = {
  identifierSource: MatchSource
  incoming: { hashes: ItemHashes }
  candidate: MatchableItem
  channel: { linkUniquenessRate: number }
}

export type CandidateFilterResult = { allow: true } | { allow: false; reason: string }

export type CandidateFilter = {
  name: string
  appliesTo: Array<MatchSource> | 'all'
  evaluate: (context: CandidateFilterContext) => CandidateFilterResult
}

export type UpdateFilterContext = {
  existing: MatchableItem
  incomingHashes: ItemHashes
  identifierSource: MatchSource
}

export type UpdateFilter = {
  name: string
  shouldUpdate: (context: UpdateFilterContext) => boolean
}

export type ClassifyItemsInput<TItem extends HashableItem = HashableItem> = {
  newItems: Array<TItem>
  existingItems: Array<MatchableItem>
  identityDepth?: IdentityDepth
}

export type ClassifyItemsResult<TItem> = {
  inserts: Array<InsertAction<TItem>>
  updates: Array<UpdateAction<TItem>>
  identityDepth: IdentityDepth
}
