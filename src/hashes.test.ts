import { describe, expect, it } from 'bun:test'
import { composeItemIdentifier, computeItemHashes, resolveIdentityDepth } from './hashes.js'
import type { HashableItem, ItemHashes } from './types.js'

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

describe('composeItemIdentifier', () => {
  it('should include only guid slot at depth=guid', () => {
    const value = makeHashes({ guidHash: 'g1', linkHash: 'l1', titleHash: 't1' })
    const expected = 'g:g1'

    expect(composeItemIdentifier(value, 'guid')).toBe(expected)
  })

  it('should include guid and guidFragment at depth=guidFragment', () => {
    const value = makeHashes({ guidHash: 'g1', guidFragmentHash: 'gf1', linkHash: 'l1' })
    const expected = 'g:g1|gf:gf1'

    expect(composeItemIdentifier(value, 'guidFragment')).toBe(expected)
  })

  it('should include up to link at depth=link', () => {
    const value = makeHashes({ guidHash: 'g1', linkHash: 'l1', titleHash: 't1' })
    const expected = 'g:g1|gf:|l:l1'

    expect(composeItemIdentifier(value, 'link')).toBe(expected)
  })

  it('should include up to linkFragment at depth=linkFragment', () => {
    const value = makeHashes({ guidHash: 'g1', linkHash: 'l1', linkFragmentHash: 'lf1' })
    const expected = 'g:g1|gf:|l:l1|lf:lf1'

    expect(composeItemIdentifier(value, 'linkFragment')).toBe(expected)
  })

  it('should include up to enclosure at depth=enclosure', () => {
    const value = makeHashes({ guidHash: 'g1', linkHash: 'l1', enclosureHash: 'e1' })
    const expected = 'g:g1|gf:|l:l1|lf:|e:e1'

    expect(composeItemIdentifier(value, 'enclosure')).toBe(expected)
  })

  it('should include all six slots at depth=title', () => {
    const value = makeHashes({
      guidHash: 'g1',
      guidFragmentHash: 'gf1',
      linkHash: 'l1',
      linkFragmentHash: 'lf1',
      enclosureHash: 'e1',
      titleHash: 't1',
    })
    const expected = 'g:g1|gf:gf1|l:l1|lf:lf1|e:e1|t:t1'

    expect(composeItemIdentifier(value, 'title')).toBe(expected)
  })

  it('should produce empty slots for missing hashes', () => {
    const value = makeHashes({ guidHash: 'g1' })
    const expected = 'g:g1|gf:|l:|lf:|e:|t:'

    expect(composeItemIdentifier(value, 'title')).toBe(expected)
  })

  it('should produce different identifiers for items with same link but different titles at depth=title', () => {
    const value1 = makeHashes({ linkHash: 'l1', titleHash: 't1' })
    const value2 = makeHashes({ linkHash: 'l1', titleHash: 't2' })

    expect(composeItemIdentifier(value1, 'title')).not.toBe(composeItemIdentifier(value2, 'title'))
  })

  it('should produce same identifiers for items with same link but different titles at depth=link', () => {
    const value1 = makeHashes({ linkHash: 'l1', titleHash: 't1' })
    const value2 = makeHashes({ linkHash: 'l1', titleHash: 't2' })

    expect(composeItemIdentifier(value1, 'link')).toBe(composeItemIdentifier(value2, 'link'))
  })

  it('should ignore fragments at depth=link', () => {
    const value1 = makeHashes({ linkHash: 'l1', linkFragmentHash: 'lf1' })
    const value2 = makeHashes({ linkHash: 'l1', linkFragmentHash: 'lf2' })

    expect(composeItemIdentifier(value1, 'link')).toBe(composeItemIdentifier(value2, 'link'))
  })

  it('should include fragments at depth=linkFragment', () => {
    const value1 = makeHashes({ linkHash: 'l1', linkFragmentHash: 'lf1' })
    const value2 = makeHashes({ linkHash: 'l1', linkFragmentHash: 'lf2' })

    expect(composeItemIdentifier(value1, 'linkFragment')).not.toBe(
      composeItemIdentifier(value2, 'linkFragment'),
    )
  })

  it('should return undefined when no hashes exist in prefix', () => {
    const value = makeHashes()

    expect(composeItemIdentifier(value, 'title')).toBeUndefined()
  })

  it('should return undefined when only hashes below the min rung exist', () => {
    const value = makeHashes({ titleHash: 't1' })

    expect(composeItemIdentifier(value, 'link')).toBeUndefined()
  })
})

