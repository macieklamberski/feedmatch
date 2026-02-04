import { describe, expect, it } from 'bun:test'
import { computeItemHashes } from './hashes.js'
import {
  composeItemIdentifiers,
  computeAllHashes,
  deduplicateItemsByIdentifier,
  filterItemsWithIdentifier,
  scoreItem,
} from './pipeline.js'
import type {
  ComposedFeedItem,
  HashableItem,
  HashedFeedItem,
  IdentifiedFeedItem,
  ItemHashes,
} from './types.js'

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

describe('scoreItem', () => {
  it('should sum weights for multiple hashes', () => {
    const value = makeHashes({ guidHash: 'g1', linkHash: 'l1', titleHash: 't1' })

    expect(scoreItem(value)).toBe(32 + 8 + 4)
  })

  it('should return max score when all hashes present', () => {
    const value = makeHashes({
      guidHash: 'g1',
      enclosureHash: 'e1',
      linkHash: 'l1',
      titleHash: 't1',
      contentHash: 'c1',
      summaryHash: 's1',
    })

    expect(scoreItem(value)).toBe(32 + 16 + 8 + 4 + 2 + 1)
  })

  it('should weight guid highest', () => {
    expect(scoreItem(makeHashes({ guidHash: 'g1' }))).toBe(32)
  })

  it('should return 0 for empty hashes', () => {
    expect(scoreItem(makeHashes())).toBe(0)
  })
})

describe('computeAllHashes', () => {
  it('should map items to hashed pairs', () => {
    const value: Array<HashableItem> = [
      { guid: 'guid-1', title: 'Title 1' },
      { link: 'https://example.com/post' },
    ]
    const expected = [
      {
        item: { guid: 'guid-1', title: 'Title 1' },
        hashes: computeItemHashes({ guid: 'guid-1', title: 'Title 1' }),
      },
      {
        item: { link: 'https://example.com/post' },
        hashes: computeItemHashes({ link: 'https://example.com/post' }),
      },
    ]

    expect(computeAllHashes(value)).toEqual(expected)
  })

  it('should return empty array for empty input', () => {
    expect(computeAllHashes([])).toEqual([])
  })
})

describe('filterItemsWithIdentifier', () => {
  it('should keep items with identifier', () => {
    const value: Array<ComposedFeedItem<HashableItem>> = [
      {
        item: { guid: 'g1' },
        hashes: makeHashes({ guidHash: 'gh1' }),
        identifier: 'g:gh1',
      },
    ]
    const expected: Array<IdentifiedFeedItem<HashableItem>> = [
      {
        item: { guid: 'g1' },
        hashes: makeHashes({ guidHash: 'gh1' }),
        identifier: 'g:gh1',
      },
    ]

    expect(filterItemsWithIdentifier(value)).toEqual(expected)
  })

  it('should filter mixed items keeping only identified ones', () => {
    const value: Array<ComposedFeedItem<HashableItem>> = [
      {
        item: { guid: 'g1' },
        hashes: makeHashes({ guidHash: 'gh1' }),
        identifier: 'g:gh1',
      },
      {
        item: {},
        hashes: makeHashes(),
        identifier: undefined,
      },
      {
        item: { title: 'Title' },
        hashes: makeHashes({ titleHash: 'th1' }),
        identifier: 'g:|gf:|l:|lf:|e:|t:th1',
      },
    ]
    const expected: Array<IdentifiedFeedItem<HashableItem>> = [
      {
        item: { guid: 'g1' },
        hashes: makeHashes({ guidHash: 'gh1' }),
        identifier: 'g:gh1',
      },
      {
        item: { title: 'Title' },
        hashes: makeHashes({ titleHash: 'th1' }),
        identifier: 'g:|gf:|l:|lf:|e:|t:th1',
      },
    ]

    expect(filterItemsWithIdentifier(value)).toEqual(expected)
  })

  it('should return empty array when no items have identifier', () => {
    const value: Array<ComposedFeedItem<HashableItem>> = [
      {
        item: {},
        hashes: makeHashes(),
        identifier: undefined,
      },
    ]

    expect(filterItemsWithIdentifier(value)).toEqual([])
  })
})

