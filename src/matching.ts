import { hashMeta, signalHashKeys } from './constants.js'
import { hasStrongHash } from './hashes.js'
import type {
  CandidateFilter,
  CandidateFilterContext,
  ExistingItem,
  FeedProfile,
  FeedProfileStats,
  IncomingItem,
  ItemHashes,
  MatchedBy,
  MatchPolicy,
  MatchResult,
  MatchStrategy,
  MatchStrategyContext,
  MatchStrategyResult,
  UpdateFilter,
} from './types.js'

// Compute stats for a single signal from a set of hash values.
export const computeSignalStats = (values: Array<string | null>): FeedProfileStats => {
  const present = values.filter((value): value is string => value != null)
  const distinct = new Set(present).size

  return {
    present: present.length,
    total: values.length,
    presenceRate: values.length > 0 ? present.length / values.length : 0,
    distinct,
    uniquenessRate: present.length > 0 ? distinct / present.length : 0,
  }
}

// Compute feed profile from existing + incoming items. Per-signal stats
// are kept separate; effective rates use conservative combining: when one
// side has no present values, fall back to the other; otherwise min.
export const computeFeedProfile = (
  existingItems: Array<ExistingItem>,
  incomingItems: Array<IncomingItem>,
): FeedProfile => {
  const profile = {} as FeedProfile

  for (const [signal, hashKey] of signalHashKeys) {
    const existing = computeSignalStats(existingItems.map((item) => item[hashKey]))
    const incoming = computeSignalStats(incomingItems.map((item) => item[hashKey]))

    // When one side has no present values, use the other side's rates.
    // Otherwise take the minimum (conservative).
    const source = existing.present === 0 ? incoming : incoming.present === 0 ? existing : null
    const effective = source
      ? { presenceRate: source.presenceRate, uniquenessRate: source.uniquenessRate }
      : {
          presenceRate: Math.min(existing.presenceRate, incoming.presenceRate),
          uniquenessRate: Math.min(existing.uniquenessRate, incoming.uniquenessRate),
        }

    profile[signal] = { existing, incoming, effective }
  }

  return profile
}

// Rejects candidates where both sides have an enclosureHash and they differ.
// Prevents merging items that share a URL but have different enclosures
// (e.g. podcast episodes on a show page with regenerated GUIDs).
export const enclosureConflictFilter: CandidateFilter = {
  name: 'enclosureConflict',
  appliesTo: ['guid', 'link'],
  evaluate: (context) => {
    const candidateEnclosure = context.candidate.enclosureHash
    const incomingEnclosure = context.incoming.enclosureHash

    if (candidateEnclosure && incomingEnclosure && candidateEnclosure !== incomingEnclosure) {
      return { allow: false, reason: 'Enclosure hash mismatch' }
    }

    return { allow: true }
  },
}

// Rejects GUID matches when dates are too far apart. Fixes the GUID reuse
// blind spot where feeds reuse a GUID months later for different content.
// Allows match if either side lacks publishedAt (backward compatible).
export const dateProximityFilter: CandidateFilter = {
  name: 'dateProximity',
  appliesTo: ['guid'],
  evaluate: (context) => {
    const incomingDate = context.incoming.publishedAt
    const candidateDate = context.candidate.publishedAt

    if (!incomingDate || !candidateDate) {
      return { allow: true }
    }

    const msDiff = Math.abs(incomingDate.getTime() - candidateDate.getTime())
    const daysDiff = msDiff / (1000 * 60 * 60 * 24)

    if (daysDiff > context.matchPolicy.dateProximityDays) {
      return {
        allow: false,
        reason: `Date difference ${Math.round(daysDiff)}d exceeds ${context.matchPolicy.dateProximityDays}d`,
      }
    }

    return { allow: true }
  },
}

// Updates only when content hashes differ between existing and incoming.
// Compares all isContent hashes (title, summary, content, enclosure).
export const contentChangeFilter: UpdateFilter = {
  name: 'contentChange',
  shouldUpdate: (context) => {
    return (
      hashMeta
        .filter((meta) => meta.isContent)
        /* biome-ignore lint/suspicious/noDoubleEquals: Intentional — null == undefined. */
        .some((meta) => context.existing[meta.key] != context.incoming[meta.key])
    )
  },
}

export const prematchCandidateFilters: Array<CandidateFilter> = [enclosureConflictFilter]
export const classifyCandidateFilters: Array<CandidateFilter> = [
  enclosureConflictFilter,
  dateProximityFilter,
]
export const updateFilters: Array<UpdateFilter> = [contentChangeFilter]

