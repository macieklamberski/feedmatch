import { hashMeta } from './meta.js'
import type {
  CandidateFilter,
  CandidateFilterContext,
  ItemHashes,
  MatchableItem,
  MatchSource,
  UpdateFilter,
} from './types.js'

// Rejects candidates where both sides have an enclosureHash and they differ.
// Prevents merging items that share a URL but have different enclosures
// (e.g. podcast episodes on a show page with regenerated GUIDs).
export const enclosureConflictFilter: CandidateFilter = {
  name: 'enclosureConflict',
  appliesTo: ['guid', 'link'],
  evaluate: (context) => {
    const candidateEnclosure = context.candidate.enclosureHash
    const incomingEnclosure = context.incoming.hashes.enclosureHash

    if (candidateEnclosure && incomingEnclosure && candidateEnclosure !== incomingEnclosure) {
      return { allow: false, reason: 'Enclosure hash mismatch' }
    }

    return { allow: true }
  },
}

// Updates only when content hashes differ between existing and incoming.
// Compares all isContent hashes (title, summary, content, enclosure).
export const contentChangeFilter: UpdateFilter = {
  name: 'contentChange',
  shouldUpdate: (context) => {
    return hashMeta
      .filter((meta) => meta.isContent)
      .some((meta) => context.existing[meta.key] !== context.incomingHashes[meta.key])
  },
}

// TODO: Consider splitting into prematch/classify filter arrays if a future
// filter needs to apply only during classification (not pre-match).
export const candidateFilters: Array<CandidateFilter> = [enclosureConflictFilter]
export const updateFilters: Array<UpdateFilter> = [contentChangeFilter]

// Apply all applicable candidate filters to a candidate list for a given source.
// Filters are applied sequentially — each filter narrows the output of the previous.
export const applyCandidateFilters = ({
  candidates,
  identifierSource,
  filters,
  incoming,
  channel,
}: {
  candidates: Array<MatchableItem>
  identifierSource: MatchSource
  filters: Array<CandidateFilter>
  incoming: { hashes: ItemHashes }
  channel: { linkUniquenessRate: number }
}): Array<MatchableItem> => {
  let result = candidates

  for (const filter of filters) {
    if (filter.appliesTo !== 'all' && !filter.appliesTo.includes(identifierSource)) {
      continue
    }

    result = result.filter((candidate) => {
      const context: CandidateFilterContext = { identifierSource, incoming, candidate, channel }
      return filter.evaluate(context).allow
    })
  }

  return result
}