describe('deduplicateItemsByIdentifier', () => {
  it('should keep first item when duplicates have equal scores', () => {
    const value: Array<IdentifiedFeedItem<HashableItem>> = [
      {
        item: { guid: 'g1', content: 'first' },
        hashes: makeHashes({ guidHash: 'gh1' }),
        identifier: 'key1',
      },
      {
        item: { guid: 'g1', content: 'second' },
        hashes: makeHashes({ guidHash: 'gh1' }),
        identifier: 'key1',
      },
    ]
    const expected: Array<IdentifiedFeedItem<HashableItem>> = [
      {
        item: { guid: 'g1', content: 'first' },
        hashes: makeHashes({ guidHash: 'gh1' }),
        identifier: 'key1',
      },
    ]

    expect(deduplicateItemsByIdentifier(value)).toEqual(expected)
  })

  it('should keep richer item when scores differ', () => {
    const value: Array<IdentifiedFeedItem<HashableItem>> = [
      {
        item: { guid: 'g1' },
        hashes: makeHashes({ guidHash: 'gh1' }),
        identifier: 'key1',
      },
      {
        item: { guid: 'g1', link: 'https://example.com' },
        hashes: makeHashes({ guidHash: 'gh1', linkHash: 'lh1' }),
        identifier: 'key1',
      },
    ]
    const expected: Array<IdentifiedFeedItem<HashableItem>> = [
      {
        item: { guid: 'g1', link: 'https://example.com' },
        hashes: makeHashes({ guidHash: 'gh1', linkHash: 'lh1' }),
        identifier: 'key1',
      },
    ]

    expect(deduplicateItemsByIdentifier(value)).toEqual(expected)
  })

  it('should keep items with different identifiers', () => {
    const value: Array<IdentifiedFeedItem<HashableItem>> = [
      {
        item: { guid: 'g1' },
        hashes: makeHashes({ guidHash: 'gh1' }),
        identifier: 'key1',
      },
      {
        item: { guid: 'g2' },
        hashes: makeHashes({ guidHash: 'gh2' }),
        identifier: 'key2',
      },
    ]
    const expected: Array<IdentifiedFeedItem<HashableItem>> = [
      {
        item: { guid: 'g1' },
        hashes: makeHashes({ guidHash: 'gh1' }),
        identifier: 'key1',
      },
      {
        item: { guid: 'g2' },
        hashes: makeHashes({ guidHash: 'gh2' }),
        identifier: 'key2',
      },
    ]

    expect(deduplicateItemsByIdentifier(value)).toEqual(expected)
  })

  it('should return empty array for empty input', () => {
    expect(deduplicateItemsByIdentifier([])).toEqual([])
  })
})

describe('composeItemIdentifiers', () => {
  it('should compose identifiers for all items at given depth', () => {
    const value: Array<HashedFeedItem<HashableItem>> = [
      { item: { guid: 'g1' }, hashes: makeHashes({ guidHash: 'gh1', linkHash: 'lh1' }) },
      { item: { guid: 'g2' }, hashes: makeHashes({ guidHash: 'gh2' }) },
    ]
    const expected: Array<ComposedFeedItem<HashableItem>> = [
      {
        item: { guid: 'g1' },
        hashes: makeHashes({ guidHash: 'gh1', linkHash: 'lh1' }),
        identifier: 'g:gh1',
      },
      { item: { guid: 'g2' }, hashes: makeHashes({ guidHash: 'gh2' }), identifier: 'g:gh2' },
    ]

    expect(composeItemIdentifiers(value, 'guid')).toEqual(expected)
  })

  it('should return undefined identifier when no hashes in prefix', () => {
    const value: Array<HashedFeedItem<HashableItem>> = [{ item: {}, hashes: makeHashes() }]
    const expected: Array<ComposedFeedItem<HashableItem>> = [
      { item: {}, hashes: makeHashes(), identifier: undefined },
    ]

    expect(composeItemIdentifiers(value, 'guid')).toEqual(expected)
  })

  it('should return empty array for empty input', () => {
    expect(composeItemIdentifiers([], 'guid')).toEqual([])
  })
})