describe('resolveIdentityDepth', () => {
  it('should pick strongest collision-free rung for new channel', () => {
    const values = [
      makeHashes({ guidHash: 'g1', linkHash: 'l1', titleHash: 't1' }),
      makeHashes({ guidHash: 'g2', linkHash: 'l2', titleHash: 't2' }),
    ]

    expect(resolveIdentityDepth(values)).toBe('guid')
  })

  it('should return current min rung unchanged when no collisions', () => {
    const values = [
      makeHashes({ guidHash: 'g1', linkHash: 'l1' }),
      makeHashes({ guidHash: 'g2', linkHash: 'l2' }),
    ]

    expect(resolveIdentityDepth(values, 'link')).toBe('link')
  })

  it('should downgrade when current min rung has collisions', () => {
    // Same link → link collides → should move to a weaker rung.
    const values = [
      makeHashes({ linkHash: 'l1', titleHash: 't1' }),
      makeHashes({ linkHash: 'l1', titleHash: 't2' }),
    ]

    expect(resolveIdentityDepth(values, 'link')).toBe('title')
  })

  it('should return guid when no collisions at any level', () => {
    const values = [
      makeHashes({ guidHash: 'g1', linkHash: 'l1', enclosureHash: 'e1', titleHash: 't1' }),
      makeHashes({ guidHash: 'g2', linkHash: 'l2', enclosureHash: 'e2', titleHash: 't2' }),
    ]

    expect(resolveIdentityDepth(values)).toBe('guid')
  })

  it('should return title when collisions exist at all levels', () => {
    // All rungs collide — identical hashes everywhere.
    const values = [
      makeHashes({ guidHash: 'g1', linkHash: 'l1', enclosureHash: 'e1', titleHash: 't1' }),
      makeHashes({ guidHash: 'g1', linkHash: 'l1', enclosureHash: 'e1', titleHash: 't1' }),
    ]

    expect(resolveIdentityDepth(values)).toBe('title')
  })

  it('should skip to enclosure when guid and link collide', () => {
    const values = [
      makeHashes({ guidHash: 'g1', linkHash: 'l1', enclosureHash: 'e1', titleHash: 't1' }),
      makeHashes({ guidHash: 'g1', linkHash: 'l1', enclosureHash: 'e2', titleHash: 't2' }),
    ]

    expect(resolveIdentityDepth(values)).toBe('enclosure')
  })

  it('should handle single-item batch as guid', () => {
    const values = [makeHashes({ guidHash: 'g1', linkHash: 'l1' })]

    expect(resolveIdentityDepth(values)).toBe('guid')
  })

  it('should handle empty batch as title', () => {
    expect(resolveIdentityDepth([])).toBe('title')
  })

  it('should preserve current min rung on empty batch', () => {
    expect(resolveIdentityDepth([], 'guid')).toBe('guid')
  })

  it('should skip rungs that identify no items', () => {
    // Link-only items — guid produces no identifiers, should skip to link.
    const values = [
      makeHashes({ linkHash: 'l1', titleHash: 't1' }),
      makeHashes({ linkHash: 'l2', titleHash: 't2' }),
    ]

    expect(resolveIdentityDepth(values)).toBe('link')
  })

  it('should never upgrade above current min rung', () => {
    // No collisions at guid, but current min rung is title — should stay at title.
    const values = [
      makeHashes({ guidHash: 'g1', linkHash: 'l1', titleHash: 't1' }),
      makeHashes({ guidHash: 'g2', linkHash: 'l2', titleHash: 't2' }),
    ]

    expect(resolveIdentityDepth(values, 'title')).toBe('title')
  })
})

