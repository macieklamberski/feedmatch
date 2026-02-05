import { describe, expect, it } from 'bun:test'
import {
  applyCandidateFilters,
  classifyCandidateFilters,
  computeFeedProfile,
  computeMatchPolicy,
  computeSignalStats,
  contentChangeFilter,
  dateProximityFilter,
  enclosureConflictFilter,
  findMatchCandidates,
  hasLinkOnly,
  highUniquenessStrategies,
  lowUniquenessStrategies,
  matchByEnclosure,
  matchByGuid,
  matchByLink,
  matchByTitle,
  resolveStrategies,
  selectMatchingItem,
} from './matching.js'
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
  MatchStrategyContext,
} from './types.js'

const makeExistingItem = (overrides: Partial<ExistingItem> = {}): ExistingItem => {
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

const makeIncomingItem = (overrides: Partial<IncomingItem> = {}): IncomingItem => {
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

const zeroStats: FeedProfileStats = {
  present: 0,
  total: 0,
  presenceRate: 0,
  distinct: 0,
  uniquenessRate: 0,
}

const zeroSignal = {
  existing: zeroStats,
  incoming: zeroStats,
  effective: { presenceRate: 0, uniquenessRate: 0 },
}

const makeFeedProfile = (linkUniquenessRate: number): FeedProfile => {
  return {
    guid: zeroSignal,
    link: {
      ...zeroSignal,
      effective: { presenceRate: 0, uniquenessRate: linkUniquenessRate },
    },
    enclosure: zeroSignal,
    title: zeroSignal,
  }
}

describe('computeSignalStats', () => {
  it('should return full stats when all values are present and unique', () => {
    const value = ['hash-1', 'hash-2', 'hash-3']
    const expected = {
      present: 3,
      total: 3,
      presenceRate: 1.0,
      distinct: 3,
      uniquenessRate: 1.0,
    }

    expect(computeSignalStats(value)).toEqual(expected)
  })

  it('should return correct stats when some values are duplicated', () => {
    const value = ['hash-1', 'hash-1', 'hash-2', 'hash-2']
    const expected = {
      present: 4,
      total: 4,
      presenceRate: 1.0,
      distinct: 2,
      uniquenessRate: 0.5,
    }

    expect(computeSignalStats(value)).toEqual(expected)
  })

  it('should compute presence rate with mixed null values', () => {
    const value = ['hash-1', null, 'hash-2', null]
    const expected = {
      present: 2,
      total: 4,
      presenceRate: 0.5,
      distinct: 2,
      uniquenessRate: 1.0,
    }

    expect(computeSignalStats(value)).toEqual(expected)
  })

  it('should handle single present value', () => {
    const value = ['hash-1']
    const expected = {
      present: 1,
      total: 1,
      presenceRate: 1.0,
      distinct: 1,
      uniquenessRate: 1.0,
    }

    expect(computeSignalStats(value)).toEqual(expected)
  })

  it('should return zero rates for empty array', () => {
    const expected = { present: 0, total: 0, presenceRate: 0, distinct: 0, uniquenessRate: 0 }

    expect(computeSignalStats([])).toEqual(expected)
  })

  it('should return zero uniqueness when all values are null', () => {
    const value = [null, null, null]
    const expected = {
      present: 0,
      total: 3,
      presenceRate: 0,
      distinct: 0,
      uniquenessRate: 0,
    }

    expect(computeSignalStats(value)).toEqual(expected)
  })
})

describe('computeFeedProfile', () => {
  it('should return 1.0 effective uniqueness when all link hashes are unique', () => {
    const existingItems = [
      makeExistingItem({ id: 'a', linkHash: 'l-1' }),
      makeExistingItem({ id: 'b', linkHash: 'l-2' }),
    ]
    const incomingItems = [
      makeIncomingItem({ linkHash: 'l-3' }),
      makeIncomingItem({ linkHash: 'l-4' }),
    ]
    const profile = computeFeedProfile(existingItems, incomingItems)

    expect(profile.link).toEqual({
      existing: { present: 2, total: 2, presenceRate: 1.0, distinct: 2, uniquenessRate: 1.0 },
      incoming: { present: 2, total: 2, presenceRate: 1.0, distinct: 2, uniquenessRate: 1.0 },
      effective: { presenceRate: 1.0, uniquenessRate: 1.0 },
    })
  })

  it('should return min of existing and incoming uniqueness rates', () => {
    const existingItems = [
      makeExistingItem({ id: 'a', linkHash: 'l-1' }),
      makeExistingItem({ id: 'b', linkHash: 'l-1' }),
    ]
    const incomingItems = [
      makeIncomingItem({ linkHash: 'l-3' }),
      makeIncomingItem({ linkHash: 'l-4' }),
    ]
    const profile = computeFeedProfile(existingItems, incomingItems)

    expect(profile.link).toEqual({
      existing: { present: 2, total: 2, presenceRate: 1.0, distinct: 1, uniquenessRate: 0.5 },
      incoming: { present: 2, total: 2, presenceRate: 1.0, distinct: 2, uniquenessRate: 1.0 },
      effective: { presenceRate: 1.0, uniquenessRate: 0.5 },
    })
  })

  it('should use incoming stats when no existing items', () => {
    const existingItems: Array<ExistingItem> = []
    const incomingItems = [
      makeIncomingItem({ linkHash: 'l-1' }),
      makeIncomingItem({ linkHash: 'l-2' }),
    ]
    const profile = computeFeedProfile(existingItems, incomingItems)

    expect(profile.link).toEqual({
      existing: { present: 0, total: 0, presenceRate: 0, distinct: 0, uniquenessRate: 0 },
      incoming: { present: 2, total: 2, presenceRate: 1.0, distinct: 2, uniquenessRate: 1.0 },
      effective: { presenceRate: 1.0, uniquenessRate: 1.0 },
    })
  })

  it('should use incoming stats when existing items have only null link hashes', () => {
    const existingItems = [
      makeExistingItem({ id: 'a', linkHash: null }),
      makeExistingItem({ id: 'b', linkHash: null }),
    ]
    const incomingItems = [
      makeIncomingItem({ linkHash: 'l-1' }),
      makeIncomingItem({ linkHash: 'l-2' }),
    ]
    const profile = computeFeedProfile(existingItems, incomingItems)

    expect(profile.link).toEqual({
      existing: { present: 0, total: 2, presenceRate: 0, distinct: 0, uniquenessRate: 0 },
      incoming: { present: 2, total: 2, presenceRate: 1.0, distinct: 2, uniquenessRate: 1.0 },
      effective: { presenceRate: 1.0, uniquenessRate: 1.0 },
    })
  })

  it('should use existing stats when no incoming items', () => {
    const existingItems = [
      makeExistingItem({ id: 'a', linkHash: 'l-1' }),
      makeExistingItem({ id: 'b', linkHash: 'l-1' }),
    ]
    const incomingItems: Array<IncomingItem> = []
    const profile = computeFeedProfile(existingItems, incomingItems)

    expect(profile.link).toEqual({
      existing: { present: 2, total: 2, presenceRate: 1.0, distinct: 1, uniquenessRate: 0.5 },
      incoming: { present: 0, total: 0, presenceRate: 0, distinct: 0, uniquenessRate: 0 },
      effective: { presenceRate: 1.0, uniquenessRate: 0.5 },
    })
  })

  it('should fall back to incoming when neither side has present link values', () => {
    const existingItems = [makeExistingItem({ id: 'a' })]
    const incomingItems: Array<IncomingItem> = []
    const profile = computeFeedProfile(existingItems, incomingItems)

    expect(profile.link).toEqual({
      existing: { present: 0, total: 1, presenceRate: 0, distinct: 0, uniquenessRate: 0 },
      incoming: { present: 0, total: 0, presenceRate: 0, distinct: 0, uniquenessRate: 0 },
      effective: { presenceRate: 0, uniquenessRate: 0 },
    })
  })

  it('should compute min effective rate when existing has mixed null values', () => {
    const existingItems = [
      makeExistingItem({ id: 'a', linkHash: null }),
      makeExistingItem({ id: 'b', linkHash: 'l-1' }),
    ]
    const incomingItems = [makeIncomingItem({ linkHash: 'l-2' })]
    const profile = computeFeedProfile(existingItems, incomingItems)

    expect(profile.link).toEqual({
      existing: { present: 1, total: 2, presenceRate: 0.5, distinct: 1, uniquenessRate: 1.0 },
      incoming: { present: 1, total: 1, presenceRate: 1.0, distinct: 1, uniquenessRate: 1.0 },
      effective: { presenceRate: 0.5, uniquenessRate: 1.0 },
    })
  })

  it('should compute independent stats per signal', () => {
    const existingItems = [
      makeExistingItem({
        id: 'a',
        guidHash: 'g-1',
        linkHash: 'l-shared',
        enclosureHash: 'e-1',
        titleHash: 't-shared',
      }),
      makeExistingItem({
        id: 'b',
        guidHash: 'g-2',
        linkHash: 'l-shared',
        enclosureHash: 'e-2',
        titleHash: 't-shared',
      }),
    ]
    const incomingItems = [
      makeIncomingItem({
        guidHash: 'g-3',
        linkHash: 'l-3',
        enclosureHash: 'e-3',
        titleHash: 't-3',
      }),
    ]
    const profile = computeFeedProfile(existingItems, incomingItems)

    expect(profile.guid).toEqual({
      existing: { present: 2, total: 2, presenceRate: 1.0, distinct: 2, uniquenessRate: 1.0 },
      incoming: { present: 1, total: 1, presenceRate: 1.0, distinct: 1, uniquenessRate: 1.0 },
      effective: { presenceRate: 1.0, uniquenessRate: 1.0 },
    })
    expect(profile.link).toEqual({
      existing: { present: 2, total: 2, presenceRate: 1.0, distinct: 1, uniquenessRate: 0.5 },
      incoming: { present: 1, total: 1, presenceRate: 1.0, distinct: 1, uniquenessRate: 1.0 },
      effective: { presenceRate: 1.0, uniquenessRate: 0.5 },
    })
    expect(profile.enclosure).toEqual({
      existing: { present: 2, total: 2, presenceRate: 1.0, distinct: 2, uniquenessRate: 1.0 },
      incoming: { present: 1, total: 1, presenceRate: 1.0, distinct: 1, uniquenessRate: 1.0 },
      effective: { presenceRate: 1.0, uniquenessRate: 1.0 },
    })
    expect(profile.title).toEqual({
      existing: { present: 2, total: 2, presenceRate: 1.0, distinct: 1, uniquenessRate: 0.5 },
      incoming: { present: 1, total: 1, presenceRate: 1.0, distinct: 1, uniquenessRate: 1.0 },
      effective: { presenceRate: 1.0, uniquenessRate: 0.5 },
    })
  })

  it('should return zero stats for absent signals across both sides', () => {
    const existingItems = [makeExistingItem({ id: 'a', guidHash: 'g-1' })]
    const incomingItems = [makeIncomingItem({ guidHash: 'g-2' })]
    const profile = computeFeedProfile(existingItems, incomingItems)

    expect(profile.enclosure).toEqual({
      existing: { present: 0, total: 1, presenceRate: 0, distinct: 0, uniquenessRate: 0 },
      incoming: { present: 0, total: 1, presenceRate: 0, distinct: 0, uniquenessRate: 0 },
      effective: { presenceRate: 0, uniquenessRate: 0 },
    })
  })

  it('should return 1.0 effective rates when all items on both sides are unique', () => {
    const existingItems = [
      makeExistingItem({ id: 'a', guidHash: 'g-1' }),
      makeExistingItem({ id: 'b', guidHash: 'g-2' }),
    ]
    const incomingItems = [makeIncomingItem({ guidHash: 'g-3' })]
    const profile = computeFeedProfile(existingItems, incomingItems)

    expect(profile.guid).toEqual({
      existing: { present: 2, total: 2, presenceRate: 1.0, distinct: 2, uniquenessRate: 1.0 },
      incoming: { present: 1, total: 1, presenceRate: 1.0, distinct: 1, uniquenessRate: 1.0 },
      effective: { presenceRate: 1.0, uniquenessRate: 1.0 },
    })
  })
})

describe('hasLinkOnly', () => {
  it('should return true when only linkHash is present', () => {
    const value = makeIncomingItem({ linkHash: 'abc' })

    expect(hasLinkOnly(value)).toBe(true)
  })

  it('should return false when guidHash is also present', () => {
    const value = makeIncomingItem({
      linkHash: 'abc',
      guidHash: 'def',
    })

    expect(hasLinkOnly(value)).toBe(false)
  })

  it('should return false when enclosureHash is also present', () => {
    const value = makeIncomingItem({
      linkHash: 'abc',
      enclosureHash: 'def',
    })

    expect(hasLinkOnly(value)).toBe(false)
  })

  it('should return false when no linkHash', () => {
    const value = makeIncomingItem({ guidHash: 'abc' })

    expect(hasLinkOnly(value)).toBe(false)
  })

  it('should return false when empty', () => {
    const value = makeIncomingItem()

    expect(hasLinkOnly(value)).toBe(false)
  })
})

describe('findMatchCandidates', () => {
  it('should match on guidHash', () => {
    const value = makeHashes({ guidHash: 'guid-1' })
    const existing = [
      makeExistingItem({ id: 'a', guidHash: 'guid-1' }),
      makeExistingItem({ id: 'b', guidHash: 'guid-2' }),
    ]
    const expected = [existing[0]]

    expect(findMatchCandidates(value, existing)).toEqual(expected)
  })

  it('should match on linkHash', () => {
    const value = makeHashes({ linkHash: 'link-1' })
    const existing = [
      makeExistingItem({ id: 'a', linkHash: 'link-1' }),
      makeExistingItem({ id: 'b', linkHash: 'link-2' }),
    ]
    const expected = [existing[0]]

    expect(findMatchCandidates(value, existing)).toEqual(expected)
  })

  it('should match on enclosureHash', () => {
    const value = makeHashes({ enclosureHash: 'enc-1' })
    const existing = [
      makeExistingItem({ id: 'a', enclosureHash: 'enc-1' }),
      makeExistingItem({ id: 'b', enclosureHash: 'enc-2' }),
    ]
    const expected = [existing[0]]

    expect(findMatchCandidates(value, existing)).toEqual(expected)
  })

  it('should match on titleHash', () => {
    const value = makeHashes({ titleHash: 'title-1' })
    const existing = [
      makeExistingItem({ id: 'a', titleHash: 'title-1' }),
      makeExistingItem({ id: 'b', titleHash: 'title-2' }),
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
      makeExistingItem({ id: 'a', guidHash: 'guid-1' }),
      makeExistingItem({ id: 'b', linkHash: 'link-2' }),
    ]
    const expected = [existing[0], existing[1]]

    expect(findMatchCandidates(value, existing)).toEqual(expected)
  })

  it('should not duplicate items matching on multiple hashes', () => {
    const value = makeHashes({
      guidHash: 'guid-1',
      linkHash: 'link-1',
    })
    const existing = [makeExistingItem({ id: 'a', guidHash: 'guid-1', linkHash: 'link-1' })]
    const expected = [existing[0]]

    expect(findMatchCandidates(value, existing)).toEqual(expected)
  })

  it('should return empty array when no matches', () => {
    const value = makeHashes({ guidHash: 'guid-x' })
    const existing = [makeExistingItem({ id: 'a', guidHash: 'guid-1' })]

    expect(findMatchCandidates(value, existing)).toEqual([])
  })

  it('should return empty array for empty existing items', () => {
    const value = makeHashes({ guidHash: 'guid-1' })

    expect(findMatchCandidates(value, [])).toEqual([])
  })

  it('should not match on summaryHash', () => {
    const value = makeHashes({ summaryHash: 'sum-1' })
    const existing = [
      makeExistingItem({ id: 'a', summaryHash: 'sum-1' }),
      makeExistingItem({ id: 'b', summaryHash: 'sum-2' }),
    ]

    expect(findMatchCandidates(value, existing)).toEqual([])
  })

  it('should not match on contentHash', () => {
    const value = makeHashes({ contentHash: 'cnt-1' })
    const existing = [
      makeExistingItem({ id: 'a', contentHash: 'cnt-1' }),
      makeExistingItem({ id: 'b', contentHash: 'cnt-2' }),
    ]

    expect(findMatchCandidates(value, existing)).toEqual([])
  })

  it('should not match on titleHash when strong hashes present', () => {
    const value = makeHashes({
      guidHash: 'guid-1',
      titleHash: 'title-1',
    })
    const existing = [makeExistingItem({ id: 'a', titleHash: 'title-1' })]

    expect(findMatchCandidates(value, existing)).toEqual([])
  })

  it('should not match on null hash values', () => {
    const value = makeHashes()
    const existing = [makeExistingItem({ id: 'a', guidHash: null, linkHash: null })]

    expect(findMatchCandidates(value, existing)).toEqual([])
  })
})

describe('selectMatchingItem', () => {
  it('should return null for empty candidates', () => {
    const value = {
      incoming: makeIncomingItem({ guidHash: 'guid-1' }),
      candidates: [],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should match on guid with single candidate', () => {
    const candidate = makeExistingItem({ guidHash: 'guid-1' })
    const value = {
      incoming: makeIncomingItem({ guidHash: 'guid-1' }),
      candidates: [candidate],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    const expected: MatchResult = {
      match: candidate,
      matchedBy: 'guid',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should return null for ambiguous guid matches with no narrowing hashes', () => {
    const value = {
      incoming: makeIncomingItem({ guidHash: 'guid-1' }),
      candidates: [
        makeExistingItem({ id: 'a', guidHash: 'guid-1' }),
        makeExistingItem({ id: 'b', guidHash: 'guid-1' }),
      ],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should disambiguate guid matches by enclosure', () => {
    const target = makeExistingItem({ id: 'a', guidHash: 'guid-1', enclosureHash: 'enc-1' })
    const value = {
      incoming: makeIncomingItem({
        guidHash: 'guid-1',
        enclosureHash: 'enc-1',
      }),
      candidates: [
        target,
        makeExistingItem({ id: 'b', guidHash: 'guid-1', enclosureHash: 'enc-2' }),
      ],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    const expected: MatchResult = { match: target, matchedBy: 'guid' }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should disambiguate guid matches by link when enclosure does not narrow', () => {
    const target = makeExistingItem({ id: 'a', guidHash: 'guid-1', linkHash: 'link-1' })
    const value = {
      incoming: makeIncomingItem({
        guidHash: 'guid-1',
        linkHash: 'link-1',
      }),
      candidates: [target, makeExistingItem({ id: 'b', guidHash: 'guid-1', linkHash: 'link-2' })],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    const expected: MatchResult = { match: target, matchedBy: 'guid' }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should disambiguate guid matches by guidFragmentHash', () => {
    const target = makeExistingItem({ id: 'a', guidHash: 'guid-1', guidFragmentHash: 'gf-1' })
    const value = {
      incoming: makeIncomingItem({
        guidHash: 'guid-1',
        guidFragmentHash: 'gf-1',
      }),
      candidates: [
        target,
        makeExistingItem({ id: 'b', guidHash: 'guid-1', guidFragmentHash: 'gf-2' }),
      ],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    const expected: MatchResult = { match: target, matchedBy: 'guid' }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should return null when guidFragmentHash is also ambiguous', () => {
    const value = {
      incoming: makeIncomingItem({
        guidHash: 'guid-1',
        guidFragmentHash: 'gf-shared',
      }),
      candidates: [
        makeExistingItem({ id: 'a', guidHash: 'guid-1', guidFragmentHash: 'gf-shared' }),
        makeExistingItem({ id: 'b', guidHash: 'guid-1', guidFragmentHash: 'gf-shared' }),
      ],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should return null when guid disambiguation still ambiguous', () => {
    const value = {
      incoming: makeIncomingItem({
        guidHash: 'guid-1',
        linkHash: 'link-shared',
      }),
      candidates: [
        makeExistingItem({ id: 'a', guidHash: 'guid-1', linkHash: 'link-shared' }),
        makeExistingItem({ id: 'b', guidHash: 'guid-1', linkHash: 'link-shared' }),
      ],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should reject guid match when enclosures conflict', () => {
    const value = {
      incoming: makeIncomingItem({
        guidHash: 'guid-1',
        enclosureHash: 'enc-new',
      }),
      candidates: [makeExistingItem({ guidHash: 'guid-1', enclosureHash: 'enc-old' })],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should allow guid match when enclosures are same', () => {
    const candidate = makeExistingItem({ guidHash: 'guid-1', enclosureHash: 'enc-same' })
    const value = {
      incoming: makeIncomingItem({
        guidHash: 'guid-1',
        enclosureHash: 'enc-same',
      }),
      candidates: [candidate],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    const expected: MatchResult = {
      match: candidate,
      matchedBy: 'guid',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should allow guid match when candidate has no enclosure', () => {
    const candidate = makeExistingItem({ guidHash: 'guid-1', enclosureHash: null })
    const value = {
      incoming: makeIncomingItem({
        guidHash: 'guid-1',
        enclosureHash: 'enc-new',
      }),
      candidates: [candidate],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    const expected: MatchResult = {
      match: candidate,
      matchedBy: 'guid',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should allow guid match when incoming has no enclosure', () => {
    const candidate = makeExistingItem({ guidHash: 'guid-1', enclosureHash: 'enc-existing' })
    const value = {
      incoming: makeIncomingItem({ guidHash: 'guid-1' }),
      candidates: [candidate],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    const expected: MatchResult = {
      match: candidate,
      matchedBy: 'guid',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should match on link when high uniqueness', () => {
    const candidate = makeExistingItem({ linkHash: 'link-1' })
    const value = {
      incoming: makeIncomingItem({ linkHash: 'link-1' }),
      candidates: [candidate],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    const expected: MatchResult = {
      match: candidate,
      matchedBy: 'link',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should filter out link matches with enclosure conflict', () => {
    const value = {
      incoming: makeIncomingItem({
        linkHash: 'link-1',
        enclosureHash: 'enc-new',
      }),
      candidates: [makeExistingItem({ linkHash: 'link-1', enclosureHash: 'enc-old' })],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should allow link match when enclosures are same', () => {
    const candidate = makeExistingItem({ linkHash: 'link-1', enclosureHash: 'enc-same' })
    const value = {
      incoming: makeIncomingItem({
        linkHash: 'link-1',
        enclosureHash: 'enc-same',
      }),
      candidates: [candidate],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    const expected: MatchResult = {
      match: candidate,
      matchedBy: 'link',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should allow link match when candidate has no enclosure', () => {
    const candidate = makeExistingItem({ linkHash: 'link-1', enclosureHash: null })
    const value = {
      incoming: makeIncomingItem({
        linkHash: 'link-1',
        enclosureHash: 'enc-new',
      }),
      candidates: [candidate],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    const expected: MatchResult = {
      match: candidate,
      matchedBy: 'link',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should disambiguate link matches by fragment on high-uniqueness channel', () => {
    const target = makeExistingItem({ id: 'a', linkHash: 'link-1', linkFragmentHash: 'frag-1' })
    const value = {
      incoming: makeIncomingItem({
        linkHash: 'link-1',
        linkFragmentHash: 'frag-1',
      }),
      candidates: [
        target,
        makeExistingItem({ id: 'b', linkHash: 'link-1', linkFragmentHash: 'frag-2' }),
      ],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    const expected: MatchResult = { match: target, matchedBy: 'link' }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should return null when fragment is also ambiguous on high-uniqueness channel', () => {
    const value = {
      incoming: makeIncomingItem({
        linkHash: 'link-1',
        linkFragmentHash: 'frag-shared',
      }),
      candidates: [
        makeExistingItem({ id: 'a', linkHash: 'link-1', linkFragmentHash: 'frag-shared' }),
        makeExistingItem({ id: 'b', linkHash: 'link-1', linkFragmentHash: 'frag-shared' }),
      ],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should return null when incoming has no fragment and link is ambiguous', () => {
    const value = {
      incoming: makeIncomingItem({ linkHash: 'link-1' }),
      candidates: [
        makeExistingItem({ id: 'a', linkHash: 'link-1', linkFragmentHash: 'frag-1' }),
        makeExistingItem({ id: 'b', linkHash: 'link-1', linkFragmentHash: 'frag-2' }),
      ],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should match on enclosure when high uniqueness and no link match', () => {
    const candidate = makeExistingItem({ enclosureHash: 'enc-1' })
    const value = {
      incoming: makeIncomingItem({ enclosureHash: 'enc-1' }),
      candidates: [candidate],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    const expected: MatchResult = {
      match: candidate,
      matchedBy: 'enclosure',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should prioritize enclosure over link on low-uniqueness channel', () => {
    const candidates = [
      makeExistingItem({ id: 'a', linkHash: 'link-shared', enclosureHash: 'enc-1' }),
      makeExistingItem({ id: 'b', linkHash: 'link-shared', enclosureHash: 'enc-2' }),
    ]
    const value = {
      incoming: makeIncomingItem({
        linkHash: 'link-shared',
        enclosureHash: 'enc-1',
      }),
      candidates,
      matchPolicy: { linkReliable: false, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    const expected: MatchResult = {
      match: candidates[0],
      matchedBy: 'enclosure',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should not match on link for non-link-only item on low-uniqueness channel', () => {
    const value = {
      incoming: makeIncomingItem({
        linkHash: 'link-1',
        guidHash: 'guid-x',
      }),
      candidates: [makeExistingItem({ linkHash: 'link-1' })],
      matchPolicy: { linkReliable: false, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should match on link for link-only item on low-uniqueness channel', () => {
    const candidate = makeExistingItem({ linkHash: 'link-1' })
    const value = {
      incoming: makeIncomingItem({ linkHash: 'link-1' }),
      candidates: [candidate],
      matchPolicy: { linkReliable: false, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    const expected: MatchResult = {
      match: candidate,
      matchedBy: 'link',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should disambiguate link matches by fragment on low-uniqueness channel for link-only item', () => {
    const target = makeExistingItem({ id: 'a', linkHash: 'link-1', linkFragmentHash: 'frag-1' })
    const value = {
      incoming: makeIncomingItem({
        linkHash: 'link-1',
        linkFragmentHash: 'frag-1',
      }),
      candidates: [
        target,
        makeExistingItem({ id: 'b', linkHash: 'link-1', linkFragmentHash: 'frag-2' }),
      ],
      matchPolicy: { linkReliable: false, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    const expected: MatchResult = { match: target, matchedBy: 'link' }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should return null when fragment is also ambiguous on low-uniqueness channel', () => {
    const value = {
      incoming: makeIncomingItem({
        linkHash: 'link-1',
        linkFragmentHash: 'frag-shared',
      }),
      candidates: [
        makeExistingItem({ id: 'a', linkHash: 'link-1', linkFragmentHash: 'frag-shared' }),
        makeExistingItem({ id: 'b', linkHash: 'link-1', linkFragmentHash: 'frag-shared' }),
      ],
      matchPolicy: { linkReliable: false, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should match on title as last resort', () => {
    const candidate = makeExistingItem({ titleHash: 'title-1' })
    const value = {
      incoming: makeIncomingItem({ titleHash: 'title-1' }),
      candidates: [candidate],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    const expected: MatchResult = {
      match: candidate,
      matchedBy: 'title',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should return null for ambiguous title matches', () => {
    const value = {
      incoming: makeIncomingItem({ titleHash: 'title-1' }),
      candidates: [
        makeExistingItem({ id: 'a', titleHash: 'title-1' }),
        makeExistingItem({ id: 'b', titleHash: 'title-1' }),
      ],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should not match on title when strong hashes present', () => {
    const value = {
      incoming: makeIncomingItem({
        guidHash: 'guid-x',
        titleHash: 'title-1',
      }),
      candidates: [makeExistingItem({ titleHash: 'title-1' })],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should not match on summary-only candidates', () => {
    const value = {
      incoming: makeIncomingItem({ summaryHash: 'sum-1' }),
      candidates: [makeExistingItem({ summaryHash: 'sum-1' })],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should not match on content-only candidates', () => {
    const value = {
      incoming: makeIncomingItem({ contentHash: 'cnt-1' }),
      candidates: [makeExistingItem({ contentHash: 'cnt-1' })],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should prefer guid over link', () => {
    const guidCandidate = makeExistingItem({ id: 'guid-match', guidHash: 'guid-1' })
    const linkCandidate = makeExistingItem({ id: 'link-match', linkHash: 'link-1' })
    const value = {
      incoming: makeIncomingItem({
        guidHash: 'guid-1',
        linkHash: 'link-1',
      }),
      candidates: [guidCandidate, linkCandidate],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    const expected: MatchResult = {
      match: guidCandidate,
      matchedBy: 'guid',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should prefer link over enclosure on high-uniqueness channel', () => {
    const linkCandidate = makeExistingItem({ id: 'link-match', linkHash: 'link-1' })
    const encCandidate = makeExistingItem({ id: 'enc-match', enclosureHash: 'enc-1' })
    const value = {
      incoming: makeIncomingItem({
        linkHash: 'link-1',
        enclosureHash: 'enc-1',
      }),
      candidates: [linkCandidate, encCandidate],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    const expected: MatchResult = {
      match: linkCandidate,
      matchedBy: 'link',
    }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should disambiguate multiple guid matches by enclosure when no conflict', () => {
    const target = makeExistingItem({ id: 'a', guidHash: 'guid-1', enclosureHash: 'enc-1' })
    const value = {
      incoming: makeIncomingItem({
        guidHash: 'guid-1',
        enclosureHash: 'enc-1',
      }),
      candidates: [
        target,
        makeExistingItem({ id: 'b', guidHash: 'guid-1', enclosureHash: 'enc-2' }),
        makeExistingItem({ id: 'c', guidHash: 'guid-1', enclosureHash: null }),
      ],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    const expected: MatchResult = { match: target, matchedBy: 'guid' }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should return undefined for ambiguous enclosure matches on high-uniqueness channel', () => {
    const value = {
      incoming: makeIncomingItem({ enclosureHash: 'enc-1' }),
      candidates: [
        makeExistingItem({ id: 'a', enclosureHash: 'enc-1' }),
        makeExistingItem({ id: 'b', enclosureHash: 'enc-1' }),
      ],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should match on enclosure on low-uniqueness channel', () => {
    const candidate = makeExistingItem({ enclosureHash: 'enc-1' })
    const value = {
      incoming: makeIncomingItem({ enclosureHash: 'enc-1' }),
      candidates: [candidate],
      matchPolicy: { linkReliable: false, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    const expected: MatchResult = { match: candidate, matchedBy: 'enclosure' }

    expect(selectMatchingItem(value)).toEqual(expected)
  })

  it('should return undefined for ambiguous enclosure matches on low-uniqueness channel', () => {
    const value = {
      incoming: makeIncomingItem({ enclosureHash: 'enc-1' }),
      candidates: [
        makeExistingItem({ id: 'a', enclosureHash: 'enc-1' }),
        makeExistingItem({ id: 'b', enclosureHash: 'enc-1' }),
      ],
      matchPolicy: { linkReliable: false, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should return undefined for ambiguous link-only matches on low-uniqueness channel', () => {
    const value = {
      incoming: makeIncomingItem({ linkHash: 'link-1' }),
      candidates: [
        makeExistingItem({ id: 'a', linkHash: 'link-1' }),
        makeExistingItem({ id: 'b', linkHash: 'link-1' }),
      ],
      matchPolicy: { linkReliable: false, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }

    expect(selectMatchingItem(value)).toBeUndefined()
  })

  it('should return null when no hashes match any priority', () => {
    const value = {
      incoming: makeIncomingItem({ guidHash: 'guid-x' }),
      candidates: [makeExistingItem({ guidHash: 'guid-y', linkHash: 'link-1' })],
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
      candidateFilters: classifyCandidateFilters,
    }
    expect(selectMatchingItem(value)).toBeUndefined()
  })
})

describe('computeMatchPolicy', () => {
  it('should set linkReliable to true when rate is 1.0', () => {
    const value = makeFeedProfile(1.0)

    expect(computeMatchPolicy(value)).toEqual({ linkReliable: true, dateProximityDays: 7 })
  })

  it('should set linkReliable to true when rate is exactly 0.95', () => {
    const value = makeFeedProfile(0.95)

    expect(computeMatchPolicy(value)).toEqual({ linkReliable: true, dateProximityDays: 7 })
  })

  it('should set linkReliable to false when rate is below 0.95', () => {
    const value = makeFeedProfile(0.94)

    expect(computeMatchPolicy(value)).toEqual({ linkReliable: false, dateProximityDays: 7 })
  })

  it('should set linkReliable to false when rate is 0', () => {
    const value = makeFeedProfile(0)

    expect(computeMatchPolicy(value)).toEqual({ linkReliable: false, dateProximityDays: 7 })
  })
})

describe('resolveStrategies', () => {
  it('should return high uniqueness strategies when link is reliable', () => {
    const value: MatchPolicy = { linkReliable: true, dateProximityDays: 7 }

    expect(resolveStrategies(value)).toBe(highUniquenessStrategies)
  })

  it('should return low uniqueness strategies when link is not reliable', () => {
    const value: MatchPolicy = { linkReliable: false, dateProximityDays: 7 }

    expect(resolveStrategies(value)).toBe(lowUniquenessStrategies)
  })
})

const identity = (_matchedBy: string, filtered: Array<ExistingItem>): Array<ExistingItem> => {
  return filtered
}

describe('matchByGuid', () => {
  it('should match single guid candidate', () => {
    const candidate = makeExistingItem({ guidHash: 'guid-1' })
    const context: MatchStrategyContext = {
      incoming: makeIncomingItem({ guidHash: 'guid-1' }),
      candidates: [candidate],
      filtered: identity,
    }

    expect(matchByGuid(context)).toEqual({
      outcome: 'matched',
      result: { match: candidate, matchedBy: 'guid' },
    })
  })

  it('should disambiguate by enclosure when multiple guid matches', () => {
    const target = makeExistingItem({ id: 'a', guidHash: 'guid-1', enclosureHash: 'enc-1' })
    const context: MatchStrategyContext = {
      incoming: makeIncomingItem({
        guidHash: 'guid-1',
        enclosureHash: 'enc-1',
      }),
      candidates: [
        target,
        makeExistingItem({ id: 'b', guidHash: 'guid-1', enclosureHash: 'enc-2' }),
      ],
      filtered: identity,
    }

    expect(matchByGuid(context)).toEqual({
      outcome: 'matched',
      result: { match: target, matchedBy: 'guid' },
    })
  })

  it('should disambiguate by guid fragment when enclosure fails', () => {
    const target = makeExistingItem({ id: 'a', guidHash: 'guid-1', guidFragmentHash: 'gf-1' })
    const context: MatchStrategyContext = {
      incoming: makeIncomingItem({
        guidHash: 'guid-1',
        guidFragmentHash: 'gf-1',
      }),
      candidates: [
        target,
        makeExistingItem({ id: 'b', guidHash: 'guid-1', guidFragmentHash: 'gf-2' }),
      ],
      filtered: identity,
    }

    expect(matchByGuid(context)).toEqual({
      outcome: 'matched',
      result: { match: target, matchedBy: 'guid' },
    })
  })

  it('should disambiguate by link when guid fragment fails', () => {
    const target = makeExistingItem({ id: 'a', guidHash: 'guid-1', linkHash: 'link-1' })
    const context: MatchStrategyContext = {
      incoming: makeIncomingItem({
        guidHash: 'guid-1',
        linkHash: 'link-1',
      }),
      candidates: [target, makeExistingItem({ id: 'b', guidHash: 'guid-1', linkHash: 'link-2' })],
      filtered: identity,
    }

    expect(matchByGuid(context)).toEqual({
      outcome: 'matched',
      result: { match: target, matchedBy: 'guid' },
    })
  })

  it('should return ambiguous when all disambiguation fails', () => {
    const context: MatchStrategyContext = {
      incoming: makeIncomingItem({ guidHash: 'guid-1' }),
      candidates: [
        makeExistingItem({ id: 'a', guidHash: 'guid-1' }),
        makeExistingItem({ id: 'b', guidHash: 'guid-1' }),
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
      incoming: makeIncomingItem({ linkHash: 'link-1' }),
      candidates: [makeExistingItem({ guidHash: 'guid-1' })],
      filtered: identity,
    }

    expect(matchByGuid(context)).toEqual({ outcome: 'pass' })
  })
})

describe('matchByLink', () => {
  it('should match single link candidate', () => {
    const candidate = makeExistingItem({ linkHash: 'link-1' })
    const context: MatchStrategyContext = {
      incoming: makeIncomingItem({ linkHash: 'link-1' }),
      candidates: [candidate],
      filtered: identity,
    }

    expect(matchByLink(context)).toEqual({
      outcome: 'matched',
      result: { match: candidate, matchedBy: 'link' },
    })
  })

  it('should disambiguate by link fragment when multiple matches', () => {
    const target = makeExistingItem({ id: 'a', linkHash: 'link-1', linkFragmentHash: 'frag-1' })
    const context: MatchStrategyContext = {
      incoming: makeIncomingItem({
        linkHash: 'link-1',
        linkFragmentHash: 'frag-1',
      }),
      candidates: [
        target,
        makeExistingItem({ id: 'b', linkHash: 'link-1', linkFragmentHash: 'frag-2' }),
      ],
      filtered: identity,
    }

    expect(matchByLink(context)).toEqual({
      outcome: 'matched',
      result: { match: target, matchedBy: 'link' },
    })
  })

  it('should return ambiguous when fragment fails', () => {
    const context: MatchStrategyContext = {
      incoming: makeIncomingItem({
        linkHash: 'link-1',
        linkFragmentHash: 'frag-shared',
      }),
      candidates: [
        makeExistingItem({ id: 'a', linkHash: 'link-1', linkFragmentHash: 'frag-shared' }),
        makeExistingItem({ id: 'b', linkHash: 'link-1', linkFragmentHash: 'frag-shared' }),
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
      incoming: makeIncomingItem({ guidHash: 'guid-1' }),
      candidates: [makeExistingItem({ linkHash: 'link-1' })],
      filtered: identity,
    }

    expect(matchByLink(context)).toEqual({ outcome: 'pass' })
  })
})

describe('matchByEnclosure', () => {
  it('should match single enclosure candidate', () => {
    const candidate = makeExistingItem({ enclosureHash: 'enc-1' })
    const context: MatchStrategyContext = {
      incoming: makeIncomingItem({ enclosureHash: 'enc-1' }),
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
      incoming: makeIncomingItem({ enclosureHash: 'enc-1' }),
      candidates: [
        makeExistingItem({ id: 'a', enclosureHash: 'enc-1' }),
        makeExistingItem({ id: 'b', enclosureHash: 'enc-1' }),
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
      incoming: makeIncomingItem({ guidHash: 'guid-1' }),
      candidates: [makeExistingItem({ enclosureHash: 'enc-1' })],
      filtered: identity,
    }

    expect(matchByEnclosure(context)).toEqual({ outcome: 'pass' })
  })
})

describe('matchByTitle', () => {
  it('should match single title candidate', () => {
    const candidate = makeExistingItem({ titleHash: 'title-1' })
    const context: MatchStrategyContext = {
      incoming: makeIncomingItem({ titleHash: 'title-1' }),
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
      incoming: makeIncomingItem({ titleHash: 'title-1' }),
      candidates: [
        makeExistingItem({ id: 'a', titleHash: 'title-1' }),
        makeExistingItem({ id: 'b', titleHash: 'title-1' }),
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
      incoming: makeIncomingItem({ guidHash: 'guid-1' }),
      candidates: [makeExistingItem({ titleHash: 'title-1' })],
      filtered: identity,
    }

    expect(matchByTitle(context)).toEqual({ outcome: 'pass' })
  })
})

describe('enclosureConflictFilter', () => {
  it('should reject when both sides have different enclosures on guid source', () => {
    const value: CandidateFilterContext = {
      matchedBy: 'guid',
      incoming: makeIncomingItem({ enclosureHash: 'enc-new' }),
      candidate: makeExistingItem({ enclosureHash: 'enc-old' }),
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
    }

    expect(enclosureConflictFilter.evaluate(value)).toEqual({
      allow: false,
      reason: 'Enclosure hash mismatch',
    })
  })

  it('should reject when both sides have different enclosures on link source', () => {
    const value: CandidateFilterContext = {
      matchedBy: 'link',
      incoming: makeIncomingItem({ enclosureHash: 'enc-new' }),
      candidate: makeExistingItem({ enclosureHash: 'enc-old' }),
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
    }

    expect(enclosureConflictFilter.evaluate(value)).toEqual({
      allow: false,
      reason: 'Enclosure hash mismatch',
    })
  })

  it('should allow when enclosures match', () => {
    const value: CandidateFilterContext = {
      matchedBy: 'guid',
      incoming: makeIncomingItem({ enclosureHash: 'enc-same' }),
      candidate: makeExistingItem({ enclosureHash: 'enc-same' }),
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
    }

    expect(enclosureConflictFilter.evaluate(value)).toEqual({ allow: true })
  })

  it('should allow when candidate has no enclosure', () => {
    const value: CandidateFilterContext = {
      matchedBy: 'guid',
      incoming: makeIncomingItem({ enclosureHash: 'enc-new' }),
      candidate: makeExistingItem({ enclosureHash: null }),
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
    }

    expect(enclosureConflictFilter.evaluate(value)).toEqual({ allow: true })
  })

  it('should allow when incoming has no enclosure', () => {
    const value: CandidateFilterContext = {
      matchedBy: 'guid',
      incoming: makeIncomingItem(),
      candidate: makeExistingItem({ enclosureHash: 'enc-existing' }),
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
    }

    expect(enclosureConflictFilter.evaluate(value)).toEqual({ allow: true })
  })

  it('should allow when neither side has enclosure', () => {
    const value: CandidateFilterContext = {
      matchedBy: 'guid',
      incoming: makeIncomingItem(),
      candidate: makeExistingItem({ enclosureHash: null }),
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
    }

    expect(enclosureConflictFilter.evaluate(value)).toEqual({ allow: true })
  })

  it('should only apply to guid and link sources', () => {
    expect(enclosureConflictFilter.appliesTo).toEqual(['guid', 'link'])
  })
})

describe('dateProximityFilter', () => {
  it('should allow match when dates are within threshold', () => {
    const now = new Date()
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const value: CandidateFilterContext = {
      matchedBy: 'guid',
      incoming: makeIncomingItem({ publishedAt: now }),
      candidate: makeExistingItem({ publishedAt: threeDaysAgo }),
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
    }

    expect(dateProximityFilter.evaluate(value)).toEqual({ allow: true })
  })

  it('should reject match when dates exceed threshold', () => {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const value: CandidateFilterContext = {
      matchedBy: 'guid',
      incoming: makeIncomingItem({ publishedAt: now }),
      candidate: makeExistingItem({ publishedAt: thirtyDaysAgo }),
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
    }
    const result = dateProximityFilter.evaluate(value)

    expect(result.allow).toBe(false)
  })

  it('should allow match when incoming has no publishedAt', () => {
    const value: CandidateFilterContext = {
      matchedBy: 'guid',
      incoming: makeIncomingItem(),
      candidate: makeExistingItem({ publishedAt: new Date() }),
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
    }

    expect(dateProximityFilter.evaluate(value)).toEqual({ allow: true })
  })

  it('should allow match when candidate has no publishedAt', () => {
    const value: CandidateFilterContext = {
      matchedBy: 'guid',
      incoming: makeIncomingItem({ publishedAt: new Date() }),
      candidate: makeExistingItem(),
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
    }

    expect(dateProximityFilter.evaluate(value)).toEqual({ allow: true })
  })

  it('should allow match when neither has publishedAt', () => {
    const value: CandidateFilterContext = {
      matchedBy: 'guid',
      incoming: makeIncomingItem(),
      candidate: makeExistingItem(),
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
    }

    expect(dateProximityFilter.evaluate(value)).toEqual({ allow: true })
  })

  it('should respect custom dateProximityDays threshold', () => {
    const now = new Date()
    const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000)
    const value: CandidateFilterContext = {
      matchedBy: 'guid',
      incoming: makeIncomingItem({ publishedAt: now }),
      candidate: makeExistingItem({ publishedAt: twentyDaysAgo }),
      matchPolicy: { linkReliable: true, dateProximityDays: 30 },
    }

    expect(dateProximityFilter.evaluate(value)).toEqual({ allow: true })
  })

  it('should only apply to guid matches', () => {
    expect(dateProximityFilter.appliesTo).toEqual(['guid'])
  })
})

describe('contentChangeFilter', () => {
  it('should update when title changes', () => {
    const value = {
      existing: makeExistingItem({ titleHash: 'title-1' }),
      incoming: makeIncomingItem({ titleHash: 'title-2' }),
      matchedBy: 'guid' as MatchedBy,
    }

    expect(contentChangeFilter.shouldUpdate(value)).toBe(true)
  })

  it('should update when summary changes', () => {
    const value = {
      existing: makeExistingItem({ summaryHash: 'sum-1' }),
      incoming: makeIncomingItem({ summaryHash: 'sum-2' }),
      matchedBy: 'guid' as MatchedBy,
    }

    expect(contentChangeFilter.shouldUpdate(value)).toBe(true)
  })

  it('should update when content changes', () => {
    const value = {
      existing: makeExistingItem({ contentHash: 'cnt-1' }),
      incoming: makeIncomingItem({ contentHash: 'cnt-2' }),
      matchedBy: 'guid' as MatchedBy,
    }

    expect(contentChangeFilter.shouldUpdate(value)).toBe(true)
  })

  it('should update when enclosure changes', () => {
    const value = {
      existing: makeExistingItem({ enclosureHash: 'enc-1' }),
      incoming: makeIncomingItem({ enclosureHash: 'enc-2' }),
      matchedBy: 'guid' as MatchedBy,
    }

    expect(contentChangeFilter.shouldUpdate(value)).toBe(true)
  })

  it('should not update when all content hashes match', () => {
    const value = {
      existing: makeExistingItem({
        titleHash: 'title-1',
        summaryHash: 'sum-1',
        contentHash: 'cnt-1',
        enclosureHash: 'enc-1',
      }),
      incoming: makeIncomingItem({
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
      existing: makeExistingItem({ titleHash: null, contentHash: null }),
      incoming: makeIncomingItem(),
      matchedBy: 'guid' as MatchedBy,
    }

    expect(contentChangeFilter.shouldUpdate(value)).toBe(false)
  })

  it('should ignore non-content hashes', () => {
    const value = {
      existing: makeExistingItem({ guidHash: 'guid-1', linkHash: 'link-1' }),
      incoming: makeIncomingItem({ guidHash: 'guid-2', linkHash: 'link-2' }),
      matchedBy: 'guid' as MatchedBy,
    }

    expect(contentChangeFilter.shouldUpdate(value)).toBe(false)
  })
})

describe('applyCandidateFilters', () => {
  it('should return all candidates when no filters apply', () => {
    const candidates = [makeExistingItem({ id: 'a' }), makeExistingItem({ id: 'b' })]
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
      incoming: makeIncomingItem(),
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
    })

    expect(value).toEqual(candidates)
  })

  it('should filter candidates using applicable filter', () => {
    const candidates = [
      makeExistingItem({ id: 'a', enclosureHash: 'enc-1' }),
      makeExistingItem({ id: 'b', enclosureHash: 'enc-2' }),
    ]
    const value = applyCandidateFilters({
      candidates,
      matchedBy: 'guid',
      filters: [enclosureConflictFilter],
      incoming: makeIncomingItem({ enclosureHash: 'enc-1' }),
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
    })
    const expected = [candidates[0]]

    expect(value).toEqual(expected)
  })

  it('should apply filter to all match types', () => {
    const filter: CandidateFilter = {
      name: 'blockAll',
      appliesTo: ['guid', 'link', 'enclosure', 'title'],
      evaluate: () => {
        return { allow: false, reason: 'blocked' }
      },
    }
    const candidates = [makeExistingItem({ id: 'a' })]
    const value = applyCandidateFilters({
      candidates,
      matchedBy: 'title',
      filters: [filter],
      incoming: makeIncomingItem(),
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
    })

    expect(value).toEqual([])
  })

  it('should apply filters sequentially', () => {
    const filterA: CandidateFilter = {
      name: 'removeB',
      appliesTo: ['guid', 'link', 'enclosure', 'title'],
      evaluate: (context) => {
        return context.candidate.id === 'b'
          ? { allow: false, reason: 'removed b' }
          : { allow: true }
      },
    }
    const filterB: CandidateFilter = {
      name: 'removeC',
      appliesTo: ['guid', 'link', 'enclosure', 'title'],
      evaluate: (context) => {
        return context.candidate.id === 'c'
          ? { allow: false, reason: 'removed c' }
          : { allow: true }
      },
    }
    const candidates = [
      makeExistingItem({ id: 'a' }),
      makeExistingItem({ id: 'b' }),
      makeExistingItem({ id: 'c' }),
    ]
    const value = applyCandidateFilters({
      candidates,
      matchedBy: 'guid',
      filters: [filterA, filterB],
      incoming: makeIncomingItem(),
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
    })
    const expected = [candidates[0]]

    expect(value).toEqual(expected)
  })

  it('should return empty array when all candidates are removed', () => {
    const filter: CandidateFilter = {
      name: 'blockAll',
      appliesTo: ['guid', 'link', 'enclosure', 'title'],
      evaluate: () => {
        return { allow: false, reason: 'blocked' }
      },
    }
    const candidates = [makeExistingItem({ id: 'a' }), makeExistingItem({ id: 'b' })]
    const value = applyCandidateFilters({
      candidates,
      matchedBy: 'guid',
      filters: [filter],
      incoming: makeIncomingItem(),
      matchPolicy: { linkReliable: true, dateProximityDays: 7 },
    })

    expect(value).toEqual([])
  })

  it('should pass correct context to filter evaluate function', () => {
    const contexts: Array<CandidateFilterContext> = []
    const filter: CandidateFilter = {
      name: 'spy',
      appliesTo: ['guid', 'link', 'enclosure', 'title'],
      evaluate: (context) => {
        contexts.push(context)
        return { allow: true }
      },
    }
    const candidate = makeExistingItem({ id: 'a' })
    const incoming = makeIncomingItem({ guidHash: 'guid-1' })
    const matchPolicy: MatchPolicy = { linkReliable: false, dateProximityDays: 7 }
    applyCandidateFilters({
      candidates: [candidate],
      matchedBy: 'link',
      filters: [filter],
      incoming,
      matchPolicy,
    })
    const expected: CandidateFilterContext = {
      matchedBy: 'link',
      incoming,
      candidate,
      matchPolicy,
    }

    expect(contexts).toHaveLength(1)
    expect(contexts[0]).toEqual(expected)
  })
})
