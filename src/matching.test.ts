import { describe, expect, it } from 'bun:test'
import {
  computeBatchLinkUniqueness,
  computeFeedProfile,
  findMatchCandidates,
  isLinkOnly,
  matchByEnclosure,
  matchByGuid,
  matchByLink,
  matchByTitle,
  selectMatchingItem,
} from './matching.js'
import type { ItemHashes, MatchableItem, MatchResult, MatchStrategyContext } from './types.js'

const makeItem = (overrides: Partial<MatchableItem> = {}): MatchableItem => {
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
      hashes: makeHashes({ guidHash: 'guid-1' }),
      candidates: [],
      linkUniquenessRate: 1.0,
    }
    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should match on guid with single candidate', () => {
    const candidate = makeItem({ guidHash: 'guid-1' })
    const value = {
      hashes: makeHashes({ guidHash: 'guid-1' }),
      candidates: [candidate],
      linkUniquenessRate: 1.0,
    }
    const expected: MatchResult = {
      match: candidate,
      identifierSource: 'guid',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should return null for ambiguous guid matches with no narrowing hashes', () => {
    const value = {
      hashes: makeHashes({ guidHash: 'guid-1' }),
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
      hashes: makeHashes({
        guidHash: 'guid-1',
        enclosureHash: 'enc-1',
      }),
      candidates: [target, makeItem({ id: 'b', guidHash: 'guid-1', enclosureHash: 'enc-2' })],
      linkUniquenessRate: 1.0,
    }
    const expected: MatchResult = { match: target, identifierSource: 'guid' }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should disambiguate guid matches by link when enclosure does not narrow', () => {
    const target = makeItem({ id: 'a', guidHash: 'guid-1', linkHash: 'link-1' })
    const value = {
      hashes: makeHashes({
        guidHash: 'guid-1',
        linkHash: 'link-1',
      }),
      candidates: [target, makeItem({ id: 'b', guidHash: 'guid-1', linkHash: 'link-2' })],
      linkUniquenessRate: 1.0,
    }
    const expected: MatchResult = { match: target, identifierSource: 'guid' }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should disambiguate guid matches by guidFragmentHash', () => {
    const target = makeItem({ id: 'a', guidHash: 'guid-1', guidFragmentHash: 'gf-1' })
    const value = {
      hashes: makeHashes({
        guidHash: 'guid-1',
        guidFragmentHash: 'gf-1',
      }),
      candidates: [target, makeItem({ id: 'b', guidHash: 'guid-1', guidFragmentHash: 'gf-2' })],
      linkUniquenessRate: 1.0,
    }
    const expected: MatchResult = { match: target, identifierSource: 'guid' }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should return null when guidFragmentHash is also ambiguous', () => {
    const value = {
      hashes: makeHashes({
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
      hashes: makeHashes({
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
      hashes: makeHashes({
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
      hashes: makeHashes({
        guidHash: 'guid-1',
        enclosureHash: 'enc-same',
      }),
      candidates: [candidate],
      linkUniquenessRate: 1.0,
    }
    const expected: MatchResult = {
      match: candidate,
      identifierSource: 'guid',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should allow guid match when candidate has no enclosure', () => {
    const candidate = makeItem({ guidHash: 'guid-1', enclosureHash: null })
    const value = {
      hashes: makeHashes({
        guidHash: 'guid-1',
        enclosureHash: 'enc-new',
      }),
      candidates: [candidate],
      linkUniquenessRate: 1.0,
    }
    const expected: MatchResult = {
      match: candidate,
      identifierSource: 'guid',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should allow guid match when incoming has no enclosure', () => {
    const candidate = makeItem({ guidHash: 'guid-1', enclosureHash: 'enc-existing' })
    const value = {
      hashes: makeHashes({ guidHash: 'guid-1' }),
      candidates: [candidate],
      linkUniquenessRate: 1.0,
    }
    const expected: MatchResult = {
      match: candidate,
      identifierSource: 'guid',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should match on link when high uniqueness', () => {
    const candidate = makeItem({ linkHash: 'link-1' })
    const value = {
      hashes: makeHashes({ linkHash: 'link-1' }),
      candidates: [candidate],
      linkUniquenessRate: 0.98,
    }
    const expected: MatchResult = {
      match: candidate,
      identifierSource: 'link',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should filter out link matches with enclosure conflict', () => {
    const value = {
      hashes: makeHashes({
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
      hashes: makeHashes({
        linkHash: 'link-1',
        enclosureHash: 'enc-same',
      }),
      candidates: [candidate],
      linkUniquenessRate: 0.98,
    }
    const expected: MatchResult = {
      match: candidate,
      identifierSource: 'link',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should allow link match when candidate has no enclosure', () => {
    const candidate = makeItem({ linkHash: 'link-1', enclosureHash: null })
    const value = {
      hashes: makeHashes({
        linkHash: 'link-1',
        enclosureHash: 'enc-new',
      }),
      candidates: [candidate],
      linkUniquenessRate: 0.98,
    }
    const expected: MatchResult = {
      match: candidate,
      identifierSource: 'link',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should disambiguate link matches by fragment on high-uniqueness channel', () => {
    const target = makeItem({ id: 'a', linkHash: 'link-1', linkFragmentHash: 'frag-1' })
    const value = {
      hashes: makeHashes({
        linkHash: 'link-1',
        linkFragmentHash: 'frag-1',
      }),
      candidates: [target, makeItem({ id: 'b', linkHash: 'link-1', linkFragmentHash: 'frag-2' })],
      linkUniquenessRate: 0.98,
    }
    const expected: MatchResult = { match: target, identifierSource: 'link' }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should return null when fragment is also ambiguous on high-uniqueness channel', () => {
    const value = {
      hashes: makeHashes({
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
      hashes: makeHashes({ linkHash: 'link-1' }),
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
      hashes: makeHashes({ enclosureHash: 'enc-1' }),
      candidates: [candidate],
      linkUniquenessRate: 0.98,
    }
    const expected: MatchResult = {
      match: candidate,
      identifierSource: 'enclosure',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should prioritize enclosure over link on low-uniqueness channel', () => {
    const candidates = [
      makeItem({ id: 'a', linkHash: 'link-shared', enclosureHash: 'enc-1' }),
      makeItem({ id: 'b', linkHash: 'link-shared', enclosureHash: 'enc-2' }),
    ]
    const value = {
      hashes: makeHashes({
        linkHash: 'link-shared',
        enclosureHash: 'enc-1',
      }),
      candidates,
      linkUniquenessRate: 0.3,
    }
    const expected: MatchResult = {
      match: candidates[0],
      identifierSource: 'enclosure',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should not match on link for non-link-only item on low-uniqueness channel', () => {
    const value = {
      hashes: makeHashes({
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
      hashes: makeHashes({ linkHash: 'link-1' }),
      candidates: [candidate],
      linkUniquenessRate: 0.3,
    }
    const expected: MatchResult = {
      match: candidate,
      identifierSource: 'link',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should disambiguate link matches by fragment on low-uniqueness channel for link-only item', () => {
    const target = makeItem({ id: 'a', linkHash: 'link-1', linkFragmentHash: 'frag-1' })
    const value = {
      hashes: makeHashes({
        linkHash: 'link-1',
        linkFragmentHash: 'frag-1',
      }),
      candidates: [target, makeItem({ id: 'b', linkHash: 'link-1', linkFragmentHash: 'frag-2' })],
      linkUniquenessRate: 0.3,
    }
    const expected: MatchResult = { match: target, identifierSource: 'link' }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should return null when fragment is also ambiguous on low-uniqueness channel', () => {
    const value = {
      hashes: makeHashes({
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
      hashes: makeHashes({ titleHash: 'title-1' }),
      candidates: [candidate],
      linkUniquenessRate: 1.0,
    }
    const expected: MatchResult = {
      match: candidate,
      identifierSource: 'title',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should return null for ambiguous title matches', () => {
    const value = {
      hashes: makeHashes({ titleHash: 'title-1' }),
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
      hashes: makeHashes({
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
      hashes: makeHashes({ summaryHash: 'sum-1' }),
      candidates: [makeItem({ summaryHash: 'sum-1' })],
      linkUniquenessRate: 1.0,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should not match on content-only candidates', () => {
    const value = {
      hashes: makeHashes({ contentHash: 'cnt-1' }),
      candidates: [makeItem({ contentHash: 'cnt-1' })],
      linkUniquenessRate: 1.0,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should prefer guid over link', () => {
    const guidCandidate = makeItem({ id: 'guid-match', guidHash: 'guid-1' })
    const linkCandidate = makeItem({ id: 'link-match', linkHash: 'link-1' })
    const value = {
      hashes: makeHashes({
        guidHash: 'guid-1',
        linkHash: 'link-1',
      }),
      candidates: [guidCandidate, linkCandidate],
      linkUniquenessRate: 1.0,
    }
    const expected: MatchResult = {
      match: guidCandidate,
      identifierSource: 'guid',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should prefer link over enclosure on high-uniqueness channel', () => {
    const linkCandidate = makeItem({ id: 'link-match', linkHash: 'link-1' })
    const encCandidate = makeItem({ id: 'enc-match', enclosureHash: 'enc-1' })
    const value = {
      hashes: makeHashes({
        linkHash: 'link-1',
        enclosureHash: 'enc-1',
      }),
      candidates: [linkCandidate, encCandidate],
      linkUniquenessRate: 0.98,
    }
    const expected: MatchResult = {
      match: linkCandidate,
      identifierSource: 'link',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should disambiguate multiple guid matches by enclosure when no conflict', () => {
    const target = makeItem({ id: 'a', guidHash: 'guid-1', enclosureHash: 'enc-1' })
    const value = {
      hashes: makeHashes({
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
    const expected: MatchResult = { match: target, identifierSource: 'guid' }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should return undefined for ambiguous enclosure matches on high-uniqueness channel', () => {
    const value = {
      hashes: makeHashes({ enclosureHash: 'enc-1' }),
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
      hashes: makeHashes({ enclosureHash: 'enc-1' }),
      candidates: [candidate],
      linkUniquenessRate: 0.3,
    }
    const expected: MatchResult = { match: candidate, identifierSource: 'enclosure' }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should return undefined for ambiguous enclosure matches on low-uniqueness channel', () => {
    const value = {
      hashes: makeHashes({ enclosureHash: 'enc-1' }),
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
      hashes: makeHashes({ linkHash: 'link-1' }),
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
      hashes: makeHashes({ guidHash: 'guid-x' }),
      candidates: [makeItem({ guidHash: 'guid-y', linkHash: 'link-1' })],
      linkUniquenessRate: 1.0,
    }
    expect(selectMatchingItem(value)).toBeUndefined()
  })
})

describe('computeBatchLinkUniqueness', () => {
  it('should return 1.0 for all unique hashes', () => {
    const value = ['hash-1', 'hash-2', 'hash-3']

    expect(computeBatchLinkUniqueness(value)).toBe(1.0)
  })

  it('should return 0.5 for half-unique hashes', () => {
    const value = ['hash-1', 'hash-1', 'hash-2', 'hash-2']

    expect(computeBatchLinkUniqueness(value)).toBe(0.5)
  })

  it('should return 0 for empty array', () => {
    expect(computeBatchLinkUniqueness([])).toBe(0)
  })

  it('should handle single hash', () => {
    const value = ['hash-1']

    expect(computeBatchLinkUniqueness(value)).toBe(1.0)
  })
})

describe('computeFeedProfile', () => {
  it('should return 1.0 when all link hashes are unique', () => {
    const existingItems = [
      makeItem({ id: 'a', linkHash: 'link-1' }),
      makeItem({ id: 'b', linkHash: 'link-2' }),
    ]
    const incomingLinkHashes = ['link-3', 'link-4']
    const expected = { linkUniquenessRate: 1.0 }

    expect(computeFeedProfile(existingItems, incomingLinkHashes)).toEqual(expected)
  })

  it('should return min of historical and batch rates', () => {
    const existingItems = [
      makeItem({ id: 'a', linkHash: 'link-1' }),
      makeItem({ id: 'b', linkHash: 'link-1' }),
    ]
    const incomingLinkHashes = ['link-3', 'link-4']
    const expected = { linkUniquenessRate: 0.5 }

    expect(computeFeedProfile(existingItems, incomingLinkHashes)).toEqual(expected)
  })

  it('should use batch rate when no historical link data exists', () => {
    const existingItems: Array<MatchableItem> = []
    const incomingLinkHashes = ['link-1', 'link-2']
    const expected = { linkUniquenessRate: 1.0 }

    expect(computeFeedProfile(existingItems, incomingLinkHashes)).toEqual(expected)
  })

  it('should use batch rate when existing items have only null link hashes', () => {
    const existingItems = [
      makeItem({ id: 'a', linkHash: null }),
      makeItem({ id: 'b', linkHash: null }),
    ]
    const incomingLinkHashes = ['link-1', 'link-2']
    const expected = { linkUniquenessRate: 1.0 }

    expect(computeFeedProfile(existingItems, incomingLinkHashes)).toEqual(expected)
  })

  it('should use historical rate when no incoming link hashes exist', () => {
    const existingItems = [
      makeItem({ id: 'a', linkHash: 'link-1' }),
      makeItem({ id: 'b', linkHash: 'link-1' }),
    ]
    const incomingLinkHashes: Array<string> = []
    const expected = { linkUniquenessRate: 0.5 }

    expect(computeFeedProfile(existingItems, incomingLinkHashes)).toEqual(expected)
  })

  it('should return 0 when neither side has link data', () => {
    const existingItems = [makeItem({ id: 'a' })]
    const incomingLinkHashes: Array<string> = []
    const expected = { linkUniquenessRate: 0 }

    expect(computeFeedProfile(existingItems, incomingLinkHashes)).toEqual(expected)
  })

  it('should ignore null link hashes in existing items', () => {
    const existingItems = [
      makeItem({ id: 'a', linkHash: null }),
      makeItem({ id: 'b', linkHash: 'link-1' }),
    ]
    const incomingLinkHashes = ['link-2']
    const expected = { linkUniquenessRate: 1.0 }

    expect(computeFeedProfile(existingItems, incomingLinkHashes)).toEqual(expected)
  })
})

const identity = (
  _identifierSource: string,
  filtered: Array<MatchableItem>,
): Array<MatchableItem> => {
  return filtered
}

describe('matchByGuid', () => {
  it('should match single guid candidate', () => {
    const candidate = makeItem({ guidHash: 'guid-1' })
    const context: MatchStrategyContext = {
      hashes: makeHashes({ guidHash: 'guid-1' }),
      candidates: [candidate],
      filtered: identity,
    }

    expect(matchByGuid(context)).toEqual({
      outcome: 'matched',
      result: { match: candidate, identifierSource: 'guid' },
    })
  })

  it('should disambiguate by enclosure when multiple guid matches', () => {
    const target = makeItem({ id: 'a', guidHash: 'guid-1', enclosureHash: 'enc-1' })
    const context: MatchStrategyContext = {
      hashes: makeHashes({
        guidHash: 'guid-1',
        enclosureHash: 'enc-1',
      }),
      candidates: [target, makeItem({ id: 'b', guidHash: 'guid-1', enclosureHash: 'enc-2' })],
      filtered: identity,
    }

    expect(matchByGuid(context)).toEqual({
      outcome: 'matched',
      result: { match: target, identifierSource: 'guid' },
    })
  })

  it('should disambiguate by guid fragment when enclosure fails', () => {
    const target = makeItem({ id: 'a', guidHash: 'guid-1', guidFragmentHash: 'gf-1' })
    const context: MatchStrategyContext = {
      hashes: makeHashes({
        guidHash: 'guid-1',
        guidFragmentHash: 'gf-1',
      }),
      candidates: [target, makeItem({ id: 'b', guidHash: 'guid-1', guidFragmentHash: 'gf-2' })],
      filtered: identity,
    }

    expect(matchByGuid(context)).toEqual({
      outcome: 'matched',
      result: { match: target, identifierSource: 'guid' },
    })
  })

  it('should disambiguate by link when guid fragment fails', () => {
    const target = makeItem({ id: 'a', guidHash: 'guid-1', linkHash: 'link-1' })
    const context: MatchStrategyContext = {
      hashes: makeHashes({
        guidHash: 'guid-1',
        linkHash: 'link-1',
      }),
      candidates: [target, makeItem({ id: 'b', guidHash: 'guid-1', linkHash: 'link-2' })],
      filtered: identity,
    }

    expect(matchByGuid(context)).toEqual({
      outcome: 'matched',
      result: { match: target, identifierSource: 'guid' },
    })
  })

  it('should return ambiguous when all disambiguation fails', () => {
    const context: MatchStrategyContext = {
      hashes: makeHashes({ guidHash: 'guid-1' }),
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
      hashes: makeHashes({ linkHash: 'link-1' }),
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
      hashes: makeHashes({ linkHash: 'link-1' }),
      candidates: [candidate],
      filtered: identity,
    }

    expect(matchByLink(context)).toEqual({
      outcome: 'matched',
      result: { match: candidate, identifierSource: 'link' },
    })
  })

  it('should disambiguate by link fragment when multiple matches', () => {
    const target = makeItem({ id: 'a', linkHash: 'link-1', linkFragmentHash: 'frag-1' })
    const context: MatchStrategyContext = {
      hashes: makeHashes({
        linkHash: 'link-1',
        linkFragmentHash: 'frag-1',
      }),
      candidates: [target, makeItem({ id: 'b', linkHash: 'link-1', linkFragmentHash: 'frag-2' })],
      filtered: identity,
    }

    expect(matchByLink(context)).toEqual({
      outcome: 'matched',
      result: { match: target, identifierSource: 'link' },
    })
  })

  it('should return ambiguous when fragment fails', () => {
    const context: MatchStrategyContext = {
      hashes: makeHashes({
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
      hashes: makeHashes({ guidHash: 'guid-1' }),
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
      hashes: makeHashes({ enclosureHash: 'enc-1' }),
      candidates: [candidate],
      filtered: identity,
    }

    expect(matchByEnclosure(context)).toEqual({
      outcome: 'matched',
      result: { match: candidate, identifierSource: 'enclosure' },
    })
  })

  it('should return ambiguous when multiple matches', () => {
    const context: MatchStrategyContext = {
      hashes: makeHashes({ enclosureHash: 'enc-1' }),
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
      hashes: makeHashes({ guidHash: 'guid-1' }),
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
      hashes: makeHashes({ titleHash: 'title-1' }),
      candidates: [candidate],
      filtered: identity,
    }

    expect(matchByTitle(context)).toEqual({
      outcome: 'matched',
      result: { match: candidate, identifierSource: 'title' },
    })
  })

  it('should return ambiguous when multiple matches', () => {
    const context: MatchStrategyContext = {
      hashes: makeHashes({ titleHash: 'title-1' }),
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
      hashes: makeHashes({ guidHash: 'guid-1' }),
      candidates: [makeItem({ titleHash: 'title-1' })],
      filtered: identity,
    }

    expect(matchByTitle(context)).toEqual({ outcome: 'pass' })
  })
})
