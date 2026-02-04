import { describe, expect, it } from 'bun:test'
import {
  buildFingerprints,
  classifyItems,
  composeIncomingItems,
  deduplicateItemsByFingerprint,
  scoreItem,
} from './classifier.js'
import { computeItemHashes } from './hashes.js'
import type {
  ClassifyItemsInput,
  ClassifyItemsResult,
  ExistingItem,
  FingerprintedItem,
  FingerprintLevel,
  IncomingItem,
  ItemHashes,
  NewItem,
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

const makeMatchable = (input: NewItem & { id?: string } = {}): ExistingItem => {
  const { id = 'item-1', ...hashableFields } = input
  return { id, ...computeItemHashes(hashableFields) }
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

describe('composeIncomingItems', () => {
  it('should map items to hashed pairs', () => {
    const value: Array<NewItem> = [
      { guid: 'guid-1', title: 'Title 1' },
      { link: 'https://example.com/post' },
    ]
    const expected = [
      {
        guid: 'guid-1',
        title: 'Title 1',
        ...computeItemHashes({ guid: 'guid-1', title: 'Title 1' }),
      },
      {
        link: 'https://example.com/post',
        ...computeItemHashes({ link: 'https://example.com/post' }),
      },
    ]

    expect(composeIncomingItems(value)).toEqual(expected)
  })

  it('should return empty array for empty input', () => {
    expect(composeIncomingItems([])).toEqual([])
  })
})

describe('buildFingerprints', () => {
  it('should build fingerprints for all items at given level', () => {
    const value: Array<IncomingItem> = [
      { guid: 'g1', ...makeHashes({ guidHash: 'gh1', linkHash: 'lh1' }) },
      { guid: 'g2', ...makeHashes({ guidHash: 'gh2' }) },
    ]
    const expected: Array<FingerprintedItem> = [
      { guid: 'g1', ...makeHashes({ guidHash: 'gh1', linkHash: 'lh1' }), fingerprint: 'g:gh1' },
      { guid: 'g2', ...makeHashes({ guidHash: 'gh2' }), fingerprint: 'g:gh2' },
    ]

    expect(buildFingerprints(value, 'guid')).toEqual(expected)
  })

  it('should drop items with no fingerprint', () => {
    const value: Array<IncomingItem> = [
      { guid: 'g1', ...makeHashes({ guidHash: 'gh1' }) },
      { ...makeHashes() },
      { title: 'Title', ...makeHashes({ titleHash: 'th1' }) },
    ]
    const expected: Array<FingerprintedItem> = [
      { guid: 'g1', ...makeHashes({ guidHash: 'gh1' }), fingerprint: 'g:gh1|gf:|l:|lf:|e:|t:' },
      {
        title: 'Title',
        ...makeHashes({ titleHash: 'th1' }),
        fingerprint: 'g:|gf:|l:|lf:|e:|t:th1',
      },
    ]

    expect(buildFingerprints(value, 'title')).toEqual(expected)
  })

  it('should return empty array when no items have fingerprint', () => {
    const value: Array<IncomingItem> = [{ ...makeHashes() }]

    expect(buildFingerprints(value, 'guid')).toEqual([])
  })

  it('should return empty array for empty input', () => {
    expect(buildFingerprints([], 'guid')).toEqual([])
  })
})

describe('deduplicateItemsByFingerprint', () => {
  it('should keep first item when duplicates have equal scores', () => {
    const value: Array<FingerprintedItem> = [
      { guid: 'g1', content: 'first', ...makeHashes({ guidHash: 'gh1' }), fingerprint: 'key1' },
      { guid: 'g1', content: 'second', ...makeHashes({ guidHash: 'gh1' }), fingerprint: 'key1' },
    ]
    const expected: Array<FingerprintedItem> = [
      { guid: 'g1', content: 'first', ...makeHashes({ guidHash: 'gh1' }), fingerprint: 'key1' },
    ]

    expect(deduplicateItemsByFingerprint(value)).toEqual(expected)
  })

  it('should keep richer item when scores differ', () => {
    const value: Array<FingerprintedItem> = [
      { guid: 'g1', ...makeHashes({ guidHash: 'gh1' }), fingerprint: 'key1' },
      {
        guid: 'g1',
        link: 'https://example.com',
        ...makeHashes({ guidHash: 'gh1', linkHash: 'lh1' }),
        fingerprint: 'key1',
      },
    ]
    const expected: Array<FingerprintedItem> = [
      {
        guid: 'g1',
        link: 'https://example.com',
        ...makeHashes({ guidHash: 'gh1', linkHash: 'lh1' }),
        fingerprint: 'key1',
      },
    ]

    expect(deduplicateItemsByFingerprint(value)).toEqual(expected)
  })

  it('should keep items with different fingerprints', () => {
    const value: Array<FingerprintedItem> = [
      { guid: 'g1', ...makeHashes({ guidHash: 'gh1' }), fingerprint: 'key1' },
      { guid: 'g2', ...makeHashes({ guidHash: 'gh2' }), fingerprint: 'key2' },
    ]
    const expected: Array<FingerprintedItem> = [
      { guid: 'g1', ...makeHashes({ guidHash: 'gh1' }), fingerprint: 'key1' },
      { guid: 'g2', ...makeHashes({ guidHash: 'gh2' }), fingerprint: 'key2' },
    ]

    expect(deduplicateItemsByFingerprint(value)).toEqual(expected)
  })

  it('should return empty array for empty input', () => {
    expect(deduplicateItemsByFingerprint([])).toEqual([])
  })
})

describe('classifyItems', () => {
  describe('basic classification', () => {
    it('should insert all items when no existing items', () => {
      const value: ClassifyItemsInput = {
        newItems: [
          { guid: 'guid-1', title: 'Post 1' },
          { guid: 'guid-2', title: 'Post 2' },
        ],
        existingItems: [],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: {
              guid: 'guid-1',
              title: 'Post 1',
              ...computeItemHashes({ guid: 'guid-1', title: 'Post 1' }),
            },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: {
              guid: 'guid-2',
              title: 'Post 2',
              ...computeItemHashes({ guid: 'guid-2', title: 'Post 2' }),
            },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update when item matches existing by guid and content changed', () => {
      const value: ClassifyItemsInput = {
        newItems: [{ guid: 'guid-1', title: 'Updated Title', content: 'New content' }],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            title: 'Old Title',
            content: 'Old content',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: {
              guid: 'guid-1',
              title: 'Updated Title',
              content: 'New content',
              ...computeItemHashes({
                guid: 'guid-1',
                title: 'Updated Title',
                content: 'New content',
              }),
            },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should handle mix of inserts, updates, and skips', () => {
      const value: ClassifyItemsInput = {
        newItems: [
          { guid: 'guid-1', title: 'Unchanged Title' },
          { guid: 'guid-2', title: 'Changed Title', content: 'New' },
          { guid: 'guid-3', title: 'Brand New' },
        ],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            title: 'Unchanged Title',
          }),
          makeMatchable({
            id: 'existing-2',
            guid: 'guid-2',
            title: 'Old Title',
            content: 'Old',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: {
              guid: 'guid-3',
              title: 'Brand New',
              ...computeItemHashes({ guid: 'guid-3', title: 'Brand New' }),
            },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [
          {
            item: {
              guid: 'guid-2',
              title: 'Changed Title',
              content: 'New',
              ...computeItemHashes({ guid: 'guid-2', title: 'Changed Title', content: 'New' }),
            },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-2',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should omit matched items with no changes', () => {
      const value: ClassifyItemsInput = {
        newItems: [{ guid: 'guid-1', title: 'Same Title', content: 'Same content' }],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            title: 'Same Title',
            content: 'Same content',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should skip update when existing null hashes match incoming undefined hashes', () => {
      const value: ClassifyItemsInput = {
        newItems: [{ guid: 'guid-1', title: 'Post Title' }],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            title: 'Post Title',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should skip update when only identity fields differ but content is identical', () => {
      const value: ClassifyItemsInput = {
        newItems: [
          {
            guid: 'guid-1',
            link: 'https://example.com/new',
            title: 'Post Title',
            content: 'Same content',
          },
        ],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            link: 'https://example.com/old',
            title: 'Post Title',
            content: 'Same content',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should produce same classification regardless of feed item order', () => {
      const insertItem = { guid: 'guid-new', title: 'New Post' }
      const updateItem = { guid: 'guid-2', title: 'Changed Title', content: 'New content' }
      const skipItem = { guid: 'guid-1', title: 'Unchanged' }
      const existingItems = [
        makeMatchable({
          id: 'existing-1',
          guid: 'guid-1',
          title: 'Unchanged',
        }),
        makeMatchable({
          id: 'existing-2',
          guid: 'guid-2',
          title: 'Old Title',
          content: 'Old content',
        }),
      ]
      const forward = classifyItems({
        newItems: [insertItem, updateItem, skipItem],
        existingItems,
      })
      const reversed = classifyItems({
        newItems: [skipItem, updateItem, insertItem],
        existingItems,
      })
      const sortByHash = (items: Array<{ fingerprintHash: string }>) => {
        return [...items].sort((a, b) => {
          return a.fingerprintHash.localeCompare(b.fingerprintHash)
        })
      }

      expect(forward.fingerprintLevel).toBe(reversed.fingerprintLevel)
      expect(sortByHash(forward.inserts)).toEqual(sortByHash(reversed.inserts))
      expect(sortByHash(forward.updates)).toEqual(sortByHash(reversed.updates))
    })

    it('should preserve extra fields in output', () => {
      const feedItem = { guid: 'guid-1', title: 'Post', customField: 'extra' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should filter out items with no identity', () => {
      const value: ClassifyItemsInput = {
        newItems: [{ content: 'Only content, no identifiable fields' }],
        existingItems: [],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should return empty output for empty feed', () => {
      const value: ClassifyItemsInput = {
        newItems: [],
        existingItems: [],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should filter unidentifiable items without affecting floor', () => {
      const feedItem1 = { guid: 'guid-1', title: 'Post 1' }
      const feedItem2 = { content: 'Only content' }
      const feedItem3 = { guid: 'guid-2', title: 'Post 2' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem1, feedItem2, feedItem3],
        existingItems: [],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem1, ...computeItemHashes(feedItem1) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: { ...feedItem3, ...computeItemHashes(feedItem3) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should throw when fingerprintLevel is invalid at runtime', () => {
      const value: ClassifyItemsInput = {
        newItems: [{ guid: 'guid-1', title: 'Post' }],
        existingItems: [],
        // @ts-expect-error: This is for testing purposes.
        fingerprintLevel: 'not-a-rung',
      }
      const throwing = () => classifyItems(value)

      expect(throwing).toThrow()
    })
  })

  describe('deduplication', () => {
    it('should deduplicate duplicate new items into single insert', () => {
      const value: ClassifyItemsInput = {
        newItems: [
          { guid: 'guid-1', title: 'Post' },
          { guid: 'guid-1', title: 'Post' },
        ],
        existingItems: [],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: {
              guid: 'guid-1',
              title: 'Post',
              ...computeItemHashes({ guid: 'guid-1', title: 'Post' }),
            },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should not downgrade floor due to duplicate new items', () => {
      const feedItem = { guid: 'guid-1', title: 'Post' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem, feedItem],
        existingItems: [],
        fingerprintLevel: 'guid',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should dedup all-identical items to single insert', () => {
      const feedItem = { link: 'https://example.com/post', title: 'Post' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem, feedItem, feedItem, feedItem, feedItem],
        existingItems: [],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'link',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should collapse title-only items with same title to single insert', () => {
      const feedItemA = { title: 'Same Title', content: 'Content A' }
      const feedItemB = { title: 'Same Title', content: 'Content B' }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB],
        existingItems: [],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItemA, ...computeItemHashes(feedItemA) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should collapse items with same guid and title but different content to single insert', () => {
      const value: ClassifyItemsInput = {
        newItems: [
          {
            guid: 'guid-1',
            link: 'https://example.com/event',
            title: 'Event',
            content: 'Date: Jan',
          },
          {
            guid: 'guid-1',
            link: 'https://example.com/event',
            title: 'Event',
            content: 'Date: Feb',
          },
          {
            guid: 'guid-1',
            link: 'https://example.com/event',
            title: 'Event',
            content: 'Date: Mar',
          },
        ],
        existingItems: [],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: {
              guid: 'guid-1',
              link: 'https://example.com/event',
              title: 'Event',
              content: 'Date: Jan',
              ...computeItemHashes({
                guid: 'guid-1',
                link: 'https://example.com/event',
                title: 'Event',
                content: 'Date: Jan',
              }),
            },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should collapse no-guid items with same link and title but different content to single insert', () => {
      const value: ClassifyItemsInput = {
        newItems: [
          { link: 'https://example.com/post', title: 'Post', content: 'Version 1' },
          { link: 'https://example.com/post', title: 'Post', content: 'Version 2' },
          { link: 'https://example.com/post', title: 'Post', content: 'Version 3' },
        ],
        existingItems: [],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: {
              link: 'https://example.com/post',
              title: 'Post',
              content: 'Version 1',
              ...computeItemHashes({
                link: 'https://example.com/post',
                title: 'Post',
                content: 'Version 1',
              }),
            },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'link',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should dedup batch duplicates and skip already-existing items in same pass', () => {
      const value: ClassifyItemsInput = {
        newItems: [
          { guid: 'guid-1', title: 'Title A' },
          { guid: 'guid-1', title: 'Title A' },
          { guid: 'guid-1', title: 'Title A' },
          { guid: 'guid-2', title: 'Title B' },
          { guid: 'guid-2', title: 'Title B' },
          { guid: 'guid-2', title: 'Title B' },
        ],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            title: 'Title A',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: {
              guid: 'guid-2',
              title: 'Title B',
              ...computeItemHashes({ guid: 'guid-2', title: 'Title B' }),
            },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should keep richer duplicate and produce update when it matches existing', () => {
      const feedItemRich = { guid: 'guid-1', title: 'Post Title', content: 'New content' }
      const feedItemPoor = { guid: 'guid-1', title: 'Post Title' }
      const value: ClassifyItemsInput = {
        newItems: [feedItemRich, feedItemPoor],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            title: 'Post Title',
            content: 'Old content',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItemRich, ...computeItemHashes(feedItemRich) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should dedup two items whose links normalize to the same value', () => {
      const feedItemA = { link: 'https://example.com/post?utm_source=rss', title: 'Post' }
      const feedItemB = { link: 'http://www.example.com/post/', title: 'Post' }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB],
        existingItems: [],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItemA, ...computeItemHashes(feedItemA) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'link',
      }

      expect(classifyItems(value)).toEqual(expected)
    })
  })

  describe('floor computation', () => {
    it('should downgrade fingerprintLevel when collisions exist at input depth', () => {
      const feedItemA = { link: 'https://example.com/shared', title: 'Post A' }
      const feedItemB = { link: 'https://example.com/shared', title: 'Post B' }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB],
        existingItems: [],
        fingerprintLevel: 'link',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItemA, ...computeItemHashes(feedItemA) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should preserve fingerprintLevel when floor is stable', () => {
      const feedItem1 = { guid: 'guid-1', title: 'Post 1' }
      const feedItem2 = { guid: 'guid-2', title: 'Post 2' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem1, feedItem2],
        existingItems: [],
        fingerprintLevel: 'guid',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem1, ...computeItemHashes(feedItem1) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: { ...feedItem2, ...computeItemHashes(feedItem2) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should produce distinct fingerprintHashes for hub new items with shared link and floor=title', () => {
      const feedItemA = { link: 'https://example.com/hub', title: 'Article A' }
      const feedItemB = { link: 'https://example.com/hub', title: 'Article B' }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB],
        existingItems: [],
        fingerprintLevel: 'title',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItemA, ...computeItemHashes(feedItemA) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      const result = classifyItems(value)

      expect(result).toEqual(expected)
      expect(result.inserts[0].fingerprintHash).not.toBe(result.inserts[1].fingerprintHash)
    })

    it('should downgrade floor when new item collides with existing item', () => {
      const feedItem = { link: 'https://example.com/shared', title: 'New Article' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/shared',
            title: 'Article A',
          }),
          makeMatchable({
            id: 'existing-2',
            link: 'https://example.com/shared',
            title: 'Article B',
          }),
        ],
        fingerprintLevel: 'link',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should downgrade floor on hub onset with single existing item', () => {
      const feedItem = { link: 'https://example.com/shared', title: 'New Article' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/shared',
            title: 'Old Article',
          }),
        ],
        fingerprintLevel: 'link',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should pick link when some items lack guid', () => {
      const feedItem1 = { guid: 'guid-1', link: 'https://example.com/post-1', title: 'Post 1' }
      const feedItem2 = { link: 'https://example.com/post-2', title: 'Post 2' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem1, feedItem2],
        existingItems: [],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem1, ...computeItemHashes(feedItem1) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: { ...feedItem2, ...computeItemHashes(feedItem2) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'link',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should downgrade from link to linkFragment when fragments resolve collision', () => {
      const feedItemA = { link: 'https://example.com/page#section-a', title: 'Section A' }
      const feedItemB = { link: 'https://example.com/page#section-b', title: 'Section B' }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB],
        existingItems: [],
        fingerprintLevel: 'link',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItemA, ...computeItemHashes(feedItemA) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'linkFragment',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should downgrade guid to guidFragment when guid fragments differ', () => {
      const feedItemA = { guid: 'https://example.com/post#v1', title: 'Version 1' }
      const feedItemB = { guid: 'https://example.com/post#v2', title: 'Version 2' }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB],
        existingItems: [],
        fingerprintLevel: 'guid',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItemA, ...computeItemHashes(feedItemA) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'guidFragment',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should downgrade guid to enclosure when guid collides without fragments', () => {
      const feedItemA = {
        guid: 'shared-guid',
        enclosures: [{ url: 'https://example.com/ep1.mp3' }],
        title: 'Episode 1',
      }
      const feedItemB = {
        guid: 'shared-guid',
        enclosures: [{ url: 'https://example.com/ep2.mp3' }],
        title: 'Episode 2',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB],
        existingItems: [],
        fingerprintLevel: 'guid',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItemA, ...computeItemHashes(feedItemA) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'enclosure',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should prefer enclosure over title when link collides and enclosure resolves', () => {
      const feedItemA = {
        link: 'https://example.com/shared',
        enclosures: [{ url: 'https://example.com/ep1.mp3' }],
        title: 'Episode 1',
      }
      const feedItemB = {
        link: 'https://example.com/shared',
        enclosures: [{ url: 'https://example.com/ep2.mp3' }],
        title: 'Episode 2',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB],
        existingItems: [],
        fingerprintLevel: 'link',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItemA, ...computeItemHashes(feedItemA) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'enclosure',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should not upgrade floor when fingerprintLevel is already deeper', () => {
      const feedItem1 = { guid: 'guid-1', link: 'https://example.com/post-1', title: 'Post 1' }
      const feedItem2 = { guid: 'guid-2', link: 'https://example.com/post-2', title: 'Post 2' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem1, feedItem2],
        existingItems: [],
        fingerprintLevel: 'title',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem1, ...computeItemHashes(feedItem1) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: { ...feedItem2, ...computeItemHashes(feedItem2) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should downgrade guid to link when guid collides but links differ', () => {
      const feedItemA = { guid: 'shared-guid', link: 'https://example.com/post-1', title: 'Post 1' }
      const feedItemB = { guid: 'shared-guid', link: 'https://example.com/post-2', title: 'Post 2' }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB],
        existingItems: [],
        fingerprintLevel: 'guid',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItemA, ...computeItemHashes(feedItemA) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'link',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should not change fingerprintLevel when feed and existing are both empty', () => {
      const value: ClassifyItemsInput = {
        newItems: [],
        existingItems: [],
        fingerprintLevel: 'guid',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should not change fingerprintLevel when only unidentifiable items arrive with existing history', () => {
      const value: ClassifyItemsInput = {
        newItems: [{ content: 'Only content, no identifiable fields' }],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            title: 'Post 1',
          }),
        ],
        fingerprintLevel: 'guid',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should downgrade fingerprintLevel when feed is empty but existing items collide', () => {
      const value: ClassifyItemsInput = {
        newItems: [],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/page',
            title: 'Title A',
          }),
          makeMatchable({
            id: 'existing-2',
            link: 'https://example.com/page',
            title: 'Title B',
          }),
        ],
        fingerprintLevel: 'link',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should produce collision-free fingerprintHashes after floor downgrade', () => {
      const feedItem1 = { link: 'https://example.com/page#s1', title: 'Section 1' }
      const feedItem2 = { link: 'https://example.com/page#s2', title: 'Section 2' }
      const feedItem3 = { link: 'https://example.com/page#s3', title: 'Section 3' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem1, feedItem2, feedItem3],
        existingItems: [],
        fingerprintLevel: 'link',
      }

      const result = classifyItems(value)
      const fingerprintHashes = result.inserts.map((item) => item.fingerprintHash)

      expect(result.fingerprintLevel).toBe('linkFragment')
      expect(fingerprintHashes.length).toBe(3)
      expect(new Set(fingerprintHashes).size).toBe(3)
    })

    it('should downgrade guid to link when new items lack guids', () => {
      const feedItemA = { link: 'https://example.com/post-1', title: 'Post 1' }
      const feedItemB = { link: 'https://example.com/post-2', title: 'Post 2' }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB],
        existingItems: [],
        fingerprintLevel: 'guid',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItemA, ...computeItemHashes(feedItemA) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'link',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should downgrade link to enclosure when new items lack guids and links', () => {
      const feedItemA = {
        enclosures: [{ url: 'https://example.com/ep1.mp3' }],
        title: 'Episode 1',
      }
      const feedItemB = {
        enclosures: [{ url: 'https://example.com/ep2.mp3' }],
        title: 'Episode 2',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB],
        existingItems: [],
        fingerprintLevel: 'link',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItemA, ...computeItemHashes(feedItemA) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'enclosure',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should downgrade enclosure to title when new items lack guids links and enclosures', () => {
      const feedItemA = { title: 'Post 1', content: 'Content 1' }
      const feedItemB = { title: 'Post 2', content: 'Content 2' }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB],
        existingItems: [],
        fingerprintLevel: 'enclosure',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItemA, ...computeItemHashes(feedItemA) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should downgrade past linkFragment to title when fragments are identical', () => {
      const feedItemA = { link: 'https://example.com/page#comments', title: 'Post A' }
      const feedItemB = { link: 'https://example.com/page#comments', title: 'Post B' }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB],
        existingItems: [],
        fingerprintLevel: 'link',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItemA, ...computeItemHashes(feedItemA) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should downgrade past guidFragment when guid fragments are identical', () => {
      const feedItemA = {
        guid: 'https://example.com/post#comments',
        link: 'https://example.com/post-a',
        title: 'Post A',
      }
      const feedItemB = {
        guid: 'https://example.com/post#comments',
        link: 'https://example.com/post-b',
        title: 'Post B',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB],
        existingItems: [],
        fingerprintLevel: 'guid',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItemA, ...computeItemHashes(feedItemA) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'link',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should downgrade to title when guid and enclosure both collide', () => {
      const feedItemA = {
        guid: 'shared-guid',
        enclosures: [{ url: 'https://example.com/logo.jpg' }],
        title: 'Post A',
      }
      const feedItemB = {
        guid: 'shared-guid',
        enclosures: [{ url: 'https://example.com/logo.jpg' }],
        title: 'Post B',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB],
        existingItems: [],
        fingerprintLevel: 'guid',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItemA, ...computeItemHashes(feedItemA) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should cascade from guid past multiple rungs to linkFragment', () => {
      const feedItemA = {
        guid: 'shared-guid',
        link: 'https://example.com/page#section-a',
        title: 'A',
      }
      const feedItemB = {
        guid: 'shared-guid',
        link: 'https://example.com/page#section-b',
        title: 'B',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB],
        existingItems: [],
        fingerprintLevel: 'guid',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItemA, ...computeItemHashes(feedItemA) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'linkFragment',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should prefer guidFragment over linkFragment when both could resolve', () => {
      const feedItemA = {
        guid: 'https://example.com/post#v1',
        link: 'https://example.com/page#section-a',
        title: 'V1',
      }
      const feedItemB = {
        guid: 'https://example.com/post#v2',
        link: 'https://example.com/page#section-b',
        title: 'V2',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB],
        existingItems: [],
        fingerprintLevel: 'guid',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItemA, ...computeItemHashes(feedItemA) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'guidFragment',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should auto-compute floor from existing items when feed is empty and no fingerprintLevel provided', () => {
      const value: ClassifyItemsInput = {
        newItems: [],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            title: 'Post 1',
          }),
          makeMatchable({
            id: 'existing-2',
            guid: 'guid-2',
            title: 'Post 2',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })
  })

  describe('matching and gating', () => {
    it('should match via guid when channel has no link hashes', () => {
      const value: ClassifyItemsInput = {
        newItems: [{ guid: 'guid-1', title: 'Updated', content: 'New content' }],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            title: 'Old',
            content: 'Old content',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: {
              guid: 'guid-1',
              title: 'Updated',
              content: 'New content',
              ...computeItemHashes({ guid: 'guid-1', title: 'Updated', content: 'New content' }),
            },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should match via enclosure on low-uniqueness channel', () => {
      const feedItem = {
        link: 'https://example.com/shared',
        enclosures: [{ url: 'https://example.com/episode.mp3' }],
        title: 'Updated Episode',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/shared',
            enclosures: [{ url: 'https://example.com/episode.mp3' }],
            title: 'Old Episode',
          }),
          makeMatchable({
            id: 'existing-2',
            link: 'https://example.com/shared',
            enclosures: [{ url: 'https://example.com/other.mp3' }],
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'enclosure',
          },
        ],
        fingerprintLevel: 'enclosure',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should skip link matching on low-uniqueness channel when item has guid', () => {
      const feedItem = { guid: 'guid-new', link: 'https://example.com/shared', title: 'New Post' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/shared',
            guid: 'guid-old',
          }),
          makeMatchable({
            id: 'existing-2',
            link: 'https://example.com/shared',
            guid: 'guid-old-2',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert two items when links differ only by fragment', () => {
      const feedItemA = { link: 'https://example.com/page#Earth2', title: 'Earth2' }
      const feedItemB = { link: 'https://example.com/page#LimeVPN', title: 'LimeVPN' }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB],
        existingItems: [],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItemA, ...computeItemHashes(feedItemA) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'linkFragment',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert hub feed item instead of merging when floor prevents it', () => {
      const feedItem = { link: 'https://example.com/shared', title: 'New Article' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/shared',
            title: 'Article A',
          }),
          makeMatchable({
            id: 'existing-2',
            link: 'https://example.com/shared',
            title: 'Article B',
          }),
        ],
        fingerprintLevel: 'title',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update when floor active and ladder key matches', () => {
      const feedItem = {
        link: 'https://example.com/post',
        title: 'Post Title',
        content: 'New content',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/post',
            title: 'Post Title',
            content: 'Old content',
          }),
        ],
        fingerprintLevel: 'title',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'link',
          },
        ],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update via enclosure when floor is enclosure', () => {
      const feedItem = {
        link: 'https://example.com/shared',
        enclosures: [{ url: 'https://example.com/ep1.mp3' }],
        title: 'Episode 1 Updated',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/shared',
            enclosures: [{ url: 'https://example.com/ep1.mp3' }],
            title: 'Episode 1',
          }),
          makeMatchable({
            id: 'existing-2',
            link: 'https://example.com/shared',
            enclosures: [{ url: 'https://example.com/ep2.mp3' }],
            title: 'Episode 2',
          }),
        ],
        fingerprintLevel: 'enclosure',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'enclosure',
          },
        ],
        fingerprintLevel: 'enclosure',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert link-only item with changed title when floor active', () => {
      const feedItem = { link: 'https://example.com/post', title: 'New Title' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/post',
            title: 'Old Title',
          }),
        ],
        fingerprintLevel: 'link',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when fragment added and floor active', () => {
      const feedItem = { link: 'https://example.com/post#comments', title: 'Post Title' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/post',
            title: 'Post Title',
          }),
        ],
        fingerprintLevel: 'link',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'linkFragment',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when fragment differs and floor is linkFragment', () => {
      const feedItem = { link: 'https://example.com/post#comments', title: 'Post Title' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/post',
            title: 'Post Title',
          }),
        ],
        fingerprintLevel: 'linkFragment',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'linkFragment',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should not merge hub items even without floor', () => {
      const feedItem = { link: 'https://example.com/shared', title: 'Article C' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/shared',
            title: 'Article A',
          }),
          makeMatchable({
            id: 'existing-2',
            link: 'https://example.com/shared',
            title: 'Article B',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when guid update changes title and floor is title', () => {
      const feedItem = { guid: 'guid-1', title: 'New Title' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            title: 'Old Title',
          }),
        ],
        fingerprintLevel: 'title',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when guid match is rejected by enclosure conflict', () => {
      const feedItem = {
        guid: 'guid-1',
        enclosures: [{ url: 'https://example.com/new.mp3' }],
        title: 'Updated',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            enclosures: [{ url: 'https://example.com/old.mp3' }],
            title: 'Original',
          }),
        ],
        fingerprintLevel: 'guid',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'enclosure',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update via guid when floor is title and title matches', () => {
      const feedItem = { guid: 'guid-1', title: 'Same Title', content: 'New content' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            title: 'Same Title',
            content: 'Old content',
          }),
        ],
        fingerprintLevel: 'title',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should not hide guid collisions in existing items', () => {
      const feedItem = { guid: 'shared-guid', title: 'Article A Updated' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'shared-guid',
            title: 'Article A',
          }),
          makeMatchable({
            id: 'existing-2',
            guid: 'shared-guid',
            title: 'Article B',
          }),
        ],
        fingerprintLevel: 'guid',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when guid match has enclosure conflict even without fingerprintLevel', () => {
      const feedItem = {
        guid: 'guid-1',
        enclosures: [{ url: 'https://example.com/new.mp3' }],
        title: 'Updated',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            enclosures: [{ url: 'https://example.com/old.mp3' }],
            title: 'Original',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'enclosure',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update only the floor-matching existing item on hub channel', () => {
      const feedItem = {
        link: 'https://example.com/shared',
        title: 'Article C',
        content: 'New content',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/shared',
            title: 'Article A',
            content: 'Old A',
          }),
          makeMatchable({
            id: 'existing-2',
            link: 'https://example.com/shared',
            title: 'Article C',
            content: 'Old C',
          }),
        ],
        fingerprintLevel: 'title',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-2',
            matchedBy: 'link',
          },
        ],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update title-only item when content changes', () => {
      const feedItem = { title: 'Post Title', content: 'New content' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            title: 'Post Title',
            content: 'Old content',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'title',
          },
        ],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when guid appears on existing item under floor', () => {
      const feedItem = {
        guid: 'guid-1',
        link: 'https://example.com/post',
        title: 'Post Title',
        content: 'New content',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/post',
            title: 'Post Title',
            content: 'Old content',
          }),
        ],
        fingerprintLevel: 'link',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'link',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when guid disappears from existing item under floor', () => {
      const feedItem = {
        link: 'https://example.com/post',
        title: 'Post Title',
        content: 'New content',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            link: 'https://example.com/post',
            title: 'Post Title',
            content: 'Old content',
          }),
        ],
        fingerprintLevel: 'link',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'link',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when link match is blocked by enclosure conflict', () => {
      const feedItem = {
        link: 'https://example.com/show',
        enclosures: [{ url: 'https://example.com/ep2.mp3' }],
        title: 'Episode 2',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/show',
            enclosures: [{ url: 'https://example.com/ep1.mp3' }],
            title: 'Episode 1',
          }),
        ],
        fingerprintLevel: 'enclosure',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'enclosure',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when link match blocked by enclosure conflict on high-uniqueness channel', () => {
      const fillerItems = Array.from({ length: 19 }, (_, index) => {
        return makeMatchable({
          id: `filler-${index}`,
          link: `https://example.com/post-${index}`,
          title: `Post ${index}`,
        })
      })
      const feedItem = {
        link: 'https://example.com/show',
        enclosures: [{ url: 'https://example.com/ep2.mp3' }],
        title: 'Episode 2',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          ...fillerItems,
          makeMatchable({
            id: 'existing-target',
            link: 'https://example.com/show',
            enclosures: [{ url: 'https://example.com/ep1.mp3' }],
            title: 'Episode 1',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'enclosure',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when title-only item has ambiguous match against multiple existing items', () => {
      const feedItem = { title: 'Shared Title', content: 'New content' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            title: 'Shared Title',
            content: 'Content A',
          }),
          makeMatchable({
            id: 'existing-2',
            title: 'Shared Title',
            content: 'Content B',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when enclosure-only item has ambiguous match against multiple existing items', () => {
      const feedItem = {
        enclosures: [{ url: 'https://example.com/shared.mp3' }],
        title: 'New Title',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/shared',
            enclosures: [{ url: 'https://example.com/shared.mp3' }],
            title: 'Title A',
          }),
          makeMatchable({
            id: 'existing-2',
            link: 'https://example.com/shared',
            enclosures: [{ url: 'https://example.com/shared.mp3' }],
            title: 'Title B',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should match by enclosure instead of link when batch duplicates lower uniqueness', () => {
      const existingItem = {
        id: 'existing-1',
        link: 'https://example.com/ep',
        enclosures: [{ url: 'https://example.com/audio.mp3' }],
        title: 'Episode 1',
        content: 'Old notes',
      }
      const targetItem = {
        link: 'https://example.com/ep',
        enclosures: [{ url: 'https://example.com/audio.mp3' }],
        title: 'Episode 1',
        content: 'New notes',
      }
      const fillerItem = {
        link: 'https://example.com/ep',
        enclosures: [{ url: 'https://example.com/filler.mp3' }],
        title: 'Filler',
      }
      const value: ClassifyItemsInput = {
        newItems: [targetItem, fillerItem, fillerItem, fillerItem],
        existingItems: [makeMatchable(existingItem)],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...fillerItem, ...computeItemHashes(fillerItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [
          {
            item: { ...targetItem, ...computeItemHashes(targetItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'enclosure',
          },
        ],
        fingerprintLevel: 'enclosure',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should match by guid when guid and link point to different existing items', () => {
      const feedItem = { guid: 'G1', link: 'https://example.com/L1', title: 'Updated' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-a',
            guid: 'G1',
            link: 'https://example.com/LA',
            title: 'Post A',
          }),
          makeMatchable({
            id: 'existing-b',
            guid: 'GB',
            link: 'https://example.com/L1',
            title: 'Post 1',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-a',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert link-only item with missing title due to floor collision', () => {
      const feedItem = { link: 'https://example.com/post' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/post',
            title: 'Original Title',
          }),
        ],
        fingerprintLevel: 'link',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should treat linkUniquenessRate exactly 0.95 as high-uniqueness', () => {
      const targetExisting = makeMatchable({
        id: 'target',
        link: 'https://example.com/target',
        enclosures: [{ url: 'https://example.com/e.mp3' }],
        title: 'Episode',
        content: 'Old content',
      })
      const uniques = Array.from({ length: 17 }, (_, index) =>
        makeMatchable({
          id: `u${index}`,
          guid: `g-${index}`,
          link: `https://example.com/u${index}`,
          title: `U${index}`,
        }),
      )
      const duplicate1 = makeMatchable({
        id: 'd1',
        guid: 'gd-1',
        link: 'https://example.com/dup',
        title: 'Dup1',
      })
      const duplicate2 = makeMatchable({
        id: 'd2',
        guid: 'gd-2',
        link: 'https://example.com/dup',
        title: 'Dup2',
      })
      const feedItem = {
        link: 'https://example.com/target',
        enclosures: [{ url: 'https://example.com/e.mp3' }],
        title: 'Episode',
        content: 'New content',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [targetExisting, ...uniques, duplicate1, duplicate2],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'target',
            matchedBy: 'link',
          },
        ],
        fingerprintLevel: 'link',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should treat linkUniquenessRate below 0.95 as low-uniqueness', () => {
      const targetExisting = makeMatchable({
        id: 'target',
        link: 'https://example.com/target',
        enclosures: [{ url: 'https://example.com/e.mp3' }],
        title: 'Episode',
        content: 'Old content',
      })
      const uniques = Array.from({ length: 16 }, (_, index) =>
        makeMatchable({
          id: `u${index}`,
          guid: `g-${index}`,
          link: `https://example.com/u${index}`,
          title: `U${index}`,
        }),
      )
      const duplicate1 = makeMatchable({
        id: 'd1',
        guid: 'gd-1',
        link: 'https://example.com/dup',
        title: 'Dup1',
      })
      const duplicate2 = makeMatchable({
        id: 'd2',
        guid: 'gd-2',
        link: 'https://example.com/dup',
        title: 'Dup2',
      })
      const duplicate3 = makeMatchable({
        id: 'd3',
        guid: 'gd-3',
        link: 'https://example.com/dup',
        title: 'Dup3',
      })
      const feedItem = {
        link: 'https://example.com/target',
        enclosures: [{ url: 'https://example.com/e.mp3' }],
        title: 'Episode',
        content: 'New content',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [targetExisting, ...uniques, duplicate1, duplicate2, duplicate3],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'target',
            matchedBy: 'enclosure',
          },
        ],
        fingerprintLevel: 'link',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should match via link when link uniqueness is high', () => {
      const targetExisting = makeMatchable({
        id: 'target',
        link: 'https://example.com/target',
        enclosures: [{ url: 'https://example.com/e.mp3' }],
        title: 'Episode',
        content: 'Old content',
      })
      const filler = Array.from({ length: 11 }, (_, index) =>
        makeMatchable({
          id: `h${index}`,
          guid: `hg-${index}`,
          link: `https://example.com/h${index}`,
          title: `H${index}`,
        }),
      )
      const feedItem = {
        link: 'https://example.com/target',
        enclosures: [{ url: 'https://example.com/e.mp3' }],
        title: 'Episode',
        content: 'New content',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [targetExisting, ...filler],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'target',
            matchedBy: 'link',
          },
        ],
        fingerprintLevel: 'link',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should match via enclosure when raw duplicates reduce link uniqueness', () => {
      const targetExisting = makeMatchable({
        id: 'target',
        link: 'https://example.com/target',
        enclosures: [{ url: 'https://example.com/e.mp3' }],
        title: 'Episode',
        content: 'Old content',
      })
      const filler = Array.from({ length: 11 }, (_, index) =>
        makeMatchable({
          id: `h${index}`,
          guid: `hg-${index}`,
          link: `https://example.com/h${index}`,
          title: `H${index}`,
        }),
      )
      const feedItem = {
        link: 'https://example.com/target',
        enclosures: [{ url: 'https://example.com/e.mp3' }],
        title: 'Episode',
        content: 'New content',
      }
      const duplicateItem = {
        guid: 'dup-guid',
        link: 'https://example.com/shared',
        title: 'Dup',
      }
      const duplicates = Array.from({ length: 19 }, () => duplicateItem)
      const value: ClassifyItemsInput = {
        newItems: [feedItem, ...duplicates],
        existingItems: [targetExisting, ...filler],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...duplicateItem, ...computeItemHashes(duplicateItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'target',
            matchedBy: 'enclosure',
          },
        ],
        fingerprintLevel: 'link',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when guid and link signals point to different existing items under link floor', () => {
      const feedItem = {
        guid: 'g1',
        link: 'https://example.com/b',
        title: 'A',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'a',
            guid: 'g1',
            link: 'https://example.com/a',
            title: 'A',
          }),
          makeMatchable({
            id: 'b',
            guid: 'g2',
            link: 'https://example.com/b',
            title: 'B',
          }),
        ],
        fingerprintLevel: 'link',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'link',
      }

      expect(classifyItems(value)).toEqual(expected)
    })
  })

  describe('update scenarios', () => {
    it('should update via link on high-uniqueness channel without explicit fingerprintLevel', () => {
      const feedItem = {
        link: 'https://example.com/post',
        title: 'Post Title',
        content: 'New content',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/post',
            title: 'Post Title',
            content: 'Old content',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'link',
          },
        ],
        fingerprintLevel: 'link',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update when only summary changes', () => {
      const feedItem = {
        guid: 'guid-1',
        title: 'Post Title',
        summary: 'New summary',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            title: 'Post Title',
            summary: 'Old summary',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update via guid when enclosure is added to existing item', () => {
      const feedItem = {
        guid: 'guid-1',
        title: 'Podcast Episode',
        enclosures: [{ url: 'https://example.com/episode.mp3' }],
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            title: 'Podcast Episode',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update via link-only item on low-uniqueness channel', () => {
      const feedItem = {
        link: 'https://example.com/post',
        title: 'Post Title',
        content: 'New content',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/post',
            title: 'Post Title',
            content: 'Old content',
          }),
          makeMatchable({
            id: 'existing-2',
            link: 'https://example.com/post',
            title: 'Other Article',
          }),
        ],
        fingerprintLevel: 'title',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'link',
          },
        ],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update multiple existing items on hub channel in single batch', () => {
      const feedItemA = {
        link: 'https://example.com/hub',
        title: 'Article A',
        content: 'New A',
      }
      const feedItemB = {
        link: 'https://example.com/hub',
        title: 'Article B',
        content: 'New B',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/hub',
            title: 'Article A',
            content: 'Old A',
          }),
          makeMatchable({
            id: 'existing-2',
            link: 'https://example.com/hub',
            title: 'Article B',
            content: 'Old B',
          }),
        ],
        fingerprintLevel: 'title',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItemA, ...computeItemHashes(feedItemA) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'link',
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-2',
            matchedBy: 'link',
          },
        ],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should auto-compute title floor and update correct hub item without explicit fingerprintLevel', () => {
      const feedItem = {
        link: 'https://example.com/hub',
        title: 'Article B',
        content: 'New B',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/hub',
            title: 'Article A',
            content: 'Old A',
          }),
          makeMatchable({
            id: 'existing-2',
            link: 'https://example.com/hub',
            title: 'Article B',
            content: 'Old B',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-2',
            matchedBy: 'link',
          },
        ],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should downgrade to enclosure and update correct item when guid collision disambiguated by enclosure', () => {
      const feedItem = {
        guid: 'shared-guid',
        enclosures: [{ url: 'https://example.com/ep1.mp3' }],
        title: 'Ep 1',
        content: 'New notes',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-a',
            guid: 'shared-guid',
            enclosures: [{ url: 'https://example.com/ep1.mp3' }],
            title: 'Ep 1',
            content: 'Old notes',
          }),
          makeMatchable({
            id: 'existing-b',
            guid: 'shared-guid',
            enclosures: [{ url: 'https://example.com/ep2.mp3' }],
            title: 'Ep 2',
            content: 'Old notes',
          }),
        ],
        fingerprintLevel: 'guid',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-a',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'enclosure',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should downgrade to guidFragment and update correct item when guid fragments disambiguate', () => {
      const feedItem = {
        guid: 'https://example.com/post#v1',
        title: 'Version 1',
        content: 'New content',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'v1',
            guid: 'https://example.com/post#v1',
            title: 'Version 1',
            content: 'Old content',
          }),
          makeMatchable({
            id: 'v2',
            guid: 'https://example.com/post#v2',
            title: 'Version 2',
            content: 'Old content',
          }),
        ],
        fingerprintLevel: 'guid',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'v1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guidFragment',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should downgrade to linkFragment and update correct item when link fragments disambiguate on high-uniqueness channel', () => {
      const base = 'https://example.com/page'
      const feedItem = { link: `${base}#s1`, title: 'Section 1', content: 'New content' }
      const filler = Array.from({ length: 19 }, (_, index) =>
        makeMatchable({
          id: `u${index}`,
          link: `https://example.com/u${index}`,
          title: `U${index}`,
        }),
      )
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 's1',
            link: `${base}#s1`,
            title: 'Section 1',
            content: 'Old content',
          }),
          makeMatchable({
            id: 's2',
            link: `${base}#s2`,
            title: 'Section 2',
            content: 'Old content',
          }),
          ...filler,
        ],
        fingerprintLevel: 'link',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 's1',
            matchedBy: 'link',
          },
        ],
        fingerprintLevel: 'linkFragment',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should downgrade to link and update correct item when guid collision narrowed by link', () => {
      const feedItem = {
        guid: 'shared-guid',
        link: 'https://example.com/post-1',
        title: 'Post 1',
        content: 'New content',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'shared-guid',
            link: 'https://example.com/post-1',
            title: 'Post 1',
            content: 'Old content',
          }),
          makeMatchable({
            id: 'existing-2',
            guid: 'shared-guid',
            link: 'https://example.com/post-2',
            title: 'Post 2',
            content: 'Old content',
          }),
        ],
        fingerprintLevel: 'guid',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'link',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update via guid when only title changes', () => {
      const feedItem = {
        guid: 'guid-1',
        title: 'New Title',
        content: 'Same content',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            title: 'Old Title',
            content: 'Same content',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })
  })

  describe('floor and pre-match interactions', () => {
    it('should prevent floor downgrade when pre-match excludes enclosure-matched existing item', () => {
      const feedItem = {
        link: 'https://example.com/show',
        enclosures: [{ url: 'https://example.com/ep1.mp3' }],
        title: 'Ep 1 Remastered',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/show',
            enclosures: [{ url: 'https://example.com/ep1.mp3' }],
            title: 'Ep 1',
          }),
          makeMatchable({
            id: 'existing-2',
            link: 'https://example.com/show',
            enclosures: [{ url: 'https://example.com/ep2.mp3' }],
            title: 'Ep 2',
          }),
        ],
        fingerprintLevel: 'enclosure',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'enclosure',
          },
        ],
        fingerprintLevel: 'enclosure',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should keep fingerprintLevel guidFragment when guid fragments resolve collision', () => {
      const feedItemA = { guid: 'https://example.com/post#v1', title: 'Version 1' }
      const feedItemB = { guid: 'https://example.com/post#v2', title: 'Version 2' }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB],
        existingItems: [],
        fingerprintLevel: 'guidFragment',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItemA, ...computeItemHashes(feedItemA) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'guidFragment',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should downgrade from enclosure to title when enclosures collide', () => {
      const feedItemA = {
        link: 'https://example.com/shared',
        enclosures: [{ url: 'https://example.com/logo.jpg' }],
        title: 'Post A',
      }
      const feedItemB = {
        link: 'https://example.com/shared',
        enclosures: [{ url: 'https://example.com/logo.jpg' }],
        title: 'Post B',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB],
        existingItems: [],
        fingerprintLevel: 'enclosure',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItemA, ...computeItemHashes(feedItemA) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should not downgrade floor when existing item matches incoming exactly', () => {
      const feedItem = { link: 'https://example.com/post', title: 'Same Title' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/post',
            title: 'Same Title',
          }),
        ],
        fingerprintLevel: 'link',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [],
        fingerprintLevel: 'link',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should not downgrade floor when guid match resolves the collision', () => {
      const feedItem = { guid: 'guid-1', link: 'https://example.com/post', title: 'New Title' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            link: 'https://example.com/post',
            title: 'Old Title',
          }),
        ],
        fingerprintLevel: 'guid',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should downgrade floor on hub onset but still update the matching item', () => {
      const feedItemUpdate = {
        link: 'https://example.com/shared',
        title: 'Article A',
        content: 'New content',
      }
      const feedItemNew = { link: 'https://example.com/shared', title: 'Article B' }
      const value: ClassifyItemsInput = {
        newItems: [feedItemUpdate, feedItemNew],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/shared',
            title: 'Article A',
            content: 'Old content',
          }),
        ],
        fingerprintLevel: 'link',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItemNew, ...computeItemHashes(feedItemNew) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [
          {
            item: { ...feedItemUpdate, ...computeItemHashes(feedItemUpdate) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'link',
          },
        ],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })
  })

  describe('real-world edge cases', () => {
    it('should treat whitespace-only guid and title as no identity', () => {
      const value: ClassifyItemsInput = {
        newItems: [{ guid: '   ', title: '   ', content: 'Some content' }],
        existingItems: [],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should prefer isDefault enclosure over positional first for matching', () => {
      const feedItem = {
        guid: 'guid-1',
        title: 'Episode',
        content: 'New show notes',
        enclosures: [
          { url: 'https://example.com/new-thumbnail.jpg' },
          { url: 'https://example.com/audio.mp3', isDefault: true },
        ],
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            title: 'Episode',
            content: 'Old show notes',
            enclosures: [
              { url: 'https://example.com/old-thumbnail.jpg' },
              { url: 'https://example.com/audio.mp3', isDefault: true },
            ],
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when feed item shares no fields with existing item', () => {
      const feedItem = { guid: 'guid-new', title: 'New Post' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-old',
            title: 'Old Post',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when guid is recycled with different enclosure and original still exists', () => {
      const feedItem = {
        guid: 'shared-guid',
        enclosures: [{ url: 'https://example.com/new-episode.mp3' }],
        title: 'New Episode',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'shared-guid',
            enclosures: [{ url: 'https://example.com/old-episode.mp3' }],
            title: 'Old Episode',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'enclosure',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update via guid when link disappears from feed item between scans', () => {
      const feedItem = {
        guid: 'guid-1',
        title: 'Post Title',
        content: 'Updated content',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            link: 'https://example.com/post',
            title: 'Post Title',
            content: 'Old content',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update via guid when enclosure is removed from feed item between scans', () => {
      const feedItem = {
        guid: 'guid-1',
        title: 'Episode',
        content: 'Updated notes',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            title: 'Episode',
            content: 'Old notes',
            enclosures: [{ url: 'https://example.com/ep.mp3' }],
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when guid changes but title stays the same', () => {
      const feedItem = { guid: 'new-guid', title: 'Same Title', content: 'New content' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'old-guid',
            title: 'Same Title',
            content: 'Old content',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update via guid when incoming loses content', () => {
      const feedItem = { guid: 'guid-1', title: 'Post Title' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            title: 'Post Title',
            content: 'Old content',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update via guid when incoming loses summary', () => {
      const feedItem = { guid: 'guid-1', title: 'Post Title' }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            title: 'Post Title',
            summary: 'Old summary',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when link match is ambiguous on high-uniqueness channel', () => {
      const feedItem = { link: 'https://example.com/shared', title: 'New Article' }
      const filler = Array.from({ length: 19 }, (_, index) =>
        makeMatchable({
          id: `u${index}`,
          link: `https://example.com/u${index}`,
          title: `U${index}`,
        }),
      )
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/shared',
            title: 'Article A',
          }),
          makeMatchable({
            id: 'existing-2',
            link: 'https://example.com/shared',
            title: 'Article B',
          }),
          ...filler,
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when isDefault enclosure toggle changes selected enclosure', () => {
      const feedItem = {
        guid: 'G',
        enclosures: [
          { url: 'https://example.com/audio.mp3' },
          { url: 'https://example.com/thumb.jpg', isDefault: true },
        ],
        title: 'Episode',
        content: 'New',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'G',
            enclosures: [
              { url: 'https://example.com/audio.mp3', isDefault: true },
              { url: 'https://example.com/thumb.jpg' },
            ],
            title: 'Episode',
            content: 'Old',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        ],
        updates: [],
        fingerprintLevel: 'enclosure',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update by enclosure when placeholder enclosure matches single existing item', () => {
      const feedItem = {
        enclosures: [{ url: 'https://example.com/logo.jpg' }],
        title: 'New Post',
        content: 'New',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            enclosures: [{ url: 'https://example.com/logo.jpg' }],
            title: 'Old Post',
            content: 'Old',
          }),
        ],
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'enclosure',
          },
        ],
        fingerprintLevel: 'enclosure',
      }

      expect(classifyItems(value)).toEqual(expected)
    })
  })

  describe('multi-scan replay', () => {
    it('should downgrade floor on hub onset across scans', () => {
      const scan1 = classifyItems({
        newItems: [{ link: 'https://example.com/hub', title: 'Article A' }],
        existingItems: [],
      })

      expect(scan1.fingerprintLevel).toBe('link')
      expect(scan1.inserts).toHaveLength(1)

      const scan2 = classifyItems({
        newItems: [
          { link: 'https://example.com/hub', title: 'Article A', content: 'Updated' },
          { link: 'https://example.com/hub', title: 'Article B' },
        ],
        existingItems: [
          makeMatchable({
            id: 'a',
            link: 'https://example.com/hub',
            title: 'Article A',
          }),
        ],
        fingerprintLevel: scan1.fingerprintLevel,
      })

      expect(scan2.fingerprintLevel).toBe('title')
      expect(scan2.inserts).toHaveLength(1)
      expect(scan2.updates).toHaveLength(1)
    })

    it('should not upgrade floor when collisions disappear in subsequent scan', () => {
      const scan3 = classifyItems({
        newItems: [{ link: 'https://example.com/unique-new', title: 'New Post' }],
        existingItems: [
          makeMatchable({
            id: 'a',
            link: 'https://example.com/hub',
            title: 'Article A',
          }),
          makeMatchable({
            id: 'b',
            link: 'https://example.com/hub',
            title: 'Article B',
          }),
        ],
        fingerprintLevel: 'title',
      })

      expect(scan3.fingerprintLevel).toBe('title')
    })

    it('should downgrade floor when guid is recycled in later scan', () => {
      const scan1 = classifyItems({
        newItems: [
          { guid: 'guid-1', link: 'https://example.com/post-1', title: 'Post 1' },
          { guid: 'guid-2', link: 'https://example.com/post-2', title: 'Post 2' },
        ],
        existingItems: [],
      })

      expect(scan1.fingerprintLevel).toBe('guid')
      expect(scan1.inserts).toHaveLength(2)

      const scan2 = classifyItems({
        newItems: [
          { guid: 'guid-1', link: 'https://example.com/post-1', title: 'Updated' },
          { guid: 'guid-1', link: 'https://example.com/post-new', title: 'New' },
        ],
        existingItems: [
          makeMatchable({
            id: 'p1',
            guid: 'guid-1',
            link: 'https://example.com/post-1',
            title: 'Post 1',
          }),
          makeMatchable({
            id: 'p2',
            guid: 'guid-2',
            link: 'https://example.com/post-2',
            title: 'Post 2',
          }),
        ],
        fingerprintLevel: scan1.fingerprintLevel,
      })

      expect(scan2.fingerprintLevel).toBe('link')
      expect(scan2.updates).toHaveLength(1)
      expect(scan2.inserts).toHaveLength(1)
    })
  })

  describe('invariants', () => {
    it('should produce unique fingerprintHashes across inserts and updates', () => {
      const value: ClassifyItemsInput = {
        newItems: [
          { guid: 'guid-1', title: 'Updated', content: 'New' },
          { guid: 'guid-new', title: 'Brand New' },
          { guid: 'guid-3', title: 'Also New' },
        ],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'guid-1',
            title: 'Old',
            content: 'Old',
          }),
        ],
      }

      const result = classifyItems(value)
      const allHashes = [...result.inserts, ...result.updates].map((item) => {
        return item.fingerprintHash
      })

      expect(allHashes.length).toBeGreaterThan(0)
      expect(new Set(allHashes).size).toBe(allHashes.length)
    })

    it('should not target same existing item in multiple updates', () => {
      const feedItemA = {
        link: 'https://example.com/hub',
        title: 'Article A',
        content: 'New A',
      }
      const feedItemB = {
        link: 'https://example.com/hub',
        title: 'Article B',
        content: 'New B',
      }
      const feedItemC = {
        link: 'https://example.com/hub',
        title: 'Article C',
        content: 'New C',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB, feedItemC],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            link: 'https://example.com/hub',
            title: 'Article A',
            content: 'Old A',
          }),
          makeMatchable({
            id: 'existing-2',
            link: 'https://example.com/hub',
            title: 'Article B',
            content: 'Old B',
          }),
          makeMatchable({
            id: 'existing-3',
            link: 'https://example.com/hub',
            title: 'Article C',
            content: 'Old C',
          }),
        ],
        fingerprintLevel: 'title',
      }

      const result = classifyItems(value)
      const targetIds = result.updates.map((update) => {
        return update.existingItemId
      })

      expect(targetIds.length).toBeGreaterThan(0)
      expect(new Set(targetIds).size).toBe(targetIds.length)
    })

    it('should never resolve fingerprintLevel stronger than input', () => {
      const depths: Array<FingerprintLevel> = [
        'guid',
        'guidFragment',
        'link',
        'linkFragment',
        'enclosure',
        'title',
      ]
      const feedItems = [
        { guid: 'guid-1', link: 'https://example.com/p1', title: 'Post 1' },
        { guid: 'guid-2', link: 'https://example.com/p2', title: 'Post 2' },
      ]

      for (const depth of depths) {
        const result = classifyItems({
          newItems: feedItems,
          existingItems: [],
          fingerprintLevel: depth,
        })
        const inputIndex = depths.indexOf(depth)
        const outputIndex = depths.indexOf(result.fingerprintLevel)

        expect(outputIndex).toBeGreaterThanOrEqual(inputIndex)
      }
    })
  })
})
