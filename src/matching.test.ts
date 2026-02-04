import { describe, expect, it } from 'bun:test'
import {
  applyCandidateFilters,
  contentChangeFilter,
  enclosureConflictFilter,
  findMatchCandidates,
  isLinkOnly,
  matchByEnclosure,
  matchByGuid,
  matchByLink,
  matchByTitle,
  selectMatchingItem,
} from './matching.js'
import type {
  CandidateFilter,
  CandidateFilterContext,
  ExistingItem,
  ItemHashes,
  MatchedBy,
  MatchResult,
  MatchStrategyContext,
} from './types.js'

const makeItem = (overrides: Partial<ExistingItem> = {}): ExistingItem => {
  return {
    id: 'item-1',
    guidHash: null,
    guidFragmentHash: null,
    linkHash: null,
    linkFragmentHash: null,
    enclosureHash: null,
    titleHash: null,
    summaryHash: null,
    contentHash: null,
    ...overrides,
  }
}

const makeHashes = (overrides: Partial<ItemHashes> = {}): ItemHashes => {
  return {
    guidHash: null,
    guidFragmentHash: null,
    linkHash: null,
    linkFragmentHash: null,
    enclosureHash: null,
    titleHash: null,
    summaryHash: null,
    contentHash: null,
    ...overrides,
  }
}

describe('isLinkOnly', () => {
  it('should return true when only linkHash is present', () => {
    const value = makeHashes({ linkHash: 'abc' })

    expect(isLinkOnly(value)).toBe(true)
  })

  it('should return false when guidHash is also present', () => {
    const value = makeHashes({
      linkHash: 'abc',
      guidHash: 'def',
    })

    expect(isLinkOnly(value)).toBe(false)
  })

  it('should return false when enclosureHash is also present', () => {
    const value = makeHashes({
      linkHash: 'abc',
      enclosureHash: 'def',
    })

    expect(isLinkOnly(value)).toBe(false)
  })

  it('should return false when no linkHash', () => {
    const value = makeHashes({ guidHash: 'abc' })

    expect(isLinkOnly(value)).toBe(false)
  })

  it('should return false when empty', () => {
    const value = makeHashes()

    expect(isLinkOnly(value)).toBe(false)
  })
})

describe('findMatchCandidates', () => {
  it('should match on guidHash', () => {
    const value = makeHashes({ guidHash: 'guid-1' })
    const existing = [
      makeItem({ id: 'a', guidHash: 'guid-1' }),
      makeItem({ id: 'b', guidHash: 'guid-2' }),
    ]
    const expected = [existing[0]]

    expect(findMatchCandidates(value, existing)).toEqual(expected)
  })

  it('should match on linkHash', () => {
    const value = makeHashes({ linkHash: 'link-1' })
    const existing = [
      makeItem({ id: 'a', linkHash: 'link-1' }),
      makeItem({ id: 'b', linkHash: 'link-2' }),
    ]
    const expected = [existing[0]]

    expect(findMatchCandidates(value, existing)).toEqual(expected)
  })

  it('should match on enclosureHash', () => {
    const value = makeHashes({ enclosureHash: 'enc-1' })
    const existing = [
      makeItem({ id: 'a', enclosureHash: 'enc-1' }),
      makeItem({ id: 'b', enclosureHash: 'enc-2' }),
    ]
    const expected = [existing[0]]

    expect(findMatchCandidates(value, existing)).toEqual(expected)
  })

  it('should match on titleHash', () => {
    const value = makeHashes({ titleHash: 'title-1' })
    const existing = [
      makeItem({ id: 'a', titleHash: 'title-1' }),
      makeItem({ id: 'b', titleHash: 'title-2' }),
    ]
    const expected = [existing[0]]

    expect(findMatchCandidates(value, existing)).toEqual(expected)
  })

  it('should return multiple matches across different hashes', () => {
    const value = makeHashes({
      guidHash: 'guid-1',
      linkHash: 'link-2',
    })
    const existing = [
      makeItem({ id: 'a', guidHash: 'guid-1' }),
      makeItem({ id: 'b', linkHash: 'link-2' }),
    ]
    const expected = [existing[0], existing[1]]

    expect(findMatchCandidates(value, existing)).toEqual(expected)
  })

  it('should not duplicate items matching on multiple hashes', () => {
    const value = makeHashes({
      guidHash: 'guid-1',
      linkHash: 'link-1',
    })
    const existing = [makeItem({ id: 'a', guidHash: 'guid-1', linkHash: 'link-1' })]
    const expected = [existing[0]]

    expect(findMatchCandidates(value, existing)).toEqual(expected)
  })

  it('should return empty array when no matches', () => {
    const value = makeHashes({ guidHash: 'guid-x' })
    const existing = [makeItem({ id: 'a', guidHash: 'guid-1' })]

    expect(findMatchCandidates(value, existing)).toEqual([])
  })

  it('should return empty array for empty existing items', () => {
    const value = makeHashes({ guidHash: 'guid-1' })

    expect(findMatchCandidates(value, [])).toEqual([])
  })

  it('should not match on summaryHash', () => {
    const value = makeHashes({ summaryHash: 'sum-1' })
    const existing = [
      makeItem({ id: 'a', summaryHash: 'sum-1' }),
      makeItem({ id: 'b', summaryHash: 'sum-2' }),
    ]

    expect(findMatchCandidates(value, existing)).toEqual([])
  })

  it('should not match on contentHash', () => {
    const value = makeHashes({ contentHash: 'cnt-1' })
    const existing = [
      makeItem({ id: 'a', contentHash: 'cnt-1' }),
      makeItem({ id: 'b', contentHash: 'cnt-2' }),
    ]

    expect(findMatchCandidates(value, existing)).toEqual([])
  })

  it('should not match on titleHash when strong hashes present', () => {
    const value = makeHashes({
      guidHash: 'guid-1',
      titleHash: 'title-1',
    })
    const existing = [makeItem({ id: 'a', titleHash: 'title-1' })]

    expect(findMatchCandidates(value, existing)).toEqual([])
  })

  it('should not match on null hash values', () => {
    const value = makeHashes()
    const existing = [makeItem({ id: 'a', guidHash: null, linkHash: null })]

    expect(findMatchCandidates(value, existing)).toEqual([])
  })
})