describe('computeItemHashes', () => {
  it('should compute all hashes when all fields present', () => {
    const value: HashableItem = {
      guid: 'https://example.com/post-1',
      link: 'https://example.com/post-1',
      title: 'Post Title',
      summary: 'Post summary text',
      content: 'Post content text',
      enclosures: [{ url: 'https://example.com/audio.mp3' }],
    }
    const expected = {
      guidHash: expect.stringMatching(/^[a-f0-9]{32}$/),
      guidFragmentHash: null,
      linkHash: expect.stringMatching(/^[a-f0-9]{32}$/),
      linkFragmentHash: null,
      enclosureHash: expect.stringMatching(/^[a-f0-9]{32}$/),
      titleHash: expect.stringMatching(/^[a-f0-9]{32}$/),
      summaryHash: expect.stringMatching(/^[a-f0-9]{32}$/),
      contentHash: expect.stringMatching(/^[a-f0-9]{32}$/),
    }

    expect(computeItemHashes(value)).toEqual(expected)
  })

  it('should compute only guidHash when only guid present', () => {
    const value: HashableItem = { guid: 'abc-123' }
    const expected = {
      guidHash: expect.stringMatching(/^[a-f0-9]{32}$/),
      guidFragmentHash: null,
      linkHash: null,
      linkFragmentHash: null,
      enclosureHash: null,
      titleHash: null,
      summaryHash: null,
      contentHash: null,
    }

    expect(computeItemHashes(value)).toEqual(expected)
  })

  it('should return empty object when no relevant fields present', () => {
    const value: HashableItem = {}

    expect(computeItemHashes(value)).toEqual(makeHashes())
  })

  it('should use first enclosure URL when no isDefault', () => {
    const value: HashableItem = {
      enclosures: [
        { url: 'https://example.com/first.mp3' },
        { url: 'https://example.com/second.mp3' },
      ],
    }

    const valueFirstOnly: HashableItem = {
      enclosures: [{ url: 'https://example.com/first.mp3' }],
    }

    expect(computeItemHashes(value).enclosureHash).toBe(
      computeItemHashes(valueFirstOnly).enclosureHash,
    )
  })

  it('should prefer isDefault enclosure for enclosureHash', () => {
    const value: HashableItem = {
      enclosures: [
        { url: 'https://example.com/first.mp3' },
        { url: 'https://example.com/default.mp3', isDefault: true },
      ],
    }

    const valueDefaultOnly: HashableItem = {
      enclosures: [{ url: 'https://example.com/default.mp3' }],
    }

    expect(computeItemHashes(value).enclosureHash).toBe(
      computeItemHashes(valueDefaultOnly).enclosureHash,
    )
  })

  it('should produce stable hashes for same input', () => {
    const value: HashableItem = {
      guid: 'guid-1',
      link: 'https://example.com/post',
      title: 'Post Title',
      enclosures: [{ url: 'https://example.com/audio.mp3' }],
    }

    expect(computeItemHashes(value)).toEqual(computeItemHashes(value))
  })

  it('should produce same guidHash for equivalent URL GUIDs', () => {
    const value1: HashableItem = { guid: 'https://example.com/post' }
    const value2: HashableItem = { guid: 'http://www.example.com/post/' }

    expect(computeItemHashes(value1).guidHash).toBe(computeItemHashes(value2).guidHash)
  })

  it('should produce same linkHash for equivalent URLs', () => {
    const value1: HashableItem = { link: 'https://example.com/post' }
    const value2: HashableItem = { link: 'http://www.example.com/post/' }

    expect(computeItemHashes(value1).linkHash).toBe(computeItemHashes(value2).linkHash)
  })

  it('should produce same titleHash for equivalent titles', () => {
    const value1: HashableItem = { title: '  Hello  World  ' }
    const value2: HashableItem = { title: 'hello world' }

    expect(computeItemHashes(value1).titleHash).toBe(computeItemHashes(value2).titleHash)
  })

  it('should produce same summaryHash for equivalent summaries', () => {
    const value1: HashableItem = { summary: '  Hello  World  ' }
    const value2: HashableItem = { summary: 'hello world' }

    expect(computeItemHashes(value1).summaryHash).toBe(computeItemHashes(value2).summaryHash)
  })

  it('should produce different contentHash for different content', () => {
    const value1: HashableItem = { content: '<p>Hello</p>' }
    const value2: HashableItem = { content: '<p>World</p>' }

    expect(computeItemHashes(value1).contentHash).not.toBe(computeItemHashes(value2).contentHash)
  })

  it('should skip contentHash when content is undefined', () => {
    const value: HashableItem = { title: 'Post' }

    expect(computeItemHashes(value).contentHash).toBeNull()
  })

  it('should skip enclosureHash when enclosures array is empty', () => {
    const value: HashableItem = { enclosures: [] }

    expect(computeItemHashes(value).enclosureHash).toBeNull()
  })

  it('should skip enclosureHash when first enclosure has no url', () => {
    const value = { enclosures: [{}] }

    expect(computeItemHashes(value).enclosureHash).toBeNull()
  })

  it('should compute linkFragmentHash when link contains fragment', () => {
    const value: HashableItem = { link: 'https://example.com/post#section' }

    expect(computeItemHashes(value).linkFragmentHash).toMatch(/^[a-f0-9]{32}$/)
  })

  it('should not compute linkFragmentHash when link has no fragment', () => {
    const value: HashableItem = { link: 'https://example.com/post' }

    expect(computeItemHashes(value).linkFragmentHash).toBeNull()
  })

  it('should produce different linkFragmentHash for different fragments', () => {
    const value1: HashableItem = { link: 'https://example.com/post#Earth2' }
    const value2: HashableItem = { link: 'https://example.com/post#LimeVPN' }

    expect(computeItemHashes(value1).linkFragmentHash).not.toBe(
      computeItemHashes(value2).linkFragmentHash,
    )
  })

  it('should produce same linkHash for links differing only by fragment', () => {
    const value1: HashableItem = { link: 'https://example.com/post#Earth2' }
    const value2: HashableItem = { link: 'https://example.com/post#LimeVPN' }

    expect(computeItemHashes(value1).linkHash).toBe(computeItemHashes(value2).linkHash)
  })

  it('should not compute linkFragmentHash when link is undefined', () => {
    const value: HashableItem = { guid: 'abc-123' }

    expect(computeItemHashes(value).linkFragmentHash).toBeNull()
  })

  it('should compute guidFragmentHash when guid is URL with fragment', () => {
    const value: HashableItem = { guid: 'https://example.com/page#item1' }

    expect(computeItemHashes(value).guidFragmentHash).toMatch(/^[a-f0-9]{32}$/)
  })

  it('should not compute guidFragmentHash when guid is URL without fragment', () => {
    const value: HashableItem = { guid: 'https://example.com/page' }

    expect(computeItemHashes(value).guidFragmentHash).toBeNull()
  })

  it('should not compute guidFragmentHash when guid is non-URL', () => {
    const value: HashableItem = { guid: 'abc-123#fragment' }

    expect(computeItemHashes(value).guidFragmentHash).toBeNull()
  })

  it('should produce different guidFragmentHash for different fragments', () => {
    const value1: HashableItem = { guid: 'https://example.com/page#Earth2' }
    const value2: HashableItem = { guid: 'https://example.com/page#LimeVPN' }

    expect(computeItemHashes(value1).guidFragmentHash).not.toBe(
      computeItemHashes(value2).guidFragmentHash,
    )
  })

  it('should produce same guidHash for URL GUIDs differing only by fragment', () => {
    const value1: HashableItem = { guid: 'https://example.com/page#Earth2' }
    const value2: HashableItem = { guid: 'https://example.com/page#LimeVPN' }

    expect(computeItemHashes(value1).guidHash).toBe(computeItemHashes(value2).guidHash)
  })
})