// Apply all applicable candidate filters to a candidate list for a given source.
// Filters are applied sequentially — each filter narrows the output of the previous.
export const applyCandidateFilters = ({
  candidates,
  matchedBy,
  filters,
  incoming,
  matchPolicy,
}: {
  candidates: Array<ExistingItem>
  matchedBy: MatchedBy
  filters: Array<CandidateFilter>
  incoming: IncomingItem
  matchPolicy: MatchPolicy
}): Array<ExistingItem> => {
  let result = candidates

  for (const filter of filters) {
    if (!filter.appliesTo.includes(matchedBy)) {
      continue
    }

    result = result.filter((candidate) => {
      const context: CandidateFilterContext = { matchedBy, incoming, candidate, matchPolicy }
      return filter.evaluate(context).allow
    })
  }

  return result
}

// Returns true when link is the item's only strong fingerprint.
// Link-only items always get link matching even on low-uniqueness channels.
export const hasLinkOnly = (item: IncomingItem | ExistingItem): boolean => {
  if (!item.linkHash) {
    return false
  }

  return !hashMeta.some((meta) => meta.isStrongHash && meta.key !== 'linkHash' && item[meta.key])
}

// In-memory filter: returns all existing items where any matchable hash matches.
// Does NOT apply gating — that's selectMatchingItem's job.
// Non-matchable hashes (fragments, content, summary) are excluded: too volatile
// or only used as tiebreakers. Title only checked when no strong hash exists —
// prevents title pulling in unrelated candidates that would confuse selectMatchingItem.
export const findMatchCandidates = (
  hashes: ItemHashes,
  existingItems: Array<ExistingItem>,
): Array<ExistingItem> => {
  const hasStrong = hasStrongHash(hashes)

  return existingItems.filter((existing) =>
    hashMeta.some((meta) => {
      if (!meta.isMatchable || !hashes[meta.key]) {
        return false
      }

      if (!meta.isStrongHash && hasStrong) {
        return false
      }

      return existing[meta.key] === hashes[meta.key]
    }),
  )
}

// Match strategy: GUID with enclosure/guidFragment/link disambiguation.
export const matchByGuid = (context: MatchStrategyContext): MatchStrategyResult => {
  const { incoming, candidates, filtered } = context

  if (!incoming.guidHash) {
    return { outcome: 'pass' }
  }

  const byGuid = filtered(
    'guid',
    candidates.filter((candidate) => {
      return candidate.guidHash === incoming.guidHash
    }),
  )

  if (byGuid.length === 1) {
    return { outcome: 'matched', result: { match: byGuid[0], matchedBy: 'guid' } }
  }

  if (byGuid.length > 1) {
    // Try narrowing by enclosure.
    if (incoming.enclosureHash) {
      const byEnclosure = byGuid.filter((candidate) => {
        return candidate.enclosureHash === incoming.enclosureHash
      })

      if (byEnclosure.length === 1) {
        return { outcome: 'matched', result: { match: byEnclosure[0], matchedBy: 'guid' } }
      }
    }

    // Try narrowing by guid fragment.
    if (incoming.guidFragmentHash) {
      const byGuidFragment = byGuid.filter((candidate) => {
        return candidate.guidFragmentHash === incoming.guidFragmentHash
      })

      if (byGuidFragment.length === 1) {
        return {
          outcome: 'matched',
          result: { match: byGuidFragment[0], matchedBy: 'guid' },
        }
      }
    }

    // Try narrowing by link.
    if (incoming.linkHash) {
      const byLink = byGuid.filter((candidate) => {
        return candidate.linkHash === incoming.linkHash
      })

      if (byLink.length === 1) {
        return { outcome: 'matched', result: { match: byLink[0], matchedBy: 'guid' } }
      }
    }

    return { outcome: 'ambiguous', source: 'guid', count: byGuid.length }
  }

  return { outcome: 'pass' }
}

// Match strategy: link with linkFragment disambiguation.
export const matchByLink = (context: MatchStrategyContext): MatchStrategyResult => {
  const { incoming, candidates, filtered } = context

  if (!incoming.linkHash) {
    return { outcome: 'pass' }
  }

  const byLink = filtered(
    'link',
    candidates.filter((candidate) => {
      return candidate.linkHash === incoming.linkHash
    }),
  )

  if (byLink.length === 1) {
    return { outcome: 'matched', result: { match: byLink[0], matchedBy: 'link' } }
  }

  if (byLink.length > 1) {
    if (incoming.linkFragmentHash) {
      const byFragment = byLink.filter((candidate) => {
        return candidate.linkFragmentHash === incoming.linkFragmentHash
      })

      if (byFragment.length === 1) {
        return { outcome: 'matched', result: { match: byFragment[0], matchedBy: 'link' } }
      }
    }

    return { outcome: 'ambiguous', source: 'link', count: byLink.length }
  }

  return { outcome: 'pass' }
}

