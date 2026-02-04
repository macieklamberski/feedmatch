import { describe, expect, it } from 'bun:test'
import { computeFeedProfile, computeSignalStats } from './profile.js'
import type { ExistingItem, IncomingItem } from './types.js'

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
      makeItem({ id: 'a', linkHash: 'l-1' }),
      makeItem({ id: 'b', linkHash: 'l-2' }),
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
      makeItem({ id: 'a', linkHash: 'l-1' }),
      makeItem({ id: 'b', linkHash: 'l-1' }),
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
      makeItem({ id: 'a', linkHash: null }),
      makeItem({ id: 'b', linkHash: null }),
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
      makeItem({ id: 'a', linkHash: 'l-1' }),
      makeItem({ id: 'b', linkHash: 'l-1' }),
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
    const existingItems = [makeItem({ id: 'a' })]
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
      makeItem({ id: 'a', linkHash: null }),
      makeItem({ id: 'b', linkHash: 'l-1' }),
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
      makeItem({
        id: 'a',
        guidHash: 'g-1',
        linkHash: 'l-shared',
        enclosureHash: 'e-1',
        titleHash: 't-shared',
      }),
      makeItem({
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
    const existingItems = [makeItem({ id: 'a', guidHash: 'g-1' })]
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
      makeItem({ id: 'a', guidHash: 'g-1' }),
      makeItem({ id: 'b', guidHash: 'g-2' }),
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
