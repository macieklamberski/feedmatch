import { describe, expect, it } from 'bun:test'
import { computeFeedProfile, computeSignalStats } from './profile.js'
import type { ExistingItem, ItemHashes } from './types.js'

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
  it('should return 1.0 uniqueness when all link hashes are unique', () => {
    const existingItems = [
      makeItem({ id: 'a', linkHash: 'l-1' }),
      makeItem({ id: 'b', linkHash: 'l-2' }),
    ]
    const incomingHashes = [makeHashes({ linkHash: 'l-3' }), makeHashes({ linkHash: 'l-4' })]
    const profile = computeFeedProfile(existingItems, incomingHashes)
    const expected = { present: 4, total: 4, presenceRate: 1.0, distinct: 4, uniquenessRate: 1.0 }

    expect(profile.link).toEqual(expected)
  })

  it('should return min of historical and batch uniqueness rates', () => {
    const existingItems = [
      makeItem({ id: 'a', linkHash: 'l-1' }),
      makeItem({ id: 'b', linkHash: 'l-1' }),
    ]
    const incomingHashes = [makeHashes({ linkHash: 'l-3' }), makeHashes({ linkHash: 'l-4' })]
    const profile = computeFeedProfile(existingItems, incomingHashes)
    const expected = { present: 4, total: 4, presenceRate: 1.0, distinct: 3, uniquenessRate: 0.5 }

    expect(profile.link).toEqual(expected)
  })

  it('should use batch stats when no existing items', () => {
    const existingItems: Array<ExistingItem> = []
    const incomingHashes = [makeHashes({ linkHash: 'l-1' }), makeHashes({ linkHash: 'l-2' })]
    const profile = computeFeedProfile(existingItems, incomingHashes)
    const expected = {
      present: 2,
      total: 2,
      presenceRate: 1.0,
      distinct: 2,
      uniquenessRate: 1.0,
    }

    expect(profile.link).toEqual(expected)
  })

  it('should use batch stats when existing items have only null link hashes', () => {
    const existingItems = [
      makeItem({ id: 'a', linkHash: null }),
      makeItem({ id: 'b', linkHash: null }),
    ]
    const incomingHashes = [makeHashes({ linkHash: 'l-1' }), makeHashes({ linkHash: 'l-2' })]
    const profile = computeFeedProfile(existingItems, incomingHashes)
    const expected = { present: 2, total: 2, presenceRate: 1.0, distinct: 2, uniquenessRate: 1.0 }

    expect(profile.link).toEqual(expected)
  })

  it('should use historical stats when no incoming items', () => {
    const existingItems = [
      makeItem({ id: 'a', linkHash: 'l-1' }),
      makeItem({ id: 'b', linkHash: 'l-1' }),
    ]
    const incomingHashes: Array<ItemHashes> = []
    const profile = computeFeedProfile(existingItems, incomingHashes)
    const expected = {
      present: 2,
      total: 2,
      presenceRate: 1.0,
      distinct: 1,
      uniquenessRate: 0.5,
    }

    expect(profile.link).toEqual(expected)
  })

  it('should return zero stats when neither side has link data', () => {
    const existingItems = [makeItem({ id: 'a' })]
    const incomingHashes: Array<ItemHashes> = []
    const profile = computeFeedProfile(existingItems, incomingHashes)
    const expected = {
      present: 0,
      total: 0,
      presenceRate: 0,
      distinct: 0,
      uniquenessRate: 0,
    }

    expect(profile.link).toEqual(expected)
  })

  it('should ignore null link hashes in existing items', () => {
    const existingItems = [
      makeItem({ id: 'a', linkHash: null }),
      makeItem({ id: 'b', linkHash: 'l-1' }),
    ]
    const incomingHashes = [makeHashes({ linkHash: 'l-2' })]
    const profile = computeFeedProfile(existingItems, incomingHashes)
    const expected = { present: 2, total: 3, presenceRate: 0.5, distinct: 2, uniquenessRate: 1.0 }

    expect(profile.link).toEqual(expected)
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
    const incomingHashes = [
      makeHashes({
        guidHash: 'g-3',
        linkHash: 'l-3',
        enclosureHash: 'e-3',
        titleHash: 't-3',
      }),
    ]
    const profile = computeFeedProfile(existingItems, incomingHashes)
    const expectedGuid = {
      present: 3,
      total: 3,
      presenceRate: 1.0,
      distinct: 3,
      uniquenessRate: 1.0,
    }
    const expectedLink = {
      present: 3,
      total: 3,
      presenceRate: 1.0,
      distinct: 2,
      uniquenessRate: 0.5,
    }
    const expectedEnclosure = {
      present: 3,
      total: 3,
      presenceRate: 1.0,
      distinct: 3,
      uniquenessRate: 1.0,
    }
    const expectedTitle = {
      present: 3,
      total: 3,
      presenceRate: 1.0,
      distinct: 2,
      uniquenessRate: 0.5,
    }

    expect(profile.guid).toEqual(expectedGuid)
    expect(profile.link).toEqual(expectedLink)
    expect(profile.enclosure).toEqual(expectedEnclosure)
    expect(profile.title).toEqual(expectedTitle)
  })

  it('should return zero stats for absent signals across both sides', () => {
    const existingItems = [makeItem({ id: 'a', guidHash: 'g-1' })]
    const incomingHashes = [makeHashes({ guidHash: 'g-2' })]
    const profile = computeFeedProfile(existingItems, incomingHashes)
    const expected = { present: 0, total: 1, presenceRate: 0, distinct: 0, uniquenessRate: 0 }

    expect(profile.enclosure).toEqual(expected)
  })

  it('should combine counts from both sides', () => {
    const existingItems = [
      makeItem({ id: 'a', guidHash: 'g-1' }),
      makeItem({ id: 'b', guidHash: 'g-2' }),
    ]
    const incomingHashes = [makeHashes({ guidHash: 'g-3' })]
    const profile = computeFeedProfile(existingItems, incomingHashes)
    const expected = { present: 3, total: 3, presenceRate: 1.0, distinct: 3, uniquenessRate: 1.0 }

    expect(profile.guid).toEqual(expected)
  })
})