// Match strategy: enclosure (no disambiguation).
export const matchByEnclosure = (context: MatchStrategyContext): MatchStrategyResult => {
  const { incoming, candidates, filtered } = context

  if (!incoming.enclosureHash) {
    return { outcome: 'pass' }
  }

  const byEnclosure = filtered(
    'enclosure',
    candidates.filter((candidate) => {
      return candidate.enclosureHash === incoming.enclosureHash
    }),
  )

  if (byEnclosure.length === 1) {
    return {
      outcome: 'matched',
      result: { match: byEnclosure[0], matchedBy: 'enclosure' },
    }
  }

  if (byEnclosure.length > 1) {
    return { outcome: 'ambiguous', source: 'enclosure', count: byEnclosure.length }
  }

  return { outcome: 'pass' }
}

// Match strategy: title (no disambiguation, no hasStrongHash guard — that stays in selectMatchingItem).
export const matchByTitle = (context: MatchStrategyContext): MatchStrategyResult => {
  const { incoming, candidates, filtered } = context

  if (!incoming.titleHash) {
    return { outcome: 'pass' }
  }

  const byTitle = filtered(
    'title',
    candidates.filter((candidate) => {
      return candidate.titleHash === incoming.titleHash
    }),
  )

  if (byTitle.length === 1) {
    return { outcome: 'matched', result: { match: byTitle[0], matchedBy: 'title' } }
  }

  if (byTitle.length > 1) {
    return { outcome: 'ambiguous', source: 'title', count: byTitle.length }
  }

  return { outcome: 'pass' }
}

// High-uniqueness channel: guid > link > enclosure > title.
export const highUniquenessStrategies: Array<MatchStrategy> = [
  { execute: matchByGuid },
  { execute: matchByLink },
  { execute: matchByEnclosure },
  { execute: matchByTitle, gate: ({ incoming }) => !hasStrongHash(incoming) },
]

// Low-uniqueness channel: guid > enclosure > link (if link-only) > title.
export const lowUniquenessStrategies: Array<MatchStrategy> = [
  { execute: matchByGuid },
  { execute: matchByEnclosure },
  { execute: matchByLink, gate: ({ incoming }) => hasLinkOnly(incoming) },
  { execute: matchByTitle, gate: ({ incoming }) => !hasStrongHash(incoming) },
]

export const computeMatchPolicy = (
  feedProfile: FeedProfile,
  options?: { dateProximityDays?: number },
): MatchPolicy => {
  return {
    linkReliable: feedProfile.link.effective.uniquenessRate >= 0.95,
    dateProximityDays: options?.dateProximityDays ?? 7,
  }
}

export const resolveStrategies = (policy: MatchPolicy): Array<MatchStrategy> => {
  return policy.linkReliable ? highUniquenessStrategies : lowUniquenessStrategies
}

// Priority-based match selection with configurable strategy ordering.
// Summary/content excluded: too volatile for cross-scan matching.
// Returns undefined for ambiguous matches (>1) — prefer insert over wrong merge.
export const selectMatchingItem = ({
  incoming,
  candidates,
  matchPolicy,
  candidateFilters,
}: {
  incoming: IncomingItem
  candidates: Array<ExistingItem>
  matchPolicy: MatchPolicy
  candidateFilters: Array<CandidateFilter>
}): MatchResult | undefined => {
  const filtered = (matchedBy: MatchedBy, candidates: Array<ExistingItem>): Array<ExistingItem> => {
    return applyCandidateFilters({
      candidates,
      matchedBy,
      filters: candidateFilters,
      incoming,
      matchPolicy,
    })
  }

  if (candidates.length === 0) {
    return
  }

  const strategies = resolveStrategies(matchPolicy)
  const context: MatchStrategyContext = { incoming, candidates, filtered }

  for (const strategy of strategies) {
    if (strategy.gate && !strategy.gate({ incoming })) {
      continue
    }

    const result = strategy.execute(context)

    if (result.outcome === 'matched') {
      return result.result
    }

    if (result.outcome === 'ambiguous') {
      return undefined
    }
  }

  return
}
