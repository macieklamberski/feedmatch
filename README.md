# Feedmatch

[![codecov](https://codecov.io/gh/macieklamberski/feedmatch/branch/main/graph/badge.svg)](https://codecov.io/gh/macieklamberski/feedmatch)
[![npm version](https://img.shields.io/npm/v/feedmatch.svg)](https://www.npmjs.com/package/feedmatch)
[![license](https://img.shields.io/npm/l/feedmatch.svg)](https://github.com/macieklamberski/feedmatch/blob/main/LICENSE)

Classify and deduplicate feed items into inserts and updates.

Feedmatch figures out which feed items are new (inserts) and which ones are updates to already stored items. It does this by hashing and fingerprinting item fields, profiling the feed, and matching incoming items against existing ones using multiple strategies.

## Installation

```bash
npm install feedmatch
```

## Quick Start

```typescript
import { classifyItems } from 'feedmatch'

const { inserts, updates } = await classifyItems({
  newItems: [
    {
      guid: 'https://example.com/post/1',
      link: 'https://example.com/post/1',
      title: 'Hello World',
      content: '<p>My first post</p>',
    },
    {
      guid: 'https://example.com/post/2',
      link: 'https://example.com/post/2',
      title: 'Second Post',
    },
  ],
  existingItems: [
    {
      id: 42,
      guidHash: '08beb303...',
      linkHash: '08beb303...',
      titleHash: 'b94d27b9...',
      // ... other hash fields
    },
  ],
})

// Inserts - new items not matching any existing item.
// inserts[0].item - the incoming item with computed hashes.
// inserts[0].fingerprintHash - unique fingerprint for deduplication.

// Updates - items matched to an existing item.
// updates[0].existingItemId - the ID of the matched existing item.
// updates[0].matchedBy - how it was matched: 'guid', 'link', 'enclosure', 'title',
// 'reconciled', or 'fallback'.

// The result also returns fingerprintLevel, the level used for this scan. See Options.
```

## Options

| Option | Description |
| --- | --- |
| `fingerprintLevel` | The level fingerprints are built at: `guid`, `guidFragment`, `link`, `linkFragment`, `enclosure` or `title`, from strongest to weakest. Left out, it is computed from the items as the strongest level at which no two items collide and none is left without a fingerprint. Passed in, it is kept while it still holds and otherwise moved to a weaker level, never to a stronger one. The result returns the level used, so store it per feed and pass it back in on the next scan. |
| `cleanUrlFn` | Called with every link, enclosure URL and guid that starts with `http://` or `https://`, before it is normalized and hashed. Use it to strip tracking parameters, for example. Stored hashes depend on it, so pass the same function on every scan. |
| `dateProximityDays` | How far apart two `publishedAt` dates can be for a guid or link match to count. Defaults to 7. It stops a feed that reuses a guid or link for a different item from merging the two. A match counts when either side has no date. |

## How It Works

| Step | Name | Description |
| --- | --- | --- |
| 1 | Hash | Each incoming item's fields (guid, link, title, content, etc.) are normalized and hashed. `publishedAt` is typed as a `Date`. A date string or an invalid date that gets past the types is still handled, on incoming and existing items alike: strings are parsed and invalid dates are dropped. Emitted inserts/updates carry the coerced value, which is `null` for a dropped date. |
| 2 | Profile | The feed is profiled for how often each signal (guid, link, enclosure, title) is present and how many of its values are distinct. Guids and links are each trusted only when at least 95% of their values are distinct. |
| 3 | Classify enclosures | Enclosures are classified by content type, falling back to the URL's file extension when the type is missing or unrecognized: audio and video count as identity, while images and unclassifiable URLs are changeable content, excluded from the fingerprint unless they are the item's only identity. |
| 4 | Fingerprint | Hashes are combined into a single fingerprint at the appropriate level for the feed. An item with no guid, link, enclosure or title has no fingerprint and is dropped from the result. |
| 5 | Deduplicate | Incoming items sharing a fingerprint are collapsed so duplicates within the same batch don't produce multiple inserts. |
| 6 | Screen | Match candidates must share the incoming item's fingerprint at the feed's level. Exception: a candidate agreeing on a feed-unique guid passes regardless, so edits on a stable guid become updates. |
| 7 | Match | Each incoming item is run through a strategy chain against the screened existing items, with candidate filters to reject false positives. When links are trusted the chain is guid → link → enclosure → title. Otherwise it is guid → enclosure → link → title, and link is tried only for items that have neither a guid nor an enclosure. Title is tried only for items that have no guid, link or enclosure. An enclosure excluded from identity in step 3 does not count here. Guid matches on a trusted-guid feed are exempt from the date proximity window, so republished items with a bumped date stay updates. |
| 8 | Classify | Matched items become updates when any hash differs, or when the incoming item carries a publishedAt that differs from the stored one; unmatched items become inserts. |
| 9 | Reconcile | Inserts that are identical to an existing item except for guid or link are reclassified as updates, handling feeds with unstable identifiers. A shared link needs no date agreement; a match on text alone does, when both sides carry a date. Several stored copies that all match by link narrow to the most recent one. |
| 10 | Fallback | Optional. Remaining inserts are offered to your `fallbackMatchFn` together with nearby existing items, so you can plug in any matching logic. |

## Fallback Matching

Feedmatch matches items by comparing hashes, so a field has to be identical to count. An item republished with a new guid, a new link and a reworded title shares nothing with its stored copy, and comes out as an insert.

`fallbackMatchFn` covers those cases. It gets each item that is about to become an insert, together with the existing items it could be, and returns the one it matches. How it decides is up to the function: fuzzy text comparison, an AI classifier, a rule written for one feed.

```typescript
const { inserts, updates } = await classifyItems({
  newItems,
  existingItems,
  fallbackMatchFn: async ({ incoming, candidates }) => {
    const stored = await loadItems(candidates.map((candidate) => candidate.id))
    const match = stored.find((item) => isSameArticle(incoming, item))

    return match?.id
  },
})
```

Return the `id` of one of the candidates, or nothing to keep the insert. The function can be sync or async. A match comes back as an update with `matchedBy: 'fallback'`. When the function throws, `classifyItems` rejects, so catch inside the function to keep the insert.

The candidates are the existing items that no earlier step matched and that were published within `fallbackWindowDays` of the incoming item (default: 2). An existing item is not a candidate when the incoming guid or link already belongs to a different existing item. Items without `publishedAt` are never candidates, and an incoming item without one skips the function. When two incoming items pick the same candidate, both stay inserts.

Pass existing items that share no hash with the incoming ones too, for example the most recent rows by date. A list loaded by looking up the incoming guid, link or title hashes will miss the item the function is looking for.