describe('selectMatchingItem', () => {
  it('should return null for empty candidates', () => {
    const value = {
      incoming: makeHashes({ guidHash: 'guid-1' }),
      candidates: [],
      linkUniquenessRate: 1.0,
    }
    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should match on guid with single candidate', () => {
    const candidate = makeItem({ guidHash: 'guid-1' })
    const value = {
      incoming: makeHashes({ guidHash: 'guid-1' }),
      candidates: [candidate],
      linkUniquenessRate: 1.0,
    }
    const expected: MatchResult = {
      match: candidate,
      matchedBy: 'guid',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should return null for ambiguous guid matches with no narrowing hashes', () => {
    const value = {
      incoming: makeHashes({ guidHash: 'guid-1' }),
      candidates: [
        makeItem({ id: 'a', guidHash: 'guid-1' }),
        makeItem({ id: 'b', guidHash: 'guid-1' }),
      ],
      linkUniquenessRate: 1.0,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should disambiguate guid matches by enclosure', () => {
    const target = makeItem({ id: 'a', guidHash: 'guid-1', enclosureHash: 'enc-1' })
    const value = {
      incoming: makeHashes({
        guidHash: 'guid-1',
        enclosureHash: 'enc-1',
      }),
      candidates: [target, makeItem({ id: 'b', guidHash: 'guid-1', enclosureHash: 'enc-2' })],
      linkUniquenessRate: 1.0,
    }
    const expected: MatchResult = { match: target, matchedBy: 'guid' }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should disambiguate guid matches by link when enclosure does not narrow', () => {
    const target = makeItem({ id: 'a', guidHash: 'guid-1', linkHash: 'link-1' })
    const value = {
      incoming: makeHashes({
        guidHash: 'guid-1',
        linkHash: 'link-1',
      }),
      candidates: [target, makeItem({ id: 'b', guidHash: 'guid-1', linkHash: 'link-2' })],
      linkUniquenessRate: 1.0,
    }
    const expected: MatchResult = { match: target, matchedBy: 'guid' }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should disambiguate guid matches by guidFragmentHash', () => {
    const target = makeItem({ id: 'a', guidHash: 'guid-1', guidFragmentHash: 'gf-1' })
    const value = {
      incoming: makeHashes({
        guidHash: 'guid-1',
        guidFragmentHash: 'gf-1',
      }),
      candidates: [target, makeItem({ id: 'b', guidHash: 'guid-1', guidFragmentHash: 'gf-2' })],
      linkUniquenessRate: 1.0,
    }
    const expected: MatchResult = { match: target, matchedBy: 'guid' }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should return null when guidFragmentHash is also ambiguous', () => {
    const value = {
      incoming: makeHashes({
        guidHash: 'guid-1',
        guidFragmentHash: 'gf-shared',
      }),
      candidates: [
        makeItem({ id: 'a', guidHash: 'guid-1', guidFragmentHash: 'gf-shared' }),
        makeItem({ id: 'b', guidHash: 'guid-1', guidFragmentHash: 'gf-shared' }),
      ],
      linkUniquenessRate: 1.0,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should return null when guid disambiguation still ambiguous', () => {
    const value = {
      incoming: makeHashes({
        guidHash: 'guid-1',
        linkHash: 'link-shared',
      }),
      candidates: [
        makeItem({ id: 'a', guidHash: 'guid-1', linkHash: 'link-shared' }),
        makeItem({ id: 'b', guidHash: 'guid-1', linkHash: 'link-shared' }),
      ],
      linkUniquenessRate: 1.0,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should reject guid match when enclosures conflict', () => {
    const value = {
      incoming: makeHashes({
        guidHash: 'guid-1',
        enclosureHash: 'enc-new',
      }),
      candidates: [makeItem({ guidHash: 'guid-1', enclosureHash: 'enc-old' })],
      linkUniquenessRate: 1.0,
    }
    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should allow guid match when enclosures are same', () => {
    const candidate = makeItem({ guidHash: 'guid-1', enclosureHash: 'enc-same' })
    const value = {
      incoming: makeHashes({
        guidHash: 'guid-1',
        enclosureHash: 'enc-same',
      }),
      candidates: [candidate],
      linkUniquenessRate: 1.0,
    }
    const expected: MatchResult = {
      match: candidate,
      matchedBy: 'guid',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should allow guid match when candidate has no enclosure', () => {
    const candidate = makeItem({ guidHash: 'guid-1', enclosureHash: null })
    const value = {
      incoming: makeHashes({
        guidHash: 'guid-1',
        enclosureHash: 'enc-new',
      }),
      candidates: [candidate],
      linkUniquenessRate: 1.0,
    }
    const expected: MatchResult = {
      match: candidate,
      matchedBy: 'guid',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should allow guid match when incoming has no enclosure', () => {
    const candidate = makeItem({ guidHash: 'guid-1', enclosureHash: 'enc-existing' })
    const value = {
      incoming: makeHashes({ guidHash: 'guid-1' }),
      candidates: [candidate],
      linkUniquenessRate: 1.0,
    }
    const expected: MatchResult = {
      match: candidate,
      matchedBy: 'guid',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should match on link when high uniqueness', () => {
    const candidate = makeItem({ linkHash: 'link-1' })
    const value = {
      incoming: makeHashes({ linkHash: 'link-1' }),
      candidates: [candidate],
      linkUniquenessRate: 0.98,
    }
    const expected: MatchResult = {
      match: candidate,
      matchedBy: 'link',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should filter out link matches with enclosure conflict', () => {
    const value = {
      incoming: makeHashes({
        linkHash: 'link-1',
        enclosureHash: 'enc-new',
      }),
      candidates: [makeItem({ linkHash: 'link-1', enclosureHash: 'enc-old' })],
      linkUniquenessRate: 0.98,
    }
    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should allow link match when enclosures are same', () => {
    const candidate = makeItem({ linkHash: 'link-1', enclosureHash: 'enc-same' })
    const value = {
      incoming: makeHashes({
        linkHash: 'link-1',
        enclosureHash: 'enc-same',
      }),
      candidates: [candidate],
      linkUniquenessRate: 0.98,
    }
    const expected: MatchResult = {
      match: candidate,
      matchedBy: 'link',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should allow link match when candidate has no enclosure', () => {
    const candidate = makeItem({ linkHash: 'link-1', enclosureHash: null })
    const value = {
      incoming: makeHashes({
        linkHash: 'link-1',
        enclosureHash: 'enc-new',
      }),
      candidates: [candidate],
      linkUniquenessRate: 0.98,
    }
    const expected: MatchResult = {
      match: candidate,
      matchedBy: 'link',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should disambiguate link matches by fragment on high-uniqueness channel', () => {
    const target = makeItem({ id: 'a', linkHash: 'link-1', linkFragmentHash: 'frag-1' })
    const value = {
      incoming: makeHashes({
        linkHash: 'link-1',
        linkFragmentHash: 'frag-1',
      }),
      candidates: [target, makeItem({ id: 'b', linkHash: 'link-1', linkFragmentHash: 'frag-2' })],
      linkUniquenessRate: 0.98,
    }
    const expected: MatchResult = { match: target, matchedBy: 'link' }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should return null when fragment is also ambiguous on high-uniqueness channel', () => {
    const value = {
      incoming: makeHashes({
        linkHash: 'link-1',
        linkFragmentHash: 'frag-shared',
      }),
      candidates: [
        makeItem({ id: 'a', linkHash: 'link-1', linkFragmentHash: 'frag-shared' }),
        makeItem({ id: 'b', linkHash: 'link-1', linkFragmentHash: 'frag-shared' }),
      ],
      linkUniquenessRate: 0.98,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should return null when incoming has no fragment and link is ambiguous', () => {
    const value = {
      incoming: makeHashes({ linkHash: 'link-1' }),
      candidates: [
        makeItem({ id: 'a', linkHash: 'link-1', linkFragmentHash: 'frag-1' }),
        makeItem({ id: 'b', linkHash: 'link-1', linkFragmentHash: 'frag-2' }),
      ],
      linkUniquenessRate: 0.98,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should match on enclosure when high uniqueness and no link match', () => {
    const candidate = makeItem({ enclosureHash: 'enc-1' })
    const value = {
      incoming: makeHashes({ enclosureHash: 'enc-1' }),
      candidates: [candidate],
      linkUniquenessRate: 0.98,
    }
    const expected: MatchResult = {
      match: candidate,
      matchedBy: 'enclosure',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should prioritize enclosure over link on low-uniqueness channel', () => {
    const candidates = [
      makeItem({ id: 'a', linkHash: 'link-shared', enclosureHash: 'enc-1' }),
      makeItem({ id: 'b', linkHash: 'link-shared', enclosureHash: 'enc-2' }),
    ]
    const value = {
      incoming: makeHashes({
        linkHash: 'link-shared',
        enclosureHash: 'enc-1',
      }),
      candidates,
      linkUniquenessRate: 0.3,
    }
    const expected: MatchResult = {
      match: candidates[0],
      matchedBy: 'enclosure',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should not match on link for non-link-only item on low-uniqueness channel', () => {
    const value = {
      incoming: makeHashes({
        linkHash: 'link-1',
        guidHash: 'guid-x',
      }),
      candidates: [makeItem({ linkHash: 'link-1' })],
      linkUniquenessRate: 0.3,
    }
    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should match on link for link-only item on low-uniqueness channel', () => {
    const candidate = makeItem({ linkHash: 'link-1' })
    const value = {
      incoming: makeHashes({ linkHash: 'link-1' }),
      candidates: [candidate],
      linkUniquenessRate: 0.3,
    }
    const expected: MatchResult = {
      match: candidate,
      matchedBy: 'link',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should disambiguate link matches by fragment on low-uniqueness channel for link-only item', () => {
    const target = makeItem({ id: 'a', linkHash: 'link-1', linkFragmentHash: 'frag-1' })
    const value = {
      incoming: makeHashes({
        linkHash: 'link-1',
        linkFragmentHash: 'frag-1',
      }),
      candidates: [target, makeItem({ id: 'b', linkHash: 'link-1', linkFragmentHash: 'frag-2' })],
      linkUniquenessRate: 0.3,
    }
    const expected: MatchResult = { match: target, matchedBy: 'link' }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should return null when fragment is also ambiguous on low-uniqueness channel', () => {
    const value = {
      incoming: makeHashes({
        linkHash: 'link-1',
        linkFragmentHash: 'frag-shared',
      }),
      candidates: [
        makeItem({ id: 'a', linkHash: 'link-1', linkFragmentHash: 'frag-shared' }),
        makeItem({ id: 'b', linkHash: 'link-1', linkFragmentHash: 'frag-shared' }),
      ],
      linkUniquenessRate: 0.3,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should match on title as last resort', () => {
    const candidate = makeItem({ titleHash: 'title-1' })
    const value = {
      incoming: makeHashes({ titleHash: 'title-1' }),
      candidates: [candidate],
      linkUniquenessRate: 1.0,
    }
    const expected: MatchResult = {
      match: candidate,
      matchedBy: 'title',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should return null for ambiguous title matches', () => {
    const value = {
      incoming: makeHashes({ titleHash: 'title-1' }),
      candidates: [
        makeItem({ id: 'a', titleHash: 'title-1' }),
        makeItem({ id: 'b', titleHash: 'title-1' }),
      ],
      linkUniquenessRate: 1.0,
    }
    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should not match on title when strong hashes present', () => {
    const value = {
      incoming: makeHashes({
        guidHash: 'guid-x',
        titleHash: 'title-1',
      }),
      candidates: [makeItem({ titleHash: 'title-1' })],
      linkUniquenessRate: 1.0,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should not match on summary-only candidates', () => {
    const value = {
      incoming: makeHashes({ summaryHash: 'sum-1' }),
      candidates: [makeItem({ summaryHash: 'sum-1' })],
      linkUniquenessRate: 1.0,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should not match on content-only candidates', () => {
    const value = {
      incoming: makeHashes({ contentHash: 'cnt-1' }),
      candidates: [makeItem({ contentHash: 'cnt-1' })],
      linkUniquenessRate: 1.0,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should prefer guid over link', () => {
    const guidCandidate = makeItem({ id: 'guid-match', guidHash: 'guid-1' })
    const linkCandidate = makeItem({ id: 'link-match', linkHash: 'link-1' })
    const value = {
      incoming: makeHashes({
        guidHash: 'guid-1',
        linkHash: 'link-1',
      }),
      candidates: [guidCandidate, linkCandidate],
      linkUniquenessRate: 1.0,
    }
    const expected: MatchResult = {
      match: guidCandidate,
      matchedBy: 'guid',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should prefer link over enclosure on high-uniqueness channel', () => {
    const linkCandidate = makeItem({ id: 'link-match', linkHash: 'link-1' })
    const encCandidate = makeItem({ id: 'enc-match', enclosureHash: 'enc-1' })
    const value = {
      incoming: makeHashes({
        linkHash: 'link-1',
        enclosureHash: 'enc-1',
      }),
      candidates: [linkCandidate, encCandidate],
      linkUniquenessRate: 0.98,
    }
    const expected: MatchResult = {
      match: linkCandidate,
      matchedBy: 'link',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should disambiguate multiple guid matches by enclosure when no conflict', () => {
    const target = makeItem({ id: 'a', guidHash: 'guid-1', enclosureHash: 'enc-1' })
    const value = {
      incoming: makeHashes({
        guidHash: 'guid-1',
        enclosureHash: 'enc-1',
      }),
      candidates: [
        target,
        makeItem({ id: 'b', guidHash: 'guid-1', enclosureHash: 'enc-2' }),
        makeItem({ id: 'c', guidHash: 'guid-1', enclosureHash: null }),
      ],
      linkUniquenessRate: 1.0,
    }
    const expected: MatchResult = { match: target, matchedBy: 'guid' }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should return undefined for ambiguous enclosure matches on high-uniqueness channel', () => {
    const value = {
      incoming: makeHashes({ enclosureHash: 'enc-1' }),
      candidates: [
        makeItem({ id: 'a', enclosureHash: 'enc-1' }),
        makeItem({ id: 'b', enclosureHash: 'enc-1' }),
      ],
      linkUniquenessRate: 0.98,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should match on enclosure on low-uniqueness channel', () => {
    const candidate = makeItem({ enclosureHash: 'enc-1' })
    const value = {
      incoming: makeHashes({ enclosureHash: 'enc-1' }),
      candidates: [candidate],
      linkUniquenessRate: 0.3,
    }
    const expected: MatchResult = { match: candidate, matchedBy: 'enclosure' }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should return undefined for ambiguous enclosure matches on low-uniqueness channel', () => {
    const value = {
      incoming: makeHashes({ enclosureHash: 'enc-1' }),
      candidates: [
        makeItem({ id: 'a', enclosureHash: 'enc-1' }),
        makeItem({ id: 'b', enclosureHash: 'enc-1' }),
      ],
      linkUniquenessRate: 0.3,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should return undefined for ambiguous link-only matches on low-uniqueness channel', () => {
    const value = {
      incoming: makeHashes({ linkHash: 'link-1' }),
      candidates: [
        makeItem({ id: 'a', linkHash: 'link-1' }),
        makeItem({ id: 'b', linkHash: 'link-1' }),
      ],
      linkUniquenessRate: 0.3,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should return null when no hashes match any priority', () => {
    const value = {
      incoming: makeHashes({ guidHash: 'guid-x' }),
      candidates: [makeItem({ guidHash: 'guid-y', linkHash: 'link-1' })],
      linkUniquenessRate: 1.0,
    }
    expect(selectMatchingItem(value)).toBeUndefined()
  })
})

const identity = (_matchedBy: string, filtered: Array<ExistingItem>): Array<ExistingItem> => {
  return filtered
}

describe('matchByGuid', () => {
  it('should match single guid candidate', () => {
    const candidate = makeItem({ guidHash: 'guid-1' })
    const context: MatchStrategyContext = {
      incoming: makeHashes({ guidHash: 'guid-1' }),
      candidates: [candidate],
      filtered: identity,
    }

    expect(matchByGuid(context)).toEqual({
      outcome: 'matched',
      result: { match: candidate, matchedBy: 'guid' },
    })
  })

  it('should disambiguate by enclosure when multiple guid matches', () => {
    const target = makeItem({ id: 'a', guidHash: 'guid-1', enclosureHash: 'enc-1' })
    const context: MatchStrategyContext = {
      incoming: makeHashes({
        guidHash: 'guid-1',
        enclosureHash: 'enc-1',
      }),
      candidates: [target, makeItem({ id: 'b', guidHash: 'guid-1', enclosureHash: 'enc-2' })],
      filtered: identity,
    }

    expect(matchByGuid(context)).toEqual({
      outcome: 'matched',
      result: { match: target, matchedBy: 'guid' },
    })
  })

  it('should disambiguate by guid fragment when enclosure fails', () => {
    const target = makeItem({ id: 'a', guidHash: 'guid-1', guidFragmentHash: 'gf-1' })
    const context: MatchStrategyContext = {
      incoming: makeHashes({
        guidHash: 'guid-1',
        guidFragmentHash: 'gf-1',
      }),
      candidates: [target, makeItem({ id: 'b', guidHash: 'guid-1', guidFragmentHash: 'gf-2' })],
      filtered: identity,
    }

    expect(matchByGuid(context)).toEqual({
      outcome: 'matched',
      result: { match: target, matchedBy: 'guid' },
    })
  })

  it('should disambiguate by link when guid fragment fails', () => {
    const target = makeItem({ id: 'a', guidHash: 'guid-1', linkHash: 'link-1' })
    const context: MatchStrategyContext = {
      incoming: makeHashes({
        guidHash: 'guid-1',
        linkHash: 'link-1',
      }),
      candidates: [target, makeItem({ id: 'b', guidHash: 'guid-1', linkHash: 'link-2' })],
      filtered: identity,
    }

    expect(matchByGuid(context)).toEqual({
      outcome: 'matched',
      result: { match: target, matchedBy: 'guid' },
    })
  })

  it('should return ambiguous when all disambiguation fails', () => {
    const context: MatchStrategyContext = {
      incoming: makeHashes({ guidHash: 'guid-1' }),
      candidates: [
        makeItem({ id: 'a', guidHash: 'guid-1' }),
        makeItem({ id: 'b', guidHash: 'guid-1' }),
      ],
      filtered: identity,
    }

    expect(matchByGuid(context)).toEqual({
      outcome: 'ambiguous',
      source: 'guid',
      count: 2,
    })
  })

  it('should pass when no guidHash', () => {
    const context: MatchStrategyContext = {
      incoming: makeHashes({ linkHash: 'link-1' }),
      candidates: [makeItem({ guidHash: 'guid-1' })],
      filtered: identity,
    }

    expect(matchByGuid(context)).toEqual({ outcome: 'pass' })
  })
})

describe('matchByLink', () => {
  it('should match single link candidate', () => {
    const candidate = makeItem({ linkHash: 'link-1' })
    const context: MatchStrategyContext = {
      incoming: makeHashes({ linkHash: 'link-1' }),
      candidates: [candidate],
      filtered: identity,
    }

    expect(matchByLink(context)).toEqual({
      outcome: 'matched',
      result: { match: candidate, matchedBy: 'link' },
    })
  })

  it('should disambiguate by link fragment when multiple matches', () => {
    const target = makeItem({ id: 'a', linkHash: 'link-1', linkFragmentHash: 'frag-1' })
    const context: MatchStrategyContext = {
      incoming: makeHashes({
        linkHash: 'link-1',
        linkFragmentHash: 'frag-1',
      }),
      candidates: [target, makeItem({ id: 'b', linkHash: 'link-1', linkFragmentHash: 'frag-2' })],
      filtered: identity,
    }

    expect(matchByLink(context)).toEqual({
      outcome: 'matched',
      result: { match: target, matchedBy: 'link' },
    })
  })

  it('should return ambiguous when fragment fails', () => {
    const context: MatchStrategyContext = {
      incoming: makeHashes({
        linkHash: 'link-1',
        linkFragmentHash: 'frag-shared',
      }),
      candidates: [
        makeItem({ id: 'a', linkHash: 'link-1', linkFragmentHash: 'frag-shared' }),
        makeItem({ id: 'b', linkHash: 'link-1', linkFragmentHash: 'frag-shared' }),
      ],
      filtered: identity,
    }

    expect(matchByLink(context)).toEqual({
      outcome: 'ambiguous',
      source: 'link',
      count: 2,
    })
  })

  it('should pass when no linkHash', () => {
    const context: MatchStrategyContext = {
      incoming: makeHashes({ guidHash: 'guid-1' }),
      candidates: [makeItem({ linkHash: 'link-1' })],
      filtered: identity,
    }

    expect(matchByLink(context)).toEqual({ outcome: 'pass' })
  })
})

describe('matchByEnclosure', () => {
  it('should match single enclosure candidate', () => {
    const candidate = makeItem({ enclosureHash: 'enc-1' })
    const context: MatchStrategyContext = {
      incoming: makeHashes({ enclosureHash: 'enc-1' }),
      candidates: [candidate],
      filtered: identity,
    }

    expect(matchByEnclosure(context)).toEqual({
      outcome: 'matched',
      result: { match: candidate, matchedBy: 'enclosure' },
    })
  })

  it('should return ambiguous when multiple matches', () => {
    const context: MatchStrategyContext = {
      incoming: makeHashes({ enclosureHash: 'enc-1' }),
      candidates: [
        makeItem({ id: 'a', enclosureHash: 'enc-1' }),
        makeItem({ id: 'b', enclosureHash: 'enc-1' }),
      ],
      filtered: identity,
    }

    expect(matchByEnclosure(context)).toEqual({
      outcome: 'ambiguous',
      source: 'enclosure',
      count: 2,
    })
  })

  it('should pass when no enclosureHash', () => {
    const context: MatchStrategyContext = {
      incoming: makeHashes({ guidHash: 'guid-1' }),
      candidates: [makeItem({ enclosureHash: 'enc-1' })],
      filtered: identity,
    }

    expect(matchByEnclosure(context)).toEqual({ outcome: 'pass' })
  })
})

describe('matchByTitle', () => {
  it('should match single title candidate', () => {
    const candidate = makeItem({ titleHash: 'title-1' })
    const context: MatchStrategyContext = {
      incoming: makeHashes({ titleHash: 'title-1' }),
      candidates: [candidate],
      filtered: identity,
    }

    expect(matchByTitle(context)).toEqual({
      outcome: 'matched',
      result: { match: candidate, matchedBy: 'title' },
    })
  })

  it('should return ambiguous when multiple matches', () => {
    const context: MatchStrategyContext = {
      incoming: makeHashes({ titleHash: 'title-1' }),
      candidates: [
        makeItem({ id: 'a', titleHash: 'title-1' }),
        makeItem({ id: 'b', titleHash: 'title-1' }),
      ],
      filtered: identity,
    }

    expect(matchByTitle(context)).toEqual({
      outcome: 'ambiguous',
      source: 'title',
      count: 2,
    })
  })

  it('should pass when no titleHash', () => {
    const context: MatchStrategyContext = {
      incoming: makeHashes({ guidHash: 'guid-1' }),
      candidates: [makeItem({ titleHash: 'title-1' })],
      filtered: identity,
    }

    expect(matchByTitle(context)).toEqual({ outcome: 'pass' })
  })
})

describe('enclosureConflictFilter', () => {
  it('should reject when both sides have different enclosures on guid source', () => {
    const value: CandidateFilterContext = {
      matchedBy: 'guid',
      incoming: makeHashes({ enclosureHash: 'enc-new' }),
      candidate: makeItem({ enclosureHash: 'enc-old' }),
      channel: { linkUniquenessRate: 1.0 },
    }

    expect(enclosureConflictFilter.evaluate(value)).toEqual({
      allow: false,
      reason: 'Enclosure hash mismatch',
    })
  })

  it('should reject when both sides have different enclosures on link source', () => {
    const value: CandidateFilterContext = {
      matchedBy: 'link',
      incoming: makeHashes({ enclosureHash: 'enc-new' }),
      candidate: makeItem({ enclosureHash: 'enc-old' }),
      channel: { linkUniquenessRate: 1.0 },
    }

    expect(enclosureConflictFilter.evaluate(value)).toEqual({
      allow: false,
      reason: 'Enclosure hash mismatch',
    })
  })

  it('should allow when enclosures match', () => {
    const value: CandidateFilterContext = {
      matchedBy: 'guid',
      incoming: makeHashes({ enclosureHash: 'enc-same' }),
      candidate: makeItem({ enclosureHash: 'enc-same' }),
      channel: { linkUniquenessRate: 1.0 },
    }

    expect(enclosureConflictFilter.evaluate(value)).toEqual({ allow: true })
  })

  it('should allow when candidate has no enclosure', () => {
    const value: CandidateFilterContext = {
      matchedBy: 'guid',
      incoming: makeHashes({ enclosureHash: 'enc-new' }),
      candidate: makeItem({ enclosureHash: null }),
      channel: { linkUniquenessRate: 1.0 },
    }

    expect(enclosureConflictFilter.evaluate(value)).toEqual({ allow: true })
  })

  it('should allow when incoming has no enclosure', () => {
    const value: CandidateFilterContext = {
      matchedBy: 'guid',
      incoming: makeHashes(),
      candidate: makeItem({ enclosureHash: 'enc-existing' }),
      channel: { linkUniquenessRate: 1.0 },
    }

    expect(enclosureConflictFilter.evaluate(value)).toEqual({ allow: true })
  })

  it('should allow when neither side has enclosure', () => {
    const value: CandidateFilterContext = {
      matchedBy: 'guid',
      incoming: makeHashes(),
      candidate: makeItem({ enclosureHash: null }),
      channel: { linkUniquenessRate: 1.0 },
    }

    expect(enclosureConflictFilter.evaluate(value)).toEqual({ allow: true })
  })

  it('should only apply to guid and link sources', () => {
    expect(enclosureConflictFilter.appliesTo).toEqual(['guid', 'link'])
  })
})

describe('contentChangeFilter', () => {
  it('should update when title changes', () => {
    const value = {
      existing: makeItem({ titleHash: 'title-1' }),
      incoming: makeHashes({ titleHash: 'title-2' }),
      matchedBy: 'guid' as MatchedBy,
    }

    expect(contentChangeFilter.shouldUpdate(value)).toBe(true)
  })

  it('should update when summary changes', () => {
    const value = {
      existing: makeItem({ summaryHash: 'sum-1' }),
      incoming: makeHashes({ summaryHash: 'sum-2' }),
      matchedBy: 'guid' as MatchedBy,
    }

    expect(contentChangeFilter.shouldUpdate(value)).toBe(true)
  })

  it('should update when content changes', () => {
    const value = {
      existing: makeItem({ contentHash: 'cnt-1' }),
      incoming: makeHashes({ contentHash: 'cnt-2' }),
      matchedBy: 'guid' as MatchedBy,
    }

    expect(contentChangeFilter.shouldUpdate(value)).toBe(true)
  })

  it('should update when enclosure changes', () => {
    const value = {
      existing: makeItem({ enclosureHash: 'enc-1' }),
      incoming: makeHashes({ enclosureHash: 'enc-2' }),
      matchedBy: 'guid' as MatchedBy,
    }

    expect(contentChangeFilter.shouldUpdate(value)).toBe(true)
  })

  it('should not update when all content hashes match', () => {
    const value = {
      existing: makeItem({
        titleHash: 'title-1',
        summaryHash: 'sum-1',
        contentHash: 'cnt-1',
        enclosureHash: 'enc-1',
      }),
      incoming: makeHashes({
        titleHash: 'title-1',
        summaryHash: 'sum-1',
        contentHash: 'cnt-1',
        enclosureHash: 'enc-1',
      }),
      matchedBy: 'guid' as MatchedBy,
    }

    expect(contentChangeFilter.shouldUpdate(value)).toBe(false)
  })

  it('should not update when null and undefined are compared', () => {
    const value = {
      existing: makeItem({ titleHash: null, contentHash: null }),
      incoming: makeHashes(),
      matchedBy: 'guid' as MatchedBy,
    }

    expect(contentChangeFilter.shouldUpdate(value)).toBe(false)
  })

  it('should ignore non-content hashes', () => {
    const value = {
      existing: makeItem({ guidHash: 'guid-1', linkHash: 'link-1' }),
      incoming: makeHashes({ guidHash: 'guid-2', linkHash: 'link-2' }),
      matchedBy: 'guid' as MatchedBy,
    }

    expect(contentChangeFilter.shouldUpdate(value)).toBe(false)
  })
})

describe('applyCandidateFilters', () => {
  it('should return all candidates when no filters apply', () => {
    const candidates = [makeItem({ id: 'a' }), makeItem({ id: 'b' })]
    const filter: CandidateFilter = {
      name: 'irrelevant',
      appliesTo: ['enclosure'],
      evaluate: () => {
        return { allow: false, reason: 'blocked' }
      },
    }
    const value = applyCandidateFilters({
      candidates,
      matchedBy: 'guid',
      filters: [filter],
      incoming: makeHashes(),
      channel: { linkUniquenessRate: 1.0 },
    })

    expect(value).toEqual(candidates)
  })

  it('should filter candidates using applicable filter', () => {
    const candidates = [
      makeItem({ id: 'a', enclosureHash: 'enc-1' }),
      makeItem({ id: 'b', enclosureHash: 'enc-2' }),
    ]
    const value = applyCandidateFilters({
      candidates,
      matchedBy: 'guid',
      filters: [enclosureConflictFilter],
      incoming: makeHashes({ enclosureHash: 'enc-1' }),
      channel: { linkUniquenessRate: 1.0 },
    })
    const expected = [candidates[0]]

    expect(value).toEqual(expected)
  })

  it('should apply filter with appliesTo all', () => {
    const filter: CandidateFilter = {
      name: 'blockAll',
      appliesTo: 'all',
      evaluate: () => {
        return { allow: false, reason: 'blocked' }
      },
    }
    const candidates = [makeItem({ id: 'a' })]
    const value = applyCandidateFilters({
      candidates,
      matchedBy: 'title',
      filters: [filter],
      incoming: makeHashes(),
      channel: { linkUniquenessRate: 1.0 },
    })

    expect(value).toEqual([])
  })

  it('should apply filters sequentially', () => {
    const filterA: CandidateFilter = {
      name: 'removeB',
      appliesTo: 'all',
      evaluate: (context) => {
        return context.candidate.id === 'b'
          ? { allow: false, reason: 'removed b' }
          : { allow: true }
      },
    }
    const filterB: CandidateFilter = {
      name: 'removeC',
      appliesTo: 'all',
      evaluate: (context) => {
        return context.candidate.id === 'c'
          ? { allow: false, reason: 'removed c' }
          : { allow: true }
      },
    }
    const candidates = [makeItem({ id: 'a' }), makeItem({ id: 'b' }), makeItem({ id: 'c' })]
    const value = applyCandidateFilters({
      candidates,
      matchedBy: 'guid',
      filters: [filterA, filterB],
      incoming: makeHashes(),
      channel: { linkUniquenessRate: 1.0 },
    })
    const expected = [candidates[0]]

    expect(value).toEqual(expected)
  })

  it('should return empty array when all candidates are removed', () => {
    const filter: CandidateFilter = {
      name: 'blockAll',
      appliesTo: 'all',
      evaluate: () => {
        return { allow: false, reason: 'blocked' }
      },
    }
    const candidates = [makeItem({ id: 'a' }), makeItem({ id: 'b' })]
    const value = applyCandidateFilters({
      candidates,
      matchedBy: 'guid',
      filters: [filter],
      incoming: makeHashes(),
      channel: { linkUniquenessRate: 1.0 },
    })

    expect(value).toEqual([])
  })

  it('should pass correct context to filter evaluate function', () => {
    const contexts: Array<CandidateFilterContext> = []
    const filter: CandidateFilter = {
      name: 'spy',
      appliesTo: 'all',
      evaluate: (context) => {
        contexts.push(context)
        return { allow: true }
      },
    }
    const candidate = makeItem({ id: 'a' })
    const hashes = makeHashes({ guidHash: 'guid-1' })
    applyCandidateFilters({
      candidates: [candidate],
      matchedBy: 'link',
      filters: [filter],
      incoming: hashes,
      channel: { linkUniquenessRate: 0.5 },
    })

    expect(contexts).toHaveLength(1)
    expect(contexts[0].matchedBy).toBe('link')
    expect(contexts[0].incoming).toBe(hashes)
    expect(contexts[0].candidate).toBe(candidate)
    expect(contexts[0].channel.linkUniquenessRate).toBe(0.5)
  })
})
