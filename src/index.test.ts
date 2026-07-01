import { describe, expect, it } from 'bun:test'
import type { ClassifyItemsInput, ClassifyItemsResult, ExistingItem, NewItem } from './index.js'
import { classifyItems, computeItemHashes } from './index.js'

// End-to-end behavioural spec driven only through the public surface of the
// package (./index.js). This file differs from classifier.test.ts on purpose:
//
// - classifier.test.ts is white-box: it imports internals directly and covers
//   every mechanism systematically. Its tests are coupled to the
//   implementation and are allowed to die when the internals they test are
//   replaced.
// - index.test.ts is black-box: importing only from index.js makes it an API
//   contract check (scenarios only compile when the package exports what a
//   consumer needs) and keeps it independent of the internals, so it is the
//   acceptance spec any rewrite must still pass.
//
// Rule of thumb: a test that reads like an incident report or a recorded
// design decision (a real production case, an accepted trade-off) belongs
// here. A test that reads like "should downgrade level when X collides"
// belongs in classifier.test.ts.
//
// Scenarios mirror real production duplicates measured against the live
// database. Tests that record an accepted trade-off say so in their name and
// explain the reasoning in a comment.

const md5Regex = /^[a-f0-9]{32}$/
const publishedAt = new Date('2026-06-30T23:08:00Z')
const olderPublishedAt = new Date('2026-06-01T12:00:00Z')

const withHashes = (item: NewItem): NewItem & ReturnType<typeof computeItemHashes> => {
  return { ...item, ...computeItemHashes(item) }
}

const toExisting = (item: NewItem, id: string): ExistingItem => {
  return { id, ...computeItemHashes(item), publishedAt: item.publishedAt ?? undefined }
}

