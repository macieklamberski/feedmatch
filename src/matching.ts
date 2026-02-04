import { applyCandidateGates } from './gates.js'
import { isDefined } from './helpers.js'
import { hashMeta, hasStrongHash } from './meta.js'
import type {
  CandidateGate,
  ChannelProfile,
  ItemHashes,
  MatchableItem,
  MatchResult,
  MatchSource,
  TierContext,
  TierResult,
} from './types.js'

// Returns true when link is the item's only strong identifier
// (no guid, no enclosure). Link-only items always get link matching
// even on low-uniqueness channels.
export const isLinkOnly = (hashes: ItemHashes): boolean => {
  return !!hashes.linkHash && !hashes.guidHash && !hashes.enclosureHash
}

// In-memory filter: returns all existing items where any matchable hash matches.
// Does NOT apply gating — that's selectMatch's job.
// Non-matchable hashes (fragments, content, summary) are excluded: too volatile
// or only used as tiebreakers. Title only checked when no strong hash exists —
// prevents title pulling in unrelated candidates that would confuse selectMatch.
export const findCandidatesForItem = (
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

// Tier matcher: GUID with enclosure/guidFragment/link disambiguation.
const matchByGuid = (context: TierContext): TierResult => {
  const { hashes, candidates, gated } = context

  if (!hashes.guidHash) {
    return { outcome: 'pass' }
  }

  const byGuid = gated(
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

// Tier matcher: link with linkFragment disambiguation.
const matchByLink = (context: TierContext): TierResult => {
  const { hashes, candidates, gated } = context

  if (!hashes.linkHash) {
    return { outcome: 'pass' }
  }

  const byLink = gated(
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

// Tier matcher: enclosure (no disambiguation).
const matchByEnclosure = (context: TierContext): TierResult => {
  const { hashes, candidates, gated } = context

  if (!hashes.enclosureHash) {
    return { outcome: 'pass' }
  }

  const byEnclosure = gated(
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

// Tier matcher: title (no disambiguation, no hasStrongHash guard — that stays in selectMatch).
const matchByTitle = (context: TierContext): TierResult => {
  const { hashes, candidates, gated } = context

  if (!hashes.titleHash) {
    return { outcome: 'pass' }
  }

  const byTitle = gated(
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
export const selectMatch = ({
  hashes,
  candidates,
  linkUniquenessRate,
  candidateGates,
}: {
  hashes: ItemHashes
  candidates: Array<MatchableItem>
  linkUniquenessRate: number
  candidateGates: Array<CandidateGate>
}): MatchResult | undefined => {
  const incoming = { hashes }
  const channel = { linkUniquenessRate }

  const gated = (source: MatchSource, filtered: Array<MatchableItem>): Array<MatchableItem> => {
    return applyCandidateGates({
      candidates: filtered,
      source,
      gates: candidateGates,
      incoming,
      channel,
    })
  }

  if (candidates.length === 0) {
    return
  }

  const context: TierContext = { hashes, candidates, gated }

  const tryTier = (
    tier: (context: TierContext) => TierResult,
  ): MatchResult | undefined | 'pass' => {
    const tierResult = tier(context)

    if (tierResult.outcome === 'matched') {
      return tierResult.result
    }

    if (tierResult.outcome === 'ambiguous') {
      return undefined
    }

    return 'pass'
  }

  // Priority 1: GUID match (always strongest).
  const guidResult = tryTier(matchByGuid)

  if (guidResult !== 'pass') {
    return guidResult
  }

  // Channel-dependent tier ordering.
  if (linkUniquenessRate >= 0.95) {
    // High-uniqueness channel: link is reliable.
    const linkResult = tryTier(matchByLink)

    if (linkResult !== 'pass') {
      return linkResult
    }

    const enclosureResult = tryTier(matchByEnclosure)

    if (enclosureResult !== 'pass') {
      return enclosureResult
    }
  } else {
    // Low-uniqueness channel: enclosure first, link only if link-only item.
    const enclosureResult = tryTier(matchByEnclosure)

    if (enclosureResult !== 'pass') {
      return enclosureResult
    }

    if (isLinkOnly(hashes)) {
      const linkResult = tryTier(matchByLink)

      if (linkResult !== 'pass') {
        return linkResult
      }
    }
  }

  // Weak fallback: title only when no strong hashes.
  if (!hasStrongHash(hashes)) {
    const titleResult = tryTier(matchByTitle)

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
export const computeChannelProfile = (
  existingItems: Array<MatchableItem>,
  incomingLinkHashes: Array<string>,
): ChannelProfile => {
  const existingLinkHashes = existingItems.map((item) => item.linkHash).filter(isDefined)
  const historicalRate = computeBatchLinkUniqueness(existingLinkHashes)
  const batchRate = computeBatchLinkUniqueness(incomingLinkHashes)

  if (existingLinkHashes.length === 0) {
    return { linkUniquenessRate: batchRate }
  }

  if (incomingLinkHashes.length === 0) {
    return { linkUniquenessRate: historicalRate }
  }

  return { linkUniquenessRate: Math.min(historicalRate, batchRate) }
}

// Exported for testing only — not part of public API.
export const _testTierMatchers = { matchByGuid, matchByLink, matchByEnclosure, matchByTitle }
