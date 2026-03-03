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

1. **Hash** - each incoming item's fields (guid, link, title, content, etc.) are normalized and hashed.
2. **Fingerprint** - hashes are combined into a single fingerprint at the appropriate level for the feed.
3. **Deduplicate** - incoming items sharing a fingerprint are collapsed so duplicates within the same batch don't produce multiple inserts.
4. **Profile** - the feed is profiled to determine which signals (guid, link, enclosure, title) are reliable for matching.
5. **Match** - each incoming item is run through a strategy chain (guid → link → enclosure → title) against existing items, with candidate filters to reject false positives.
6. **Classify** - matched items become updates, unmatched items become inserts.