describe('classifyItems duplicate resilience (e2e)', () => {
  describe('same guid, volatile field changed → update not insert', () => {
    it('should update an item whose headline was edited while guid and date are stable', () => {
      const original: NewItem = {
        guid: 'https://example.com/microsoft-job-cuts',
        link: 'https://example.com/microsoft-job-cuts',
        title: 'Microsoft plans another round of job cuts, impacting thousands',
        publishedAt,
      }
      const edited: NewItem = {
        ...original,
        title: 'Microsoft plans thousands of job cuts, impacting less than 2.5%',
      }
      const value: ClassifyItemsInput = {
        newItems: [edited],
        existingItems: [toExisting(original, 'existing-1')],
        // Channel stuck at title level — the exact production bug condition.
        fingerprintLevel: 'title',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: withHashes(edited),
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update an item whose enclosure url rotated while guid and date are stable', () => {
      const original: NewItem = {
        guid: 'https://example.com/episode-1',
        title: 'Europe scorching heat is gradually moving east',
        enclosures: [{ url: 'https://cdn.example.com/ep1.mp3?token=aaa' }],
        publishedAt,
      }
      const rotated: NewItem = {
        ...original,
        enclosures: [{ url: 'https://cdn.example.com/ep1.mp3?token=bbb' }],
      }
      const value: ClassifyItemsInput = {
        newItems: [rotated],
        existingItems: [toExisting(original, 'existing-1')],
        fingerprintLevel: 'enclosure',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: withHashes(rotated),
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'enclosure',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should update when both title and enclosure change on a stable guid', () => {
      const original: NewItem = {
        guid: 'https://example.com/episode-2',
        title: 'Old headline',
        enclosures: [{ url: 'https://cdn.example.com/ep2.mp3?token=aaa' }],
        publishedAt,
      }
      const edited: NewItem = {
        guid: 'https://example.com/episode-2',
        title: 'New headline entirely',
        enclosures: [{ url: 'https://cdn.example.com/ep2.mp3?token=zzz' }],
        publishedAt,
      }
      const value: ClassifyItemsInput = {
        newItems: [edited],
        existingItems: [toExisting(original, 'existing-1')],
        fingerprintLevel: 'title',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: withHashes(edited),
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'existing-1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should never re-insert across repeated scans as the enclosure keeps rotating', () => {
      const base: NewItem = {
        guid: 'https://example.com/episode-3',
        title: 'Weekly episode',
        publishedAt,
      }
      const scanTwoItem: NewItem = {
        ...base,
        enclosures: [{ url: 'https://cdn.example.com/ep3.mp3?t=2' }],
      }
      const scanThreeItem: NewItem = {
        ...base,
        enclosures: [{ url: 'https://cdn.example.com/ep3.mp3?t=3' }],
      }
      const expectedScanTwo: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: withHashes(scanTwoItem),
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'e1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'enclosure',
      }
      const expectedScanThree: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: withHashes(scanThreeItem),
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'e1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'enclosure',
      }

      const scanTwo = classifyItems({
        newItems: [scanTwoItem],
        existingItems: [
          toExisting(
            { ...base, enclosures: [{ url: 'https://cdn.example.com/ep3.mp3?t=1' }] },
            'e1',
          ),
        ],
        fingerprintLevel: 'enclosure',
      })
      const scanThree = classifyItems({
        newItems: [scanThreeItem],
        existingItems: [toExisting(scanTwoItem, 'e1')],
        fingerprintLevel: 'enclosure',
      })

      expect(scanTwo).toEqual(expectedScanTwo)
      expect(scanThree).toEqual(expectedScanThree)
    })
  })

  describe('no guid: not safely mergeable (must stay separate)', () => {
    // Without a guid, a same-link item with a changed title is indistinguishable
    // from a distinct hub article, so it must not be merged. Handling stable-link
    // or stable-enclosure no-guid feeds is deferred (needs field normalisation).
    it('should insert a guidless same-link item whose title changed', () => {
      const original: NewItem = {
        link: 'https://example.com/post',
        title: 'Original title',
        publishedAt,
      }
      const edited: NewItem = { ...original, title: 'Corrected title' }
      const value: ClassifyItemsInput = {
        newItems: [edited],
        existingItems: [toExisting(original, 'existing-1')],
        fingerprintLevel: 'title',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: withHashes(edited),
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })
  })

  describe('false-merge protection (distinct items must stay separate)', () => {
    it('should keep two different-guid articles that share a link as separate items', () => {
      const incoming: NewItem = {
        guid: 'https://example.com/story-x',
        link: 'https://example.com/shared',
        title: 'Story X',
        publishedAt,
      }
      const value: ClassifyItemsInput = {
        newItems: [incoming],
        existingItems: [
          toExisting(
            {
              guid: 'https://example.com/story-y',
              link: 'https://example.com/shared',
              title: 'Story Y',
              publishedAt,
            },
            'existing-y',
          ),
        ],
        fingerprintLevel: 'guid',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: withHashes(incoming),
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should reconcile a guid rewrite when link and all content are identical', () => {
      // Boundary case: same link + identical title/summary/date, only the guid
      // changed. This is one article whose guid was rewritten, so reconciliation
      // correctly merges it. The distinct-article guard above differs only in
      // that the titles differ, which is what keeps those apart.
      const shared = {
        link: 'https://example.com/shared',
        title: 'Identical Title',
        summary: 'Identical summary',
        publishedAt,
      }
      const rewritten: NewItem = { ...shared, guid: 'https://example.com/x' }
      const value: ClassifyItemsInput = {
        newItems: [rewritten],
        existingItems: [toExisting({ ...shared, guid: 'https://example.com/y' }, 'existing-y')],
        fingerprintLevel: 'guid',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: withHashes(rewritten),
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'existing-y',
            matchedBy: 'link',
          },
        ],
        fingerprintLevel: 'guid',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should keep distinct hub items that share a link but differ in title', () => {
      const articleA: NewItem = {
        link: 'https://example.com/hub',
        title: 'Article A',
        publishedAt,
      }
      const articleB: NewItem = {
        link: 'https://example.com/hub',
        title: 'Article B',
        publishedAt,
      }
      const value: ClassifyItemsInput = {
        newItems: [articleA, articleB],
        existingItems: [],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: withHashes(articleA),
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: withHashes(articleB),
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      const result = classifyItems(value)

      expect(result).toEqual(expected)
      expect(result.inserts[0]?.fingerprintHash).not.toBe(result.inserts[1]?.fingerprintHash)
    })

    it('should keep distinct releases that reuse a single degenerate guid', () => {
      // Passes because a 2-item batch sharing one guid reads as 0.5 guid
      // uniqueness, below the bypass gate. It does not generalize to a reused
      // guid inside a mostly-unique feed; that case is the accepted residual
      // documented in the test below.
      const releaseOne: NewItem = {
        guid: 'shared-guid',
        title: 'SeaMonkey 2.1',
        publishedAt: olderPublishedAt,
      }
      const releaseTwo: NewItem = {
        guid: 'shared-guid',
        title: 'SeaMonkey 2.2',
        publishedAt,
      }
      const value: ClassifyItemsInput = {
        newItems: [releaseOne, releaseTwo],
        existingItems: [],
        fingerprintLevel: 'guid',
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: withHashes(releaseOne),
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: withHashes(releaseTwo),
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'title',
      }

      const result = classifyItems(value)

      expect(result).toEqual(expected)
      expect(result.inserts[0]?.fingerprintHash).not.toBe(result.inserts[1]?.fingerprintHash)
    })

    it('should merge a cross-scan guid reuse on a mostly-unique feed (accepted residual)', () => {
      // A guid reused across scans for a different article, published within
      // the date proximity window, on a feed whose guids are otherwise unique:
      // the bypass cannot distinguish this from a retitled edit, so it merges.
      // Every production family with this shape was a retitled edit, making
      // the merge the desired outcome; this test documents the trade so a
      // future change that flips it is a conscious decision.
      const fillers = Array.from({ length: 19 }, (_, index) => {
        return toExisting(
          {
            guid: `https://example.com/post-${index}`,
            title: `Post ${index}`,
            publishedAt: olderPublishedAt,
          },
          `filler-${index}`,
        )
      })
      const articleA: NewItem = {
        guid: 'https://example.com/reused',
        link: 'https://example.com/article-a',
        title: 'Article A',
        publishedAt: new Date('2026-06-29T12:00:00Z'),
      }
      const articleB: NewItem = {
        guid: 'https://example.com/reused',
        link: 'https://example.com/article-b',
        title: 'Article B',
        publishedAt,
      }
      const value: ClassifyItemsInput = {
        newItems: [articleB],
        existingItems: [...fillers, toExisting(articleA, 'existing-a')],
        fingerprintLevel: 'title',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        updates: [
          {
            item: withHashes(articleB),
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'existing-a',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })
  })

  describe('level recovery and mixed feeds', () => {
    it('should classify clean unique guids by guid even when the channel was stuck at title', () => {
      const postOne: NewItem = { guid: 'guid-1', title: 'Post 1 original', publishedAt }
      const postOneEdited: NewItem = { guid: 'guid-1', title: 'Post 1 edited', publishedAt }
      const postTwo: NewItem = { guid: 'guid-2', title: 'Post 2', publishedAt: olderPublishedAt }
      const value: ClassifyItemsInput = {
        newItems: [postOneEdited, postTwo],
        existingItems: [toExisting(postOne, 'e1'), toExisting(postTwo, 'e2')],
        fingerprintLevel: 'title',
      }
      const expected: ClassifyItemsResult = {
        inserts: [],
        // Post 1 edited → single update by guid. Post 2 unchanged → omitted.
        updates: [
          {
            item: withHashes(postOneEdited),
            fingerprintHash: expect.stringMatching(md5Regex),
            existingItemId: 'e1',
            matchedBy: 'guid',
          },
        ],
        fingerprintLevel: 'title',
      }

      expect(classifyItems(value)).toEqual(expected)
    })

    it('should insert distinct items in a mixed feed where some lack a guid', () => {
      const postOne: NewItem = {
        guid: 'guid-1',
        link: 'https://example.com/p1',
        title: 'Post 1',
        publishedAt,
      }
      const postTwo: NewItem = {
        link: 'https://example.com/p2',
        title: 'Post 2',
        publishedAt,
      }
      const value: ClassifyItemsInput = {
        newItems: [postOne, postTwo],
        existingItems: [],
      }
      const expected: ClassifyItemsResult = {
        inserts: [
          {
            item: withHashes(postOne),
            fingerprintHash: expect.stringMatching(md5Regex),
          },
          {
            item: withHashes(postTwo),
            fingerprintHash: expect.stringMatching(md5Regex),
          },
        ],
        updates: [],
        fingerprintLevel: 'link',
      }

      const result = classifyItems(value)

      expect(result).toEqual(expected)
      expect(result.inserts[0]?.fingerprintHash).not.toBe(result.inserts[1]?.fingerprintHash)
    })
  })
})
