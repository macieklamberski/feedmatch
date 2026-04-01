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
      guidHash: '9a0364b9...',
      linkHash: '9a0364b9...',
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
// updates[0].matchedBy - how it was matched: 'guid', 'link', 'enclosure', or 'title'.
```

## How It Works

| Step | Name | Description |
| --- | --- | --- |
| 1 | Hash | Each incoming item's fields (guid, link, title, content, etc.) are normalized and hashed. |
| 2 | Fingerprint | Hashes are combined into a single fingerprint at the appropriate level for the feed. |
| 3 | Deduplicate | Incoming items sharing a fingerprint are collapsed so duplicates within the same batch don't produce multiple inserts. |
| 4 | Profile | The feed is profiled to determine which signals (guid, link, enclosure, title) are reliable for matching. |
| 5 | Match | Each incoming item is run through a strategy chain against existing items, with candidate filters to reject false positives. The chain order depends on feed profile: guid → link → enclosure → title for high-uniqueness feeds, guid → enclosure → link → title for low-uniqueness feeds. Ambiguous matches (multiple candidates) prefer insert over wrong merge. |
| 6 | Classify | Matched items become updates if any hash field changed, unmatched items become inserts. Matched items with no changes are silently skipped. |
| 7 | Reconcile | Inserts where all content fields (title, content, summary, enclosure, publishedAt) match an existing item but the guid or link differs are reclassified as updates. Handles feeds with unstable identifiers. |
