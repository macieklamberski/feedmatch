import { applyCandidateFilters, candidateFilters } from './filters.js'
import { isDefined } from './helpers.js'
import { hashMeta, hasStrongHash } from './meta.js'
import type {
  FeedProfile,
  ItemHashes,
  MatchableItem,
  MatchResult,
  MatchSource,
  MatchStrategyContext,
  MatchStrategyResult,
} from './types.js'

// Returns true when link is the item's only strong identifier
// (no guid, no enclosure). Link-only items always get link matching
// even on low-uniqueness channels.
export const isLinkOnly = (hashes: ItemHashes): boolean => {
  return !!hashes.linkHash && !hashes.guidHash && !hashes.enclosureHash
}

// In-memory filter: returns all existing items where any matchable hash matches.
// Does NOT apply gating — that's selectMatchingItem's job.
// Non-matchable hashes (fragments, content, summary) are excluded: too volatile
// or only used as tiebreakers. Title only checked when no strong hash exists —
// prevents title pulling in unrelated candidates that would confuse selectMatchingItem.
export const findMatchCandidates = (
  hashes: ItemHashes,
  existingItems: Array<MatchableItem>,
): Array<MatchableItem> => {
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
  const { hashes, candidates, filtered } = context

  if (!hashes.guidHash) {
    return { outcome: 'pass' }
  }

  const byGuid = filtered(
    'guid',
    candidates.filter((candidate) => {
      return candidate.guidHash === hashes.guidHash
    }),
  )

  if (byGuid.length === 1) {
    return { outcome: 'matched', result: { match: byGuid[0], identifierSource: 'guid' } }
  }

  if (byGuid.length > 1) {
    // Try narrowing by enclosure.
    if (hashes.enclosureHash) {
      const byEnclosure = byGuid.filter((candidate) => {
        return candidate.enclosureHash === hashes.enclosureHash
      })

      if (byEnclosure.length === 1) {
        return { outcome: 'matched', result: { match: byEnclosure[0], identifierSource: 'guid' } }
      }
    }

    // Try narrowing by guid fragment.
    if (hashes.guidFragmentHash) {
      const byGuidFragment = byGuid.filter((candidate) => {
        return candidate.guidFragmentHash === hashes.guidFragmentHash
      })

      if (byGuidFragment.length === 1) {
        return {
          outcome: 'matched',
          result: { match: byGuidFragment[0], identifierSource: 'guid' },
        }
      }
    }

    // Try narrowing by link.
    if (hashes.linkHash) {
      const byLink = byGuid.filter((candidate) => {
        return candidate.linkHash === hashes.linkHash
      })

      if (byLink.length === 1) {
        return { outcome: 'matched', result: { match: byLink[0], identifierSource: 'guid' } }
      }
    }

    return { outcome: 'ambiguous', source: 'guid', count: byGuid.length }
  }

  return { outcome: 'pass' }
}

// Match strategy: link with linkFragment disambiguation.
export const matchByLink = (context: MatchStrategyContext): MatchStrategyResult => {
  const { hashes, candidates, filtered } = context

  if (!hashes.linkHash) {
    return { outcome: 'pass' }
  }

  const byLink = filtered(
    'link',
    candidates.filter((candidate) => {
      return candidate.linkHash === hashes.linkHash
    }),
  )

  if (byLink.length === 1) {
    return { outcome: 'matched', result: { match: byLink[0], identifierSource: 'link' } }
  }

  if (byLink.length > 1) {
    if (hashes.linkFragmentHash) {
      const byFragment = byLink.filter((candidate) => {
        return candidate.linkFragmentHash === hashes.linkFragmentHash
      })

      if (byFragment.length === 1) {
        return { outcome: 'matched', result: { match: byFragment[0], identifierSource: 'link' } }
      }
    }

    return { outcome: 'ambiguous', source: 'link', count: byLink.length }
  }

  return { outcome: 'pass' }
}

// Match strategy: enclosure (no disambiguation).
export const matchByEnclosure = (context: MatchStrategyContext): MatchStrategyResult => {
  const { hashes, candidates, filtered } = context

  if (!hashes.enclosureHash) {
    return { outcome: 'pass' }
  }

  const byEnclosure = filtered(
    'enclosure',
    candidates.filter((candidate) => {
      return candidate.enclosureHash === hashes.enclosureHash
    }),
  )

  if (byEnclosure.length === 1) {
    return {
      outcome: 'matched',
      result: { match: byEnclosure[0], identifierSource: 'enclosure' },
    }
  }

  if (byEnclosure.length > 1) {
    return { outcome: 'ambiguous', source: 'enclosure', count: byEnclosure.length }
  }

  return { outcome: 'pass' }
}

