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

const { inserts, updates } = classifyItems({
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
// or 'reconciled'.

// The result also returns fingerprintLevel, the level used for this scan. See Options.
```

## Options

| Option | Description |
| --- | --- |
| `fingerprintLevel` | The level fingerprints are built at: `guid`, `guidFragment`, `link`, `linkFragment`, `enclosure` or `title`, from strongest to weakest. Left out, it is computed from the items as the strongest level at which no two items collide and none is left without a fingerprint. Passed in, it is kept while it still holds and otherwise moved to a weaker level, never to a stronger one. The result returns the level used, so store it per feed and pass it back in on the next scan. |

## How It Works

| Step | Name | Description |
| --- | --- | --- |
| 1 | Hash | Each incoming item's fields (guid, link, title, content, etc.) are normalized and hashed. |
| 2 | Profile | The feed is profiled for how often each signal (guid, link, enclosure, title) is present and how many of its values are distinct. Links are trusted only when at least 95% of their values are distinct. |
| 3 | Fingerprint | Hashes are combined into a single fingerprint at the appropriate level for the feed. An item with no guid, link, enclosure or title has no fingerprint and is dropped from the result. |
| 4 | Deduplicate | Incoming items sharing a fingerprint are collapsed so duplicates within the same batch don't produce multiple inserts. |
| 5 | Screen | Match candidates must share the incoming item's fingerprint at the feed's level. |
| 6 | Match | Each incoming item is run through a strategy chain against the screened existing items, with candidate filters to reject false positives. When links are trusted the chain is guid → link → enclosure → title. Otherwise it is guid → enclosure → link → title, and link is tried only for items that have neither a guid nor an enclosure. Title is tried only for items that have no guid, link or enclosure. |
| 7 | Classify | Matched items become updates when any field differs (hashes, publishedAt), unmatched items become inserts. |
| 8 | Reconcile | Inserts that are identical to an existing item except for guid or link are reclassified as updates, handling feeds with unstable identifiers. |
