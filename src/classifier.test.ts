import { describe, expect, it } from 'bun:test'
import {
  buildFingerprints,
  classifyItems,
  composeIncomingItems,
  deduplicateItemsByFingerprint,
  findReconciliationCandidate,
  hasAmbiguousIdentity,
  reconcileInserts,
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
  MatchResult,
  NewItem,
} from './types.js'

const md5Regex = /^[a-f0-9]{32}$/

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

  it('should return 0 when only fragment hashes are present', () => {
    const value = makeHashes({ guidFragmentHash: 'gf1', linkFragmentHash: 'lf1' })

    expect(scoreItem(value)).toBe(0)
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

describe('findReconciliationCandidate', () => {
  const makeIncoming = (overrides: Partial<IncomingItem> = {}): IncomingItem => ({
    guidHash: null,
    guidFragmentHash: null,
    linkHash: null,
    linkFragmentHash: null,
    enclosureHash: null,
    titleHash: null,
    summaryHash: null,
    contentHash: null,
    ...overrides,
  })

  const makeExistingItem = (overrides: Partial<ExistingItem> = {}): ExistingItem => ({
    id: 'existing-1',
    guidHash: null,
    guidFragmentHash: null,
    linkHash: null,
    linkFragmentHash: null,
    enclosureHash: null,
    titleHash: null,
    summaryHash: null,
    contentHash: null,
    ...overrides,
  })

  describe('happy paths', () => {
    it('should return link match when GUID differs but link and all content match', () => {
      const incoming = makeIncoming({
        guidHash: 'new-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
        contentHash: 'same-content',
        summaryHash: 'same-summary',
        enclosureHash: 'same-enclosure',
        publishedAt: new Date('2024-01-01T00:00:00Z'),
      })
      const existing = makeExistingItem({
        guidHash: 'old-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
        contentHash: 'same-content',
        summaryHash: 'same-summary',
        enclosureHash: 'same-enclosure',
        publishedAt: new Date('2024-01-01T00:00:00Z'),
      })
      const expected: MatchResult = { match: existing, matchedBy: 'link' }

      expect(findReconciliationCandidate(incoming, existing)).toEqual(expected)
    })

    it('should return title match when both GUIDs are null and link differs but all content matches', () => {
      const incoming = makeIncoming({
        linkHash: 'new-link',
        titleHash: 'same-title',
        contentHash: 'same-content',
        publishedAt: new Date('2024-01-01T00:00:00Z'),
      })
      const existing = makeExistingItem({
        linkHash: 'old-link',
        titleHash: 'same-title',
        contentHash: 'same-content',
        publishedAt: new Date('2024-01-01T00:00:00Z'),
      })
      const expected: MatchResult = { match: existing, matchedBy: 'title' }

      expect(findReconciliationCandidate(incoming, existing)).toEqual(expected)
    })

    it('should not match when only one content field matches (below minReconciliationFields)', () => {
      const incoming = makeIncoming({
        guidHash: 'new-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
        publishedAt: new Date('2024-01-01T00:00:00Z'),
      })
      const existing = makeExistingItem({
        guidHash: 'old-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
        publishedAt: new Date('2024-01-01T00:00:00Z'),
      })

      expect(findReconciliationCandidate(incoming, existing)).toBeUndefined()
    })
  })

  describe('sad paths', () => {
    it('should return undefined when titleHash differs', () => {
      const incoming = makeIncoming({
        guidHash: 'new-guid',
        linkHash: 'same-link',
        titleHash: 'different-title',
      })
      const existing = makeExistingItem({
        guidHash: 'old-guid',
        linkHash: 'same-link',
        titleHash: 'original-title',
      })

      expect(findReconciliationCandidate(incoming, existing)).toBeUndefined()
    })

    it('should return undefined when contentHash differs', () => {
      const incoming = makeIncoming({
        guidHash: 'new-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
        contentHash: 'new-content',
      })
      const existing = makeExistingItem({
        guidHash: 'old-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
        contentHash: 'old-content',
      })

      expect(findReconciliationCandidate(incoming, existing)).toBeUndefined()
    })

    it('should return undefined when summaryHash differs', () => {
      const incoming = makeIncoming({
        guidHash: 'new-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
        summaryHash: 'new-summary',
      })
      const existing = makeExistingItem({
        guidHash: 'old-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
        summaryHash: 'old-summary',
      })

      expect(findReconciliationCandidate(incoming, existing)).toBeUndefined()
    })

    it('should return undefined when enclosureHash differs', () => {
      const incoming = makeIncoming({
        guidHash: 'new-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
        enclosureHash: 'new-enclosure',
      })
      const existing = makeExistingItem({
        guidHash: 'old-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
        enclosureHash: 'old-enclosure',
      })

      expect(findReconciliationCandidate(incoming, existing)).toBeUndefined()
    })

    it('should return undefined when publishedAt differs', () => {
      const incoming = makeIncoming({
        guidHash: 'new-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
        publishedAt: new Date('2024-01-02T00:00:00Z'),
      })
      const existing = makeExistingItem({
        guidHash: 'old-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
        publishedAt: new Date('2024-01-01T00:00:00Z'),
      })

      expect(findReconciliationCandidate(incoming, existing)).toBeUndefined()
    })

    it('should return undefined when both GUID and link differ and GUIDs are non-null', () => {
      const incoming = makeIncoming({
        guidHash: 'new-guid',
        linkHash: 'new-link',
        titleHash: 'same-title',
      })
      const existing = makeExistingItem({
        guidHash: 'old-guid',
        linkHash: 'old-link',
        titleHash: 'same-title',
      })

      expect(findReconciliationCandidate(incoming, existing)).toBeUndefined()
    })

    it('should return undefined when both GUID and link match (nothing to reconcile)', () => {
      const incoming = makeIncoming({
        guidHash: 'same-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
      })
      const existing = makeExistingItem({
        guidHash: 'same-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
      })

      expect(findReconciliationCandidate(incoming, existing)).toBeUndefined()
    })

    it('should return undefined when one contentHash is null and the other has a value', () => {
      const incoming = makeIncoming({
        guidHash: 'new-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
        summaryHash: 'has-summary',
      })
      const existing = makeExistingItem({
        guidHash: 'old-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
      })

      expect(findReconciliationCandidate(incoming, existing)).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('should not match when all content hashes are null on both sides (below minReconciliationFields)', () => {
      const incoming = makeIncoming({
        guidHash: 'new-guid',
        linkHash: 'same-link',
        publishedAt: new Date('2024-01-01T00:00:00Z'),
      })
      const existing = makeExistingItem({
        guidHash: 'old-guid',
        linkHash: 'same-link',
        publishedAt: new Date('2024-01-01T00:00:00Z'),
      })

      expect(findReconciliationCandidate(incoming, existing)).toBeUndefined()
    })

    it('should match when both publishedAt are undefined', () => {
      const incoming = makeIncoming({
        guidHash: 'new-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
        contentHash: 'same-content',
      })
      const existing = makeExistingItem({
        guidHash: 'old-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
        contentHash: 'same-content',
      })
      const expected: MatchResult = { match: existing, matchedBy: 'link' }

      expect(findReconciliationCandidate(incoming, existing)).toEqual(expected)
    })

    it('should not match when one publishedAt is undefined and the other has a value', () => {
      const incoming = makeIncoming({
        guidHash: 'new-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
        publishedAt: new Date('2024-01-01T00:00:00Z'),
      })
      const existing = makeExistingItem({
        guidHash: 'old-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
      })

      expect(findReconciliationCandidate(incoming, existing)).toBeUndefined()
    })

    it('should not match when GUID differs but link is null on both sides (no anchor)', () => {
      const incoming = makeIncoming({
        guidHash: 'new-guid',
        titleHash: 'same-title',
        publishedAt: new Date('2024-01-01T00:00:00Z'),
      })
      const existing = makeExistingItem({
        guidHash: 'old-guid',
        titleHash: 'same-title',
        publishedAt: new Date('2024-01-01T00:00:00Z'),
      })

      expect(findReconciliationCandidate(incoming, existing)).toBeUndefined()
    })

    it('should not match when both GUIDs and both links are null (nothing differs)', () => {
      const incoming = makeIncoming({
        titleHash: 'same-title',
        publishedAt: new Date('2024-01-01T00:00:00Z'),
      })
      const existing = makeExistingItem({
        titleHash: 'same-title',
        publishedAt: new Date('2024-01-01T00:00:00Z'),
      })

      expect(findReconciliationCandidate(incoming, existing)).toBeUndefined()
    })

    it('should match when GUID goes from null to a value but link is the same', () => {
      const incoming = makeIncoming({
        guidHash: 'new-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
        contentHash: 'same-content',
      })
      const existing = makeExistingItem({
        linkHash: 'same-link',
        titleHash: 'same-title',
        contentHash: 'same-content',
      })
      const expected: MatchResult = { match: existing, matchedBy: 'link' }

      expect(findReconciliationCandidate(incoming, existing)).toEqual(expected)
    })

    it('should match when both GUIDs are null and links differ', () => {
      const incoming = makeIncoming({
        linkHash: 'new-link',
        titleHash: 'same-title',
        contentHash: 'same-content',
      })
      const existing = makeExistingItem({
        linkHash: 'old-link',
        titleHash: 'same-title',
        contentHash: 'same-content',
      })
      const expected: MatchResult = { match: existing, matchedBy: 'title' }

      expect(findReconciliationCandidate(incoming, existing)).toEqual(expected)
    })

    it('should not match when both GUIDs are null and links are the same (nothing to reconcile)', () => {
      const incoming = makeIncoming({
        linkHash: 'same-link',
        titleHash: 'same-title',
        contentHash: 'same-content',
      })
      const existing = makeExistingItem({
        linkHash: 'same-link',
        titleHash: 'same-title',
        contentHash: 'same-content',
      })

      expect(findReconciliationCandidate(incoming, existing)).toBeUndefined()
    })

    it('should treat null and undefined publishedAt as equal', () => {
      const incoming = makeIncoming({
        guidHash: 'new-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
        contentHash: 'same-content',
        publishedAt: null,
      })
      const existing = makeExistingItem({
        guidHash: 'old-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
        contentHash: 'same-content',
      })
      const expected: MatchResult = { match: existing, matchedBy: 'link' }

      expect(findReconciliationCandidate(incoming, existing)).toEqual(expected)
    })

    it('should not match when publishedAt differs by milliseconds', () => {
      const incoming = makeIncoming({
        guidHash: 'new-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
        publishedAt: new Date('2024-01-01T00:00:00.001Z'),
      })
      const existing = makeExistingItem({
        guidHash: 'old-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
        publishedAt: new Date('2024-01-01T00:00:00.000Z'),
      })

      expect(findReconciliationCandidate(incoming, existing)).toBeUndefined()
    })
  })
})

describe('hasAmbiguousIdentity', () => {
  const makeIncoming = (overrides: Partial<IncomingItem> = {}): IncomingItem => ({
    guidHash: null,
    guidFragmentHash: null,
    linkHash: null,
    linkFragmentHash: null,
    enclosureHash: null,
    titleHash: null,
    summaryHash: null,
    contentHash: null,
    ...overrides,
  })

  const makeExistingItem = (overrides: Partial<ExistingItem> = {}): ExistingItem => ({
    id: 'candidate',
    guidHash: null,
    guidFragmentHash: null,
    linkHash: null,
    linkFragmentHash: null,
    enclosureHash: null,
    titleHash: null,
    summaryHash: null,
    contentHash: null,
    ...overrides,
  })

  it('should return true when incoming guidHash belongs to a different existing item', () => {
    const incoming = makeIncoming({ guidHash: 'guid-a', linkHash: 'same-link' })
    const candidate = makeExistingItem({
      id: 'candidate',
      guidHash: 'guid-old',
      linkHash: 'same-link',
    })
    const existingItems: Array<ExistingItem> = [
      candidate,
      makeExistingItem({ id: 'other', guidHash: 'guid-a', linkHash: 'other-link' }),
    ]

    expect(hasAmbiguousIdentity(incoming, candidate, existingItems)).toBe(true)
  })

  it('should return true when incoming linkHash belongs to a different existing item', () => {
    const incoming = makeIncoming({ guidHash: 'same-guid', linkHash: 'link-b' })
    const candidate = makeExistingItem({
      id: 'candidate',
      guidHash: 'same-guid',
      linkHash: 'link-old',
    })
    const existingItems: Array<ExistingItem> = [
      candidate,
      makeExistingItem({ id: 'other', guidHash: 'other-guid', linkHash: 'link-b' }),
    ]

    expect(hasAmbiguousIdentity(incoming, candidate, existingItems)).toBe(true)
  })

  it('should return false when changed guidHash does not belong to any other existing item', () => {
    const incoming = makeIncoming({ guidHash: 'brand-new-guid', linkHash: 'same-link' })
    const candidate = makeExistingItem({
      id: 'candidate',
      guidHash: 'old-guid',
      linkHash: 'same-link',
    })
    const existingItems: Array<ExistingItem> = [
      candidate,
      makeExistingItem({ id: 'other', guidHash: 'unrelated-guid', linkHash: 'other-link' }),
    ]

    expect(hasAmbiguousIdentity(incoming, candidate, existingItems)).toBe(false)
  })

  it('should return false when changed linkHash does not belong to any other existing item', () => {
    const incoming = makeIncoming({ guidHash: 'same-guid', linkHash: 'brand-new-link' })
    const candidate = makeExistingItem({
      id: 'candidate',
      guidHash: 'same-guid',
      linkHash: 'old-link',
    })
    const existingItems: Array<ExistingItem> = [
      candidate,
      makeExistingItem({ id: 'other', guidHash: 'other-guid', linkHash: 'unrelated-link' }),
    ]

    expect(hasAmbiguousIdentity(incoming, candidate, existingItems)).toBe(false)
  })

  it('should return false when no other existing items exist', () => {
    const incoming = makeIncoming({ guidHash: 'new-guid', linkHash: 'same-link' })
    const candidate = makeExistingItem({
      id: 'candidate',
      guidHash: 'old-guid',
      linkHash: 'same-link',
    })

    expect(hasAmbiguousIdentity(incoming, candidate, [candidate])).toBe(false)
  })

  it('should return false when changed field is null', () => {
    const incoming = makeIncoming({ linkHash: 'same-link' })
    const candidate = makeExistingItem({
      id: 'candidate',
      guidHash: 'old-guid',
      linkHash: 'same-link',
    })
    const existingItems: Array<ExistingItem> = [
      candidate,
      makeExistingItem({ id: 'other', guidHash: null }),
    ]

    expect(hasAmbiguousIdentity(incoming, candidate, existingItems)).toBe(false)
  })

  it('should return false when identity fields match the candidate (nothing changed)', () => {
    const incoming = makeIncoming({ guidHash: 'same-guid', linkHash: 'same-link' })
    const candidate = makeExistingItem({
      id: 'candidate',
      guidHash: 'same-guid',
      linkHash: 'same-link',
    })
    const existingItems: Array<ExistingItem> = [
      candidate,
      makeExistingItem({ id: 'other', guidHash: 'same-guid', linkHash: 'same-link' }),
    ]

    expect(hasAmbiguousIdentity(incoming, candidate, existingItems)).toBe(false)
  })

  it('should return true when both guid and link changed and one conflicts', () => {
    const incoming = makeIncoming({ guidHash: 'guid-a', linkHash: 'link-b' })
    const candidate = makeExistingItem({
      id: 'candidate',
      guidHash: 'guid-old',
      linkHash: 'link-old',
    })
    const existingItems: Array<ExistingItem> = [
      candidate,
      makeExistingItem({ id: 'other', guidHash: 'guid-a', linkHash: 'other-link' }),
    ]

    expect(hasAmbiguousIdentity(incoming, candidate, existingItems)).toBe(true)
  })

  it('should return false when both guid and link changed but neither conflicts', () => {
    const incoming = makeIncoming({ guidHash: 'new-guid', linkHash: 'new-link' })
    const candidate = makeExistingItem({
      id: 'candidate',
      guidHash: 'old-guid',
      linkHash: 'old-link',
    })
    const existingItems: Array<ExistingItem> = [
      candidate,
      makeExistingItem({ id: 'other', guidHash: 'unrelated-guid', linkHash: 'unrelated-link' }),
    ]

    expect(hasAmbiguousIdentity(incoming, candidate, existingItems)).toBe(false)
  })
})

describe('reconcileInserts', () => {
  const makeIncoming = (overrides: Partial<IncomingItem> = {}): IncomingItem => ({
    guidHash: null,
    guidFragmentHash: null,
    linkHash: null,
    linkFragmentHash: null,
    enclosureHash: null,
    titleHash: null,
    summaryHash: null,
    contentHash: null,
    ...overrides,
  })

  const makeExistingItem = (overrides: Partial<ExistingItem> = {}): ExistingItem => ({
    id: 'existing-1',
    guidHash: null,
    guidFragmentHash: null,
    linkHash: null,
    linkFragmentHash: null,
    enclosureHash: null,
    titleHash: null,
    summaryHash: null,
    contentHash: null,
    ...overrides,
  })

  it('should return empty arrays when inserts is empty', () => {
    const result = reconcileInserts([], [makeExistingItem()], new Set())

    expect(result).toEqual({ reconciledInserts: [], reconciledUpdates: [] })
  })

  it('should return all inserts unchanged when existingItems is empty', () => {
    const insert = { item: makeIncoming({ linkHash: 'link-1' }), fingerprintHash: 'fp-1' }
    const result = reconcileInserts([insert], [], new Set())

    expect(result.reconciledInserts).toHaveLength(1)
    expect(result.reconciledUpdates).toHaveLength(0)
  })

  it('should skip existing items already in updateTargetIds', () => {
    const insert = {
      item: makeIncoming({
        guidHash: 'new-guid',
        linkHash: 'same-link',
        titleHash: 'same-title',
        publishedAt: new Date('2024-01-01T00:00:00Z'),
      }),
      fingerprintHash: 'fp-1',
    }
    const existing = makeExistingItem({
      id: 'existing-1',
      guidHash: 'old-guid',
      linkHash: 'same-link',
      titleHash: 'same-title',
      publishedAt: new Date('2024-01-01T00:00:00Z'),
    })
    // existing-1 is already targeted by a main pipeline update.
    const result = reconcileInserts([insert], [existing], new Set(['existing-1']))

    expect(result.reconciledInserts).toHaveLength(1)
    expect(result.reconciledUpdates).toHaveLength(0)
  })

  it('should reconcile multiple inserts to different existing items', () => {
    const publishedAt = new Date('2024-01-01T00:00:00Z')
    const insert1 = {
      item: makeIncoming({
        guidHash: 'new-1',
        linkHash: 'link-1',
        titleHash: 'title-1',
        contentHash: 'content-1',
        publishedAt,
      }),
      fingerprintHash: 'fp-1',
    }
    const insert2 = {
      item: makeIncoming({
        guidHash: 'new-2',
        linkHash: 'link-2',
        titleHash: 'title-2',
        contentHash: 'content-2',
        publishedAt,
      }),
      fingerprintHash: 'fp-2',
    }
    const existing1 = makeExistingItem({
      id: 'existing-1',
      guidHash: 'old-1',
      linkHash: 'link-1',
      titleHash: 'title-1',
      contentHash: 'content-1',
      publishedAt,
    })
    const existing2 = makeExistingItem({
      id: 'existing-2',
      guidHash: 'old-2',
      linkHash: 'link-2',
      titleHash: 'title-2',
      contentHash: 'content-2',
      publishedAt,
    })

    const result = reconcileInserts([insert1, insert2], [existing1, existing2], new Set())

    expect(result.reconciledInserts).toHaveLength(0)
    expect(result.reconciledUpdates).toHaveLength(2)
    expect(result.reconciledUpdates[0].existingItemId).toBe('existing-1')
    expect(result.reconciledUpdates[1].existingItemId).toBe('existing-2')
  })

  it('should not reconcile when ambiguity guard blocks the match', () => {
    const publishedAt = new Date('2024-01-01T00:00:00Z')
    const insert = {
      item: makeIncoming({
        guidHash: 'guid-a',
        linkHash: 'same-link',
        titleHash: 'same-title',
        publishedAt,
      }),
      fingerprintHash: 'fp-1',
    }
    const candidate = makeExistingItem({
      id: 'existing-1',
      guidHash: 'old-guid',
      linkHash: 'same-link',
      titleHash: 'same-title',
      publishedAt,
    })
    // Another existing item already owns the incoming guidHash.
    const conflicting = makeExistingItem({
      id: 'existing-2',
      guidHash: 'guid-a',
      linkHash: 'other-link',
    })

    const result = reconcileInserts([insert], [candidate, conflicting], new Set())

    expect(result.reconciledInserts).toHaveLength(1)
    expect(result.reconciledUpdates).toHaveLength(0)
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: {
              guid: 'guid-2',
              title: 'Post 2',
              ...computeItemHashes({ guid: 'guid-2', title: 'Post 2' }),
            },
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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

    // When GUID is the identifier, fields below it (like link) are
    // effectively content and should trigger an update when they change.
    it('should update when only link differs but content is identical', () => {
      const feedItem = {
        guid: 'guid-1',
        link: 'https://example.com/new',
        title: 'Post Title',
        content: 'Same content',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
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
            fingerprintHash: expect.stringMatching(md5Regex),
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

    it('should filter unidentifiable items without affecting level', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: { ...feedItem3, ...computeItemHashes(feedItem3) },
            fingerprintHash: expect.stringMatching(md5Regex),
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
        fingerprintLevel: 'not-a-level',
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should not downgrade level due to duplicate new items', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'link',
      }

      expect(classifyItems(value)).toEqual(expected)
    })
  })

  describe('level computation', () => {
    it('should downgrade fingerprintLevel when collisions exist at input level', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should preserve fingerprintLevel when level is stable', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: { ...feedItem2, ...computeItemHashes(feedItem2) },
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should produce distinct fingerprintHashes for hub new items with shared link and level=title', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      const result = classifyItems(value)

      expect(result).toEqual(expected)
      expect(result.inserts[0].fingerprintHash).not.toBe(result.inserts[1].fingerprintHash)
    })

    it('should downgrade level when new item collides with existing item', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should downgrade level on hub onset with single existing item', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: { ...feedItem2, ...computeItemHashes(feedItem2) },
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'enclosure',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should not upgrade level when fingerprintLevel is already deeper', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: { ...feedItem2, ...computeItemHashes(feedItem2) },
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'link',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should downgrade guid to title when guid and link both collide', () => {
      const feedItemA = {
        guid: 'shared-guid',
        link: 'https://example.com/shared-link',
        title: 'Post 1',
      }
      const feedItemB = {
        guid: 'shared-guid',
        link: 'https://example.com/shared-link',
        title: 'Post 2',
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

    it('should downgrade guid to title when guid collides and no links exist', () => {
      const feedItemA = { guid: 'shared-guid', title: 'Post 1' }
      const feedItemB = { guid: 'shared-guid', title: 'Post 2' }
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

    it('should produce collision-free fingerprintHashes after level downgrade', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should cascade from guid past multiple levels to linkFragment', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'guidFragment',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should auto-compute level from existing items when feed is empty and no fingerprintLevel provided', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'linkFragment',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert hub feed item instead of merging when level prevents it', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update when level active and fingerprint matches', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'existing-1',
            matchedBy: 'link',
          },
        ],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update via enclosure when level is enclosure', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'existing-1',
            matchedBy: 'enclosure',
          },
        ],
        fingerprintLevel: 'enclosure',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert link-only item with changed title when level active', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when fragment added and level active', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'linkFragment',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when fragment differs and level is linkFragment', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'linkFragment',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should not merge hub items even without level', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when guid update changes title and level is title', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update when guid matches despite different enclosures', () => {
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
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update via guid when level is title and title matches', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update when guid matches despite different enclosures without fingerprintLevel', () => {
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
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update only the level-matching existing item on hub channel', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'existing-1',
            matchedBy: 'title',
          },
        ],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when guid appears on existing item under level', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'link',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when guid disappears from existing item under level', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [
          {
            item: { ...targetItem, ...computeItemHashes(targetItem) },
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'existing-a',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert link-only item with missing title due to level collision', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'target',
            matchedBy: 'enclosure',
          },
        ],
        fingerprintLevel: 'link',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when guid and link signals point to different existing items under link level', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'link',
      }

      expect(classifyItems(value)).toEqual(expected)
    })
  })

  describe('update scenarios', () => {
    // When GUID is the identifier, fields below it (like link) are
    // effectively content and should trigger an update when they change.
    it('should update when GUID matches but link changes and content is the same', () => {
      const feedItem = {
        guid: 'same-guid',
        link: 'https://new-domain.com/post',
        title: 'Post Title',
        content: '<p>Same content</p>',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'same-guid',
            link: 'https://old-domain.com/post',
            title: 'Post Title',
            content: '<p>Same content</p>',
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

    // URL-type GUIDs share the same guidHash (fragment stripped) but
    // differ in guidFragmentHash. The changeFilter should detect this.
    it('should update when only GUID fragment changes', () => {
      const feedItem = {
        guid: 'https://example.com/post#v2',
        link: 'https://example.com/post',
        title: 'Post Title',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'https://example.com/post#v1',
            link: 'https://example.com/post',
            title: 'Post Title',
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'existing-1',
            matchedBy: 'link',
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'existing-2',
            matchedBy: 'link',
          },
        ],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should auto-compute title level and update correct hub item without explicit fingerprintLevel', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })
  })

  describe('level and pre-match interactions', () => {
    it('should prevent level downgrade when pre-match excludes enclosure-matched existing item', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should not downgrade level when existing item matches incoming exactly', () => {
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

    it('should not downgrade level when guid match resolves the collision', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should downgrade level on hub onset but still update the matching item', () => {
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [
          {
            item: { ...feedItemUpdate, ...computeItemHashes(feedItemUpdate) },
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'existing-1',
            matchedBy: 'link',
          },
        ],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should match by link when all items share a guid across scans', () => {
      const feedItemA = {
        guid: 'shared-guid',
        link: 'https://example.com/post-1',
        title: 'Post 1',
        content: 'New content A',
      }
      const feedItemB = {
        guid: 'shared-guid',
        link: 'https://example.com/post-2',
        title: 'Post 2',
        content: 'New content B',
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItemA, feedItemB],
        existingItems: [
          makeMatchable({
            id: 'existing-1',
            guid: 'shared-guid',
            link: 'https://example.com/post-1',
            title: 'Post 1',
            content: 'Old content A',
          }),
          makeMatchable({
            id: 'existing-2',
            guid: 'shared-guid',
            link: 'https://example.com/post-2',
            title: 'Post 2',
            content: 'Old content B',
          }),
        ],
        fingerprintLevel: 'guid',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: { ...feedItemA, ...computeItemHashes(feedItemA) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
          {
            item: { ...feedItemB, ...computeItemHashes(feedItemB) },
            fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            existingItemId: 'existing-2',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'link',
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update when guid is reused with different enclosure (trusts GUID per RSS spec)', () => {
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
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guid',
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert when guid reused with far-apart dates', () => {
      const now = new Date()
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
      const feedItem = {
        guid: 'guid-1',
        title: 'New Episode',
        content: 'New content',
        publishedAt: now,
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [
          {
            ...makeMatchable({
              id: 'existing-1',
              guid: 'guid-1',
              title: 'Old Episode',
              content: 'Old content',
            }),
            publishedAt: sixtyDaysAgo,
          },
        ],
      }
      const result = classifyItems(value)

      expect(result.inserts).toHaveLength(1)
      expect(result.updates).toHaveLength(0)
    })

    it('should work with numeric existing item IDs', () => {
      const feedItem = { guid: 'guid-1', title: 'Updated', content: 'New content' }
      const existingItem: ExistingItem = {
        id: 42,
        ...computeItemHashes({ guid: 'guid-1', title: 'Old', content: 'Old content' }),
      }
      const value: ClassifyItemsInput = {
        newItems: [feedItem],
        existingItems: [existingItem],
      }
      const result = classifyItems(value)

      expect(result.updates).toHaveLength(1)
      expect(result.updates[0].existingItemId).toBe(42)
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
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
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update when isDefault enclosure toggle changes selected enclosure (trusts GUID)', () => {
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
        inserts: [],
        updates: [
          {
            item: { ...feedItem, ...computeItemHashes(feedItem) },
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'guid',
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
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'existing-1',
            matchedBy: 'enclosure',
          },
        ],
        fingerprintLevel: 'enclosure',
      }

      expect(classifyItems(value)).toEqual(expected)
    })
  })

  it('should update when guid+link match but enclosure changed (CDN migration)', () => {
    const feedItems = [
      {
        guid: 'guid-1',
        link: 'https://example.com/post-1',
        enclosures: [{ url: 'https://cdn.example.com/new-image.jpg' }],
        title: 'Post 1',
        content: 'Content 1',
      },
      {
        guid: 'guid-2',
        link: 'https://example.com/post-2',
        enclosures: [{ url: 'https://cdn.example.com/new-image-2.jpg' }],
        title: 'Post 2',
        content: 'Content 2',
      },
    ]
    const value: ClassifyItemsInput = {
      newItems: feedItems,
      existingItems: [
        makeMatchable({
          id: 'existing-1',
          guid: 'guid-1',
          link: 'https://example.com/post-1',
          enclosures: [{ url: 'https://example.com/old-image.jpg' }],
          title: 'Post 1',
          content: 'Content 1',
        }),
        makeMatchable({
          id: 'existing-2',
          guid: 'guid-2',
          link: 'https://example.com/post-2',
          enclosures: [{ url: 'https://example.com/old-image-2.jpg' }],
          title: 'Post 2',
          content: 'Content 2',
        }),
      ],
      fingerprintLevel: 'guid',
    }
    const expected: ClassifyItemsResult = {
      inserts: [],
      updates: [
        {
          item: { ...feedItems[0], ...computeItemHashes(feedItems[0]) },
          fingerprintHash: expect.stringMatching(md5Regex),
          existingItemId: 'existing-1',
          matchedBy: 'guid',
        },
        {
          item: { ...feedItems[1], ...computeItemHashes(feedItems[1]) },
          fingerprintHash: expect.stringMatching(md5Regex),
          existingItemId: 'existing-2',
          matchedBy: 'guid',
        },
      ],
      fingerprintLevel: 'guid',
    }

    expect(classifyItems(value)).toEqual(expected)
  })

  it('should update when guid+link match but enclosure and title changed', () => {
    const feedItem = {
      guid: 'guid-1',
      link: 'https://example.com/post-1',
      enclosures: [{ url: 'https://cdn.example.com/new-image.jpg' }],
      title: 'Updated Title',
      content: 'New content',
    }
    const value: ClassifyItemsInput = {
      newItems: [feedItem],
      existingItems: [
        makeMatchable({
          id: 'existing-1',
          guid: 'guid-1',
          link: 'https://example.com/post-1',
          enclosures: [{ url: 'https://example.com/old-image.jpg' }],
          title: 'Original Title',
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
          fingerprintHash: expect.stringMatching(md5Regex),
          existingItemId: 'existing-1',
          matchedBy: 'guid',
        },
      ],
      fingerprintLevel: 'guid',
    }

    expect(classifyItems(value)).toEqual(expected)
  })

  it('should produce same result regardless of existing item order', () => {
    const feedItem = {
      guid: 'guid-2',
      link: 'https://example.com/post-2',
      enclosures: [{ url: 'https://cdn.example.com/image-2.jpg' }],
      title: 'Post 2',
      content: 'Updated content',
    }
    const existingA = makeMatchable({
      id: 'existing-1',
      guid: 'guid-1',
      link: 'https://example.com/post-1',
      title: 'Post 1',
    })
    const existingB = makeMatchable({
      id: 'existing-2',
      guid: 'guid-2',
      link: 'https://example.com/post-2',
      enclosures: [{ url: 'https://example.com/old-image-2.jpg' }],
      title: 'Post 2',
      content: 'Old content',
    })
    const base = {
      newItems: [feedItem],
      fingerprintLevel: 'guid' as const,
    }
    const resultForward = classifyItems({
      ...base,
      existingItems: [existingA, existingB],
    })
    const resultReversed = classifyItems({
      ...base,
      existingItems: [existingB, existingA],
    })

    expect(resultForward.inserts).toHaveLength(resultReversed.inserts.length)
    expect(resultForward.updates).toHaveLength(resultReversed.updates.length)
    expect(resultForward.fingerprintLevel).toBe(resultReversed.fingerprintLevel)
  })

  it('should insert when guid+link match but dates are far apart', () => {
    const feedItem = {
      guid: 'guid-1',
      link: 'https://example.com/post-1',
      enclosures: [{ url: 'https://cdn.example.com/new-image.jpg' }],
      title: 'Reused Title',
      publishedAt: new Date('2026-06-01T00:00:00Z'),
    }
    const existing = makeMatchable({
      id: 'existing-1',
      guid: 'guid-1',
      link: 'https://example.com/post-1',
      enclosures: [{ url: 'https://example.com/old-image.jpg' }],
      title: 'Reused Title',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
    })
    const value: ClassifyItemsInput = {
      newItems: [feedItem],
      existingItems: [{ ...existing, publishedAt: new Date('2026-01-01T00:00:00Z') }],
      fingerprintLevel: 'guid',
    }
    const result = classifyItems(value)

    expect(result.inserts).toHaveLength(1)
    expect(result.updates).toHaveLength(0)
  })

  describe('multi-scan replay', () => {
    it('should downgrade level on hub onset across scans', () => {
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

    it('should not upgrade level when collisions disappear in subsequent scan', () => {
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

    it('should downgrade level when guid is recycled in later scan', () => {
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
      const levels: Array<FingerprintLevel> = [
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

      for (const level of levels) {
        const result = classifyItems({
          newItems: feedItems,
          existingItems: [],
          fingerprintLevel: level,
        })
        const inputIndex = levels.indexOf(level)
        const outputIndex = levels.indexOf(result.fingerprintLevel)

        expect(outputIndex).toBeGreaterThanOrEqual(inputIndex)
      }
    })
  })

  describe('reconciliation', () => {
    const makeExisting = (input: NewItem & { id?: string }): ExistingItem => {
      const { id = 'item-1', ...fields } = input
      return { id, ...computeItemHashes(fields), publishedAt: fields.publishedAt ?? undefined }
    }

    describe('happy paths', () => {
      it('should reclassify insert as update when guid differs but link + content + publishedAt match', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem = {
          guid: 'new-guid',
          link: 'https://example.com/post',
          title: 'Post Title',
          content: '<p>Content</p>',
          summary: 'Summary',
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              guid: 'old-guid',
              link: 'https://example.com/post',
              title: 'Post Title',
              content: '<p>Content</p>',
              summary: 'Summary',
              publishedAt,
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
          fingerprintLevel: 'guid',
        }

        expect(classifyItems(value)).toEqual(expected)
      })

      it('should reclassify insert as update when both GUIDs are null and link differs but content matches', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem = {
          link: 'https://new-domain.com/post',
          title: 'Post Title',
          content: '<p>Content</p>',
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              link: 'https://old-domain.com/post',
              title: 'Post Title',
              content: '<p>Content</p>',
              publishedAt,
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
          fingerprintLevel: 'link',
        }

        expect(classifyItems(value)).toEqual(expected)
      })

      it('should reconcile multiple inserts against different existing items', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem1 = {
          guid: 'new-guid-1',
          link: 'https://example.com/post-1',
          title: 'Post 1',
          content: '<p>Content 1</p>',
          publishedAt,
        }
        const feedItem2 = {
          guid: 'new-guid-2',
          link: 'https://example.com/post-2',
          title: 'Post 2',
          content: '<p>Content 2</p>',
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem1, feedItem2],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              guid: 'old-guid-1',
              link: 'https://example.com/post-1',
              title: 'Post 1',
              content: '<p>Content 1</p>',
              publishedAt,
            }),
            makeExisting({
              id: 'existing-2',
              guid: 'old-guid-2',
              link: 'https://example.com/post-2',
              title: 'Post 2',
              content: '<p>Content 2</p>',
              publishedAt,
            }),
          ],
        }
        const expected: ClassifyItemsResult = {
          inserts: [],
          updates: [
            {
              item: { ...feedItem1, ...computeItemHashes(feedItem1) },
              fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
              existingItemId: 'existing-1',
              matchedBy: 'link',
            },
            {
              item: { ...feedItem2, ...computeItemHashes(feedItem2) },
              fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
              existingItemId: 'existing-2',
              matchedBy: 'link',
            },
          ],
          fingerprintLevel: 'guid',
        }

        expect(classifyItems(value)).toEqual(expected)
      })
    })

    describe('sad paths', () => {
      it('should not reconcile when titleHash differs', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem = {
          guid: 'new-guid',
          link: 'https://example.com/post',
          title: 'Different Title',
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              guid: 'old-guid',
              link: 'https://example.com/post',
              title: 'Original Title',
              publishedAt,
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

      it('should not reconcile when contentHash differs', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem = {
          guid: 'new-guid',
          link: 'https://example.com/post',
          title: 'Post Title',
          content: '<p>New content</p>',
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              guid: 'old-guid',
              link: 'https://example.com/post',
              title: 'Post Title',
              content: '<p>Old content</p>',
              publishedAt,
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

      it('should not reconcile when summaryHash differs', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem = {
          guid: 'new-guid',
          link: 'https://example.com/post',
          title: 'Post Title',
          summary: 'New summary',
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              guid: 'old-guid',
              link: 'https://example.com/post',
              title: 'Post Title',
              summary: 'Old summary',
              publishedAt,
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

      it('should not reconcile when enclosureHash differs', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem = {
          guid: 'new-guid',
          link: 'https://example.com/post',
          title: 'Post Title',
          enclosures: [{ url: 'https://example.com/new.mp3' }] as Array<{ url: string }>,
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              guid: 'old-guid',
              link: 'https://example.com/post',
              title: 'Post Title',
              enclosures: [{ url: 'https://example.com/old.mp3' }],
              publishedAt,
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

      it('should not reconcile when publishedAt differs', () => {
        const feedItem = {
          guid: 'new-guid',
          link: 'https://example.com/post',
          title: 'Post Title',
          publishedAt: new Date('2024-01-02T00:00:00Z'),
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              guid: 'old-guid',
              link: 'https://example.com/post',
              title: 'Post Title',
              publishedAt: new Date('2024-01-01T00:00:00Z'),
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

      it('should not reconcile when both GUIDs are null and link differs but content differs', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem = {
          link: 'https://new-domain.com/post',
          title: 'Different Title',
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              link: 'https://old-domain.com/post',
              title: 'Original Title',
              publishedAt,
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
          fingerprintLevel: 'link',
        }

        expect(classifyItems(value)).toEqual(expected)
      })

      it('should not reconcile when both guid and link differ', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem = {
          guid: 'new-guid',
          link: 'https://new-domain.com/post',
          title: 'Post Title',
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              guid: 'old-guid',
              link: 'https://old-domain.com/post',
              title: 'Post Title',
              publishedAt,
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

      it('should not reconcile when existing item is already targeted by another update', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem1 = {
          guid: 'same-guid',
          link: 'https://example.com/post',
          title: 'New Title',
          publishedAt,
        }
        const feedItem2 = {
          guid: 'different-guid',
          link: 'https://example.com/post',
          title: 'Original Title',
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem1, feedItem2],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              guid: 'same-guid',
              link: 'https://example.com/post',
              title: 'Original Title',
              publishedAt,
            }),
          ],
        }
        const expected: ClassifyItemsResult = {
          inserts: [
            {
              item: { ...feedItem2, ...computeItemHashes(feedItem2) },
              fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            },
          ],
          updates: [
            {
              item: { ...feedItem1, ...computeItemHashes(feedItem1) },
              fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
              existingItemId: 'existing-1',
              matchedBy: 'guid',
            },
          ],
          fingerprintLevel: 'guid',
        }

        expect(classifyItems(value)).toEqual(expected)
      })

      it('should not reconcile when no existing items exist', () => {
        const feedItem = {
          guid: 'guid-1',
          link: 'https://example.com/post',
          title: 'Post Title',
          publishedAt: new Date('2024-01-01T00:00:00Z'),
        }
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
    })

    describe('edge cases', () => {
      it('should not reconcile when all content hashes are null (below minReconciliationFields)', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem = {
          guid: 'new-guid',
          link: 'https://example.com/post',
          title: 'Post Title',
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              guid: 'old-guid',
              link: 'https://example.com/post',
              title: 'Post Title',
              publishedAt,
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

      it('should not match when one side has null content hash and the other has a value', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem = {
          guid: 'new-guid',
          link: 'https://example.com/post',
          title: 'Post Title',
          summary: 'Has summary',
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              guid: 'old-guid',
              link: 'https://example.com/post',
              title: 'Post Title',
              publishedAt,
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

      it('should match when both publishedAt are undefined', () => {
        const feedItem = {
          guid: 'new-guid',
          link: 'https://example.com/post',
          title: 'Post Title',
          content: '<p>Content</p>',
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              guid: 'old-guid',
              link: 'https://example.com/post',
              title: 'Post Title',
              content: '<p>Content</p>',
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
          fingerprintLevel: 'guid',
        }

        expect(classifyItems(value)).toEqual(expected)
      })

      it('should not match when one publishedAt is undefined and other has a value', () => {
        const feedItem = {
          guid: 'new-guid',
          link: 'https://example.com/post',
          title: 'Post Title',
          publishedAt: new Date('2024-01-01T00:00:00Z'),
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              guid: 'old-guid',
              link: 'https://example.com/post',
              title: 'Post Title',
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

      it('should not reconcile when anchor field is null on both sides', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem = {
          guid: 'new-guid',
          title: 'Post Title',
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              guid: 'old-guid',
              title: 'Post Title',
              publishedAt,
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

      it('should reconcile when differing field goes from null to a value', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem = {
          guid: 'new-guid',
          link: 'https://example.com/post',
          title: 'Post Title',
          content: '<p>Content</p>',
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem],
          existingItems: [
            {
              id: 'existing-1',
              ...computeItemHashes({
                link: 'https://example.com/post',
                title: 'Post Title',
                content: '<p>Content</p>',
                publishedAt,
              }),
              publishedAt,
            },
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

      it('should reconcile item with enclosures when all content hashes match', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem = {
          guid: 'new-guid',
          link: 'https://example.com/post',
          title: 'Post Title',
          enclosures: [{ url: 'https://example.com/audio.mp3' }] as Array<{ url: string }>,
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              guid: 'old-guid',
              link: 'https://example.com/post',
              title: 'Post Title',
              enclosures: [{ url: 'https://example.com/audio.mp3' }],
              publishedAt,
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
          fingerprintLevel: 'guid',
        }

        expect(classifyItems(value)).toEqual(expected)
      })

      it('should pick first matching existing item when multiple could match', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem = {
          guid: 'new-guid',
          link: 'https://example.com/post',
          title: 'Post Title',
          content: '<p>Content</p>',
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              guid: 'old-guid-1',
              link: 'https://example.com/post',
              title: 'Post Title',
              content: '<p>Content</p>',
              publishedAt,
            }),
            makeExisting({
              id: 'existing-2',
              guid: 'old-guid-2',
              link: 'https://example.com/post',
              title: 'Post Title',
              content: '<p>Content</p>',
              publishedAt,
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
          fingerprintLevel: 'guid',
        }

        expect(classifyItems(value)).toEqual(expected)
      })
    })

    describe('real-world patterns', () => {
      it('should handle alternating GUIDs across scans (guid A → B → A)', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItemA: NewItem = {
          guid: 'guid-a',
          link: 'https://example.com/post',
          title: 'Post',
          content: '<p>Content</p>',
          publishedAt,
        }
        const feedItemB: NewItem = {
          guid: 'guid-b',
          link: 'https://example.com/post',
          title: 'Post',
          content: '<p>Content</p>',
          publishedAt,
        }

        // Scan 1: item with guid A inserted.
        const scan1 = classifyItems({
          newItems: [feedItemA],
          existingItems: [],
        })
        const expectedScan1: ClassifyItemsResult = {
          inserts: [
            {
              item: { ...feedItemA, ...computeItemHashes(feedItemA) },
              fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            },
          ],
          updates: [],
          fingerprintLevel: 'guid',
        }

        expect(scan1).toEqual(expectedScan1)

        // Scan 2: guid changed to B. Reconciliation catches it.
        const afterScan1: ExistingItem = {
          ...scan1.inserts[0].item,
          id: 'item-1',
          publishedAt,
        }
        const scan2 = classifyItems({
          newItems: [feedItemB],
          existingItems: [afterScan1],
        })
        const expectedScan2: ClassifyItemsResult = {
          inserts: [],
          updates: [
            {
              item: { ...feedItemB, ...computeItemHashes(feedItemB) },
              fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
              existingItemId: 'item-1',
              matchedBy: 'link',
            },
          ],
          fingerprintLevel: 'guid',
        }

        expect(scan2).toEqual(expectedScan2)

        // Scan 3: guid changed back to A. Reconciliation catches it again.
        const afterScan2: ExistingItem = {
          ...scan2.updates[0].item,
          id: 'item-1',
          publishedAt,
        }
        const scan3 = classifyItems({
          newItems: [feedItemA],
          existingItems: [afterScan2],
        })
        const expectedScan3: ClassifyItemsResult = {
          inserts: [],
          updates: [
            {
              item: { ...feedItemA, ...computeItemHashes(feedItemA) },
              fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
              existingItemId: 'item-1',
              matchedBy: 'link',
            },
          ],
          fingerprintLevel: 'guid',
        }

        expect(scan3).toEqual(expectedScan3)
      })

      it('should handle partial GUID instability (some stable, some change)', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const stableItem = {
          guid: 'stable-guid',
          link: 'https://example.com/stable',
          title: 'Stable Post',
          content: '<p>Updated content</p>',
          publishedAt,
        }
        const unstableItem = {
          guid: 'new-random-guid',
          link: 'https://example.com/unstable',
          title: 'Unstable Post',
          content: '<p>Unstable content</p>',
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [stableItem, unstableItem],
          existingItems: [
            makeExisting({
              id: 'existing-stable',
              guid: 'stable-guid',
              link: 'https://example.com/stable',
              title: 'Stable Post',
              content: '<p>Old content</p>',
              publishedAt,
            }),
            makeExisting({
              id: 'existing-unstable',
              guid: 'old-random-guid',
              link: 'https://example.com/unstable',
              title: 'Unstable Post',
              content: '<p>Unstable content</p>',
              publishedAt,
            }),
          ],
        }
        const expected: ClassifyItemsResult = {
          inserts: [],
          updates: [
            {
              // Stable item: matched by guid in main pipeline (content changed).
              item: { ...stableItem, ...computeItemHashes(stableItem) },
              fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
              existingItemId: 'existing-stable',
              matchedBy: 'guid',
            },
            {
              // Unstable item: reconciled by link (guid changed, content same).
              item: { ...unstableItem, ...computeItemHashes(unstableItem) },
              fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
              existingItemId: 'existing-unstable',
              matchedBy: 'link',
            },
          ],
          fingerprintLevel: 'guid',
        }

        expect(classifyItems(value)).toEqual(expected)
      })

      it('should handle GUID removed from feed (becomes null)', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem = {
          link: 'https://example.com/post',
          title: 'Post Title',
          content: '<p>Content</p>',
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              guid: 'old-guid',
              link: 'https://example.com/post',
              title: 'Post Title',
              content: '<p>Content</p>',
              publishedAt,
            }),
          ],
        }
        // GUID changed from 'old-guid' to null. Main pipeline can't match
        // (fingerprint includes GUID prefix). Reconciliation catches it
        // because link matches and all content is the same.
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

      it('should handle all GUIDs changing with mixed content changes', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem1 = {
          guid: 'new-guid-1',
          link: 'https://example.com/post-1',
          title: 'Post 1',
          content: '<p>Content 1</p>',
          publishedAt,
        }
        const feedItem2 = {
          guid: 'new-guid-2',
          link: 'https://example.com/post-2',
          title: 'Post 2',
          content: '<p>Content 2</p>',
          publishedAt,
        }
        // Item 3 has same link as existing but different content.
        const feedItem3 = {
          guid: 'new-guid-3',
          link: 'https://example.com/post-3',
          title: 'Changed Title',
          content: '<p>Changed Content</p>',
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem1, feedItem2, feedItem3],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              guid: 'old-guid-1',
              link: 'https://example.com/post-1',
              title: 'Post 1',
              content: '<p>Content 1</p>',
              publishedAt,
            }),
            makeExisting({
              id: 'existing-2',
              guid: 'old-guid-2',
              link: 'https://example.com/post-2',
              title: 'Post 2',
              content: '<p>Content 2</p>',
              publishedAt,
            }),
            makeExisting({
              id: 'existing-3',
              guid: 'old-guid-3',
              link: 'https://example.com/post-3',
              title: 'Post 3',
              content: '<p>Content 3</p>',
              publishedAt,
            }),
          ],
        }

        const expected: ClassifyItemsResult = {
          // Items 1 and 2: same content, reconciled as updates.
          // Item 3: content differs (title changed), stays as insert.
          inserts: [
            {
              item: { ...feedItem3, ...computeItemHashes(feedItem3) },
              fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            },
          ],
          updates: [
            {
              item: { ...feedItem1, ...computeItemHashes(feedItem1) },
              fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
              existingItemId: 'existing-1',
              matchedBy: 'link',
            },
            {
              item: { ...feedItem2, ...computeItemHashes(feedItem2) },
              fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
              existingItemId: 'existing-2',
              matchedBy: 'link',
            },
          ],
          fingerprintLevel: 'guid',
        }

        expect(classifyItems(value)).toEqual(expected)
      })

      // Simulates feeds with random hex GUIDs regenerated on every build.
      // All other fields stay stable across 3 consecutive scans.
      it('should handle random hex GUIDs across 3 consecutive scans', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const post1 = {
          link: 'https://example.com/post-1',
          title: 'Post 1',
          content: '<p>Content 1</p>',
          publishedAt,
        }
        const post2 = {
          link: 'https://example.com/post-2',
          title: 'Post 2',
          content: '<p>Content 2</p>',
          publishedAt,
        }
        const post3 = {
          link: 'https://example.com/post-3',
          title: 'Post 3',
          content: '<p>Content 3</p>',
          publishedAt,
        }

        // Scan 1: first fetch, all items inserted.
        const scan1 = classifyItems({
          newItems: [
            { guid: 'a1b2c3d4e5f6', ...post1 },
            { guid: 'b2c3d4e5f6a1', ...post2 },
            { guid: 'c3d4e5f6a1b2', ...post3 },
          ],
          existingItems: [],
        })

        expect(scan1.inserts).toHaveLength(3)
        expect(scan1.updates).toHaveLength(0)

        // Build existing items from scan 1 results.
        const afterScan1: Array<ExistingItem> = scan1.inserts.map((insert, index) => ({
          ...insert.item,
          id: `item-${index + 1}`,
          publishedAt,
        }))

        // Scan 2: all GUIDs regenerated. Reconciliation catches all 3.
        const scan2 = classifyItems({
          newItems: [
            { guid: 'f6e5d4c3b2a1', ...post1 },
            { guid: 'e5d4c3b2a1f6', ...post2 },
            { guid: 'd4c3b2a1f6e5', ...post3 },
          ],
          existingItems: afterScan1,
          fingerprintLevel: scan1.fingerprintLevel,
        })

        expect(scan2.inserts).toHaveLength(0)
        expect(scan2.updates).toHaveLength(3)
        expect(scan2.updates.every((u) => u.matchedBy === 'link')).toBe(true)

        // Build existing items from scan 2 results.
        const afterScan2: Array<ExistingItem> = scan2.updates.map((update) => ({
          ...update.item,
          id: update.existingItemId,
          publishedAt,
        }))

        // Scan 3: yet another set of random GUIDs. Still reconciles.
        const scan3 = classifyItems({
          newItems: [
            { guid: '111111111111', ...post1 },
            { guid: '222222222222', ...post2 },
            { guid: '333333333333', ...post3 },
          ],
          existingItems: afterScan2,
          fingerprintLevel: scan2.fingerprintLevel,
        })

        expect(scan3.inserts).toHaveLength(0)
        expect(scan3.updates).toHaveLength(3)
        expect(scan3.updates.every((u) => u.matchedBy === 'link')).toBe(true)
      })

      it('should only reconcile first insert when two match the same existing item', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem1 = {
          guid: 'new-guid-1',
          link: 'https://example.com/post',
          title: 'Post Title',
          content: '<p>Content</p>',
          publishedAt,
        }
        const feedItem2 = {
          guid: 'new-guid-2',
          link: 'https://example.com/post',
          title: 'Post Title',
          content: '<p>Content</p>',
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem1, feedItem2],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              guid: 'old-guid',
              link: 'https://example.com/post',
              title: 'Post Title',
              content: '<p>Content</p>',
              publishedAt,
            }),
          ],
        }

        const expected: ClassifyItemsResult = {
          // First insert reconciles, second stays as insert.
          inserts: [
            {
              item: { ...feedItem2, ...computeItemHashes(feedItem2) },
              fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            },
          ],
          updates: [
            {
              item: { ...feedItem1, ...computeItemHashes(feedItem1) },
              fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
              existingItemId: 'existing-1',
              matchedBy: 'link',
            },
          ],
          fingerprintLevel: 'guid',
        }

        expect(classifyItems(value)).toEqual(expected)
      })

      it('should not reconcile Case 2 when incoming link belongs to another existing item', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem = {
          link: 'https://example.com/post-2',
          title: 'Same Title',
          content: '<p>Content</p>',
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              link: 'https://example.com/post-1',
              title: 'Same Title',
              content: '<p>Content</p>',
              publishedAt,
            }),
            makeExisting({
              id: 'existing-2',
              link: 'https://example.com/post-2',
              title: 'Different Title',
              content: '<p>Other content</p>',
              publishedAt,
            }),
          ],
        }

        // Both GUIDs null, link differs from existing-1, content matches.
        // But incoming link already belongs to existing-2 (ambiguity guard).
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

      it('should not trigger Case 2 when incoming has GUID but existing does not', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem = {
          guid: 'has-guid',
          link: 'https://example.com/new-link',
          title: 'Post Title',
          content: '<p>Content</p>',
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              link: 'https://example.com/old-link',
              title: 'Post Title',
              content: '<p>Content</p>',
              publishedAt,
            }),
          ],
        }

        // Incoming has GUID, existing does not. Not a Case 2 scenario
        // because both GUIDs must be null.
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

      it('should not reconcile insert when existing item is targeted by a link-change update', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem1 = {
          guid: 'same-guid',
          link: 'https://example.com/new-link',
          title: 'Post Title',
          content: '<p>Content</p>',
          publishedAt,
        }
        const feedItem2 = {
          guid: 'different-guid',
          link: 'https://example.com/old-link',
          title: 'Post Title',
          content: '<p>Content</p>',
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem1, feedItem2],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              guid: 'same-guid',
              link: 'https://example.com/old-link',
              title: 'Post Title',
              content: '<p>Content</p>',
              publishedAt,
            }),
          ],
        }

        // Item 1 matches existing-1 by GUID (link changed → update via changeFilter).
        // Item 2 has same content as existing-1 but can't reconcile because
        // existing-1 is already targeted by item 1's update.
        const expected: ClassifyItemsResult = {
          inserts: [
            {
              item: { ...feedItem2, ...computeItemHashes(feedItem2) },
              fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            },
          ],
          updates: [
            {
              item: { ...feedItem1, ...computeItemHashes(feedItem1) },
              fingerprintHash: expect.stringMatching(/^[a-f0-9]{32}$/),
              existingItemId: 'existing-1',
              matchedBy: 'guid',
            },
          ],
          fingerprintLevel: 'guid',
        }

        expect(classifyItems(value)).toEqual(expected)
      })

      it('should not reconcile when both GUID and link change (domain migration)', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const feedItem = {
          guid: 'https://new-domain.com/post',
          link: 'https://new-domain.com/post',
          title: 'Post Title',
          content: '<p>Content</p>',
          publishedAt,
        }
        const value: ClassifyItemsInput = {
          newItems: [feedItem],
          existingItems: [
            makeExisting({
              id: 'existing-1',
              guid: 'https://old-domain.com/post',
              link: 'https://old-domain.com/post',
              title: 'Post Title',
              content: '<p>Content</p>',
              publishedAt,
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

        // Both GUID and link changed. Reconciliation can't match because
        // neither identity field is the same. Known limitation until fuzzy
        // matching is implemented.
        expect(classifyItems(value)).toEqual(expected)
      })

      it('should handle GUIDs disappearing then reappearing across 3 scans', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const post = {
          guid: 'original-guid',
          link: 'https://example.com/post',
          title: 'Post',
          content: '<p>Content</p>',
          publishedAt,
        }

        // Scan 1: item with GUID.
        const scan1 = classifyItems({ newItems: [post], existingItems: [] })

        expect(scan1.inserts).toHaveLength(1)

        const afterScan1: ExistingItem = { ...scan1.inserts[0].item, id: 'item-1' }

        // Scan 2: GUID removed. Reconciliation catches it by link.
        const scan2 = classifyItems({
          newItems: [{ ...post, guid: null }],
          existingItems: [afterScan1],
          fingerprintLevel: scan1.fingerprintLevel,
        })

        expect(scan2.inserts).toHaveLength(0)
        expect(scan2.updates).toHaveLength(1)
        expect(scan2.updates[0].matchedBy).toBe('link')

        const afterScan2: ExistingItem = { ...scan2.updates[0].item, id: 'item-1' }

        // Scan 3: GUID reappears. Reconciliation catches it again by link.
        const scan3 = classifyItems({
          newItems: [post],
          existingItems: [afterScan2],
          fingerprintLevel: scan2.fingerprintLevel,
        })

        expect(scan3.inserts).toHaveLength(0)
        expect(scan3.updates).toHaveLength(1)
        expect(scan3.updates[0].matchedBy).toBe('link')
      })

      it('should handle link-only feed that adds GUIDs on scan 2', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')

        // Scan 1: no GUIDs, link-only items.
        const scan1 = classifyItems({
          newItems: [
            {
              link: 'https://example.com/post-1',
              title: 'Post 1',
              content: '<p>Content 1</p>',
              publishedAt,
            },
            {
              link: 'https://example.com/post-2',
              title: 'Post 2',
              content: '<p>Content 2</p>',
              publishedAt,
            },
          ],
          existingItems: [],
        })

        expect(scan1.inserts).toHaveLength(2)

        const afterScan1: Array<ExistingItem> = scan1.inserts.map((insert, index) => ({
          ...insert.item,
          id: `item-${index + 1}`,
        }))

        // Scan 2: GUIDs appear. Link still matches, reconciliation catches it.
        const scan2 = classifyItems({
          newItems: [
            {
              guid: 'guid-1',
              link: 'https://example.com/post-1',
              title: 'Post 1',
              content: '<p>Content 1</p>',
              publishedAt,
            },
            {
              guid: 'guid-2',
              link: 'https://example.com/post-2',
              title: 'Post 2',
              content: '<p>Content 2</p>',
              publishedAt,
            },
          ],
          existingItems: afterScan1,
          fingerprintLevel: scan1.fingerprintLevel,
        })

        expect(scan2.inserts).toHaveLength(0)
        expect(scan2.updates).toHaveLength(2)
      })

      it('should handle growing feed with changing GUIDs on existing items', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const post1 = {
          link: 'https://example.com/post-1',
          title: 'Post 1',
          content: '<p>Content 1</p>',
          publishedAt,
        }
        const post2 = {
          link: 'https://example.com/post-2',
          title: 'Post 2',
          content: '<p>Content 2</p>',
          publishedAt,
        }
        const post3 = {
          link: 'https://example.com/post-3',
          title: 'Post 3',
          content: '<p>Content 3</p>',
          publishedAt,
        }
        const post4 = {
          link: 'https://example.com/post-4',
          title: 'Post 4',
          content: '<p>Content 4</p>',
          publishedAt,
        }
        const post5 = {
          link: 'https://example.com/post-5',
          title: 'Post 5',
          content: '<p>Content 5</p>',
          publishedAt,
        }

        // Scan 1: 3 items inserted.
        const scan1 = classifyItems({
          newItems: [
            { guid: 'guid-1', ...post1 },
            { guid: 'guid-2', ...post2 },
            { guid: 'guid-3', ...post3 },
          ],
          existingItems: [],
        })

        expect(scan1.inserts).toHaveLength(3)

        const afterScan1: Array<ExistingItem> = scan1.inserts.map((insert, index) => ({
          ...insert.item,
          id: `item-${index + 1}`,
        }))

        // Scan 2: 3 old items with new GUIDs + 2 genuinely new items.
        const scan2 = classifyItems({
          newItems: [
            { guid: 'new-guid-1', ...post1 },
            { guid: 'new-guid-2', ...post2 },
            { guid: 'new-guid-3', ...post3 },
            { guid: 'guid-4', ...post4 },
            { guid: 'guid-5', ...post5 },
          ],
          existingItems: afterScan1,
          fingerprintLevel: scan1.fingerprintLevel,
        })

        // 3 old items reconciled + 2 genuinely new items inserted.
        expect(scan2.updates).toHaveLength(3)
        expect(scan2.inserts).toHaveLength(2)
      })

      it('should handle shrinking feed with changing GUIDs on remaining items', () => {
        const publishedAt = new Date('2024-01-01T00:00:00Z')
        const post1 = {
          link: 'https://example.com/post-1',
          title: 'Post 1',
          content: '<p>Content 1</p>',
          publishedAt,
        }
        const post2 = {
          link: 'https://example.com/post-2',
          title: 'Post 2',
          content: '<p>Content 2</p>',
          publishedAt,
        }
        const post3 = {
          link: 'https://example.com/post-3',
          title: 'Post 3',
          content: '<p>Content 3</p>',
          publishedAt,
        }
        const post4 = {
          link: 'https://example.com/post-4',
          title: 'Post 4',
          content: '<p>Content 4</p>',
          publishedAt,
        }
        const post5 = {
          link: 'https://example.com/post-5',
          title: 'Post 5',
          content: '<p>Content 5</p>',
          publishedAt,
        }

        // Scan 1: 5 items inserted.
        const scan1 = classifyItems({
          newItems: [
            { guid: 'guid-1', ...post1 },
            { guid: 'guid-2', ...post2 },
            { guid: 'guid-3', ...post3 },
            { guid: 'guid-4', ...post4 },
            { guid: 'guid-5', ...post5 },
          ],
          existingItems: [],
        })

        expect(scan1.inserts).toHaveLength(5)

        const afterScan1: Array<ExistingItem> = scan1.inserts.map((insert, index) => ({
          ...insert.item,
          id: `item-${index + 1}`,
        }))

        // Scan 2: only 3 items remain, all with new GUIDs.
        // The 2 removed items stay in existingItems but have no match.
        const scan2 = classifyItems({
          newItems: [
            { guid: 'new-guid-1', ...post1 },
            { guid: 'new-guid-3', ...post3 },
            { guid: 'new-guid-5', ...post5 },
          ],
          existingItems: afterScan1,
          fingerprintLevel: scan1.fingerprintLevel,
        })

        // 3 remaining items reconciled. No inserts (removed items just unmatched).
        expect(scan2.updates).toHaveLength(3)
        expect(scan2.inserts).toHaveLength(0)
      })
    })
  })
})