// Match strategy: title (no disambiguation, no hasStrongHash guard — that stays in selectMatchingItem).
export const matchByTitle = (context: MatchStrategyContext): MatchStrategyResult => {
  const { hashes, candidates, filtered } = context

  if (!hashes.titleHash) {
    return { outcome: 'pass' }
  }

  const byTitle = filtered(
    'title',
    candidates.filter((candidate) => {
      return candidate.titleHash === hashes.titleHash
    }),
  )

  if (byTitle.length === 1) {
    return { outcome: 'matched', result: { match: byTitle[0], identifierSource: 'title' } }
  }

  if (byTitle.length > 1) {
    return { outcome: 'ambiguous', source: 'title', count: byTitle.length }
  }

  return { outcome: 'pass' }
}

// Priority-based match selection with per-channel link gating.
// High uniqueness: guid > link > enclosure > title
// Low uniqueness:  guid > enclosure > link (if link-only) > title
// Summary/content excluded: too volatile for cross-scan matching.
// Returns null for ambiguous matches (>1) — prefer insert over wrong merge.
export const selectMatchingItem = ({
  hashes,
  candidates,
  linkUniquenessRate,
}: {
  hashes: ItemHashes
  candidates: Array<MatchableItem>
  linkUniquenessRate: number
}): MatchResult | undefined => {
  const incoming = { hashes }
  const channel = { linkUniquenessRate }

  const filtered = (
    identifierSource: MatchSource,
    candidates: Array<MatchableItem>,
  ): Array<MatchableItem> => {
    return applyCandidateFilters({
      candidates,
      identifierSource,
      filters: candidateFilters,
      incoming,
      channel,
    })
  }

  if (candidates.length === 0) {
    return
  }

  const context: MatchStrategyContext = { hashes, candidates, filtered }

  const tryStrategy = (
    strategy: (context: MatchStrategyContext) => MatchStrategyResult,
  ): MatchResult | undefined | 'pass' => {
    const strategyResult = strategy(context)

    if (strategyResult.outcome === 'matched') {
      return strategyResult.result
    }

    if (strategyResult.outcome === 'ambiguous') {
      return undefined
    }

    return 'pass'
  }

  // Priority 1: GUID match (always strongest).
  const guidResult = tryStrategy(matchByGuid)

  if (guidResult !== 'pass') {
    return guidResult
  }

  // Channel-dependent strategy ordering.
  if (linkUniquenessRate >= 0.95) {
    // High-uniqueness channel: link is reliable.
    const linkResult = tryStrategy(matchByLink)

    if (linkResult !== 'pass') {
      return linkResult
    }

    const enclosureResult = tryStrategy(matchByEnclosure)

    if (enclosureResult !== 'pass') {
      return enclosureResult
    }
  } else {
    // Low-uniqueness channel: enclosure first, link only if link-only item.
    const enclosureResult = tryStrategy(matchByEnclosure)

    if (enclosureResult !== 'pass') {
      return enclosureResult
    }

    if (isLinkOnly(hashes)) {
      const linkResult = tryStrategy(matchByLink)

      if (linkResult !== 'pass') {
        return linkResult
      }
    }
  }

  // Weak fallback: title only when no strong hashes.
  if (!hasStrongHash(hashes)) {
    const titleResult = tryStrategy(matchByTitle)

    if (titleResult !== 'pass') {
      return titleResult
    }
  }

  return
}

// Compute link uniqueness from the current batch (no DB needed).
// Used as fallback for new channels with no historical items.
export const computeBatchLinkUniqueness = (linkHashes: Array<string>): number => {
  if (linkHashes.length === 0) {
    return 0
  }

  return new Set(linkHashes).size / linkHashes.length
}

// Pure profile computation from existing + incoming hashes.
// When one side has no data, uses the other side's rate instead of 0.
export const computeFeedProfile = (
  existingItems: Array<MatchableItem>,
  incomingLinkHashes: Array<string>,
): FeedProfile => {
  const existingItemsLinkHashes = existingItems.map((item) => item.linkHash).filter(isDefined)
  const historicalRate = computeBatchLinkUniqueness(existingItemsLinkHashes)
  const batchRate = computeBatchLinkUniqueness(incomingLinkHashes)

  if (existingItemsLinkHashes.length === 0) {
    return { linkUniquenessRate: batchRate }
  }

  if (incomingLinkHashes.length === 0) {
    return { linkUniquenessRate: historicalRate }
  }

  return { linkUniquenessRate: Math.min(historicalRate, batchRate) }
}
