import { describe, expect, it } from 'bun:test'
import {
  buildFingerprint,
  computeItemHashes,
  hasStrongHash,
  resolveFingerprintLevel,
} from './hashes.js'
import type { ItemHashes, NewItem } from './types.js'

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

describe('buildFingerprint', () => {
  it('should include only guid slot at level=guid', () => {
    const value = makeHashes({ guidHash: 'g1', linkHash: 'l1', titleHash: 't1' })
    const expected = 'g:g1'

    expect(buildFingerprint(value, 'guid')).toBe(expected)
  })

  it('should include guid and guidFragment at level=guidFragment', () => {
    const value = makeHashes({ guidHash: 'g1', guidFragmentHash: 'gf1', linkHash: 'l1' })
    const expected = 'g:g1|gf:gf1'

    expect(buildFingerprint(value, 'guidFragment')).toBe(expected)
  })

  it('should include up to link at level=link', () => {
    const value = makeHashes({ guidHash: 'g1', linkHash: 'l1', titleHash: 't1' })
    const expected = 'g:g1|gf:|l:l1'

    expect(buildFingerprint(value, 'link')).toBe(expected)
  })

  it('should include up to linkFragment at level=linkFragment', () => {
    const value = makeHashes({ guidHash: 'g1', linkHash: 'l1', linkFragmentHash: 'lf1' })
    const expected = 'g:g1|gf:|l:l1|lf:lf1'

    expect(buildFingerprint(value, 'linkFragment')).toBe(expected)
  })

  it('should include up to enclosure at level=enclosure', () => {
    const value = makeHashes({ guidHash: 'g1', linkHash: 'l1', enclosureHash: 'e1' })
    const expected = 'g:g1|gf:|l:l1|lf:|e:e1'

    expect(buildFingerprint(value, 'enclosure')).toBe(expected)
  })

  it('should include all six slots at level=title', () => {
    const value = makeHashes({
      guidHash: 'g1',
      guidFragmentHash: 'gf1',
      linkHash: 'l1',
      linkFragmentHash: 'lf1',
      enclosureHash: 'e1',
      titleHash: 't1',
    })
    const expected = 'g:g1|gf:gf1|l:l1|lf:lf1|e:e1|t:t1'

    expect(buildFingerprint(value, 'title')).toBe(expected)
  })

  it('should produce empty slots for missing hashes', () => {
    const value = makeHashes({ guidHash: 'g1' })
    const expected = 'g:g1|gf:|l:|lf:|e:|t:'

    expect(buildFingerprint(value, 'title')).toBe(expected)
  })

  it('should produce different fingerprints for items with same link but different titles at level=title', () => {
    const value1 = makeHashes({ linkHash: 'l1', titleHash: 't1' })
    const value2 = makeHashes({ linkHash: 'l1', titleHash: 't2' })

    expect(buildFingerprint(value1, 'title')).not.toBe(buildFingerprint(value2, 'title'))
  })

  it('should produce same fingerprints for items with same link but different titles at level=link', () => {
    const value1 = makeHashes({ linkHash: 'l1', titleHash: 't1' })
    const value2 = makeHashes({ linkHash: 'l1', titleHash: 't2' })

    expect(buildFingerprint(value1, 'link')).toBe(buildFingerprint(value2, 'link'))
  })

  it('should ignore fragments at level=link', () => {
    const value1 = makeHashes({ linkHash: 'l1', linkFragmentHash: 'lf1' })
    const value2 = makeHashes({ linkHash: 'l1', linkFragmentHash: 'lf2' })

    expect(buildFingerprint(value1, 'link')).toBe(buildFingerprint(value2, 'link'))
  })

  it('should include fragments at level=linkFragment', () => {
    const value1 = makeHashes({ linkHash: 'l1', linkFragmentHash: 'lf1' })
    const value2 = makeHashes({ linkHash: 'l1', linkFragmentHash: 'lf2' })

    expect(buildFingerprint(value1, 'linkFragment')).not.toBe(
      buildFingerprint(value2, 'linkFragment'),
    )
  })

  it('should return undefined when no hashes exist in prefix', () => {
    const value = makeHashes()

    expect(buildFingerprint(value, 'title')).toBeUndefined()
  })

  it('should return undefined when only hashes below the min level exist', () => {
    const value = makeHashes({ titleHash: 't1' })

    expect(buildFingerprint(value, 'link')).toBeUndefined()
  })
})

describe('resolveFingerprintLevel', () => {
  it('should pick strongest collision-free level for new channel', () => {
    const values = [
      makeHashes({ guidHash: 'g1', linkHash: 'l1', titleHash: 't1' }),
      makeHashes({ guidHash: 'g2', linkHash: 'l2', titleHash: 't2' }),
    ]

    expect(resolveFingerprintLevel(values)).toBe('guid')
  })

  it('should return current min level unchanged when no collisions', () => {
    const values = [
      makeHashes({ guidHash: 'g1', linkHash: 'l1' }),
      makeHashes({ guidHash: 'g2', linkHash: 'l2' }),
    ]

    expect(resolveFingerprintLevel(values, 'link')).toBe('link')
  })

  it('should downgrade when current min level has collisions', () => {
    // Same link → link collides → should move to a weaker level.
    const values = [
      makeHashes({ linkHash: 'l1', titleHash: 't1' }),
      makeHashes({ linkHash: 'l1', titleHash: 't2' }),
    ]

    expect(resolveFingerprintLevel(values, 'link')).toBe('title')
  })

  it('should return guid when no collisions at any level', () => {
    const values = [
      makeHashes({ guidHash: 'g1', linkHash: 'l1', enclosureHash: 'e1', titleHash: 't1' }),
      makeHashes({ guidHash: 'g2', linkHash: 'l2', enclosureHash: 'e2', titleHash: 't2' }),
    ]

    expect(resolveFingerprintLevel(values)).toBe('guid')
  })

  it('should return title when collisions exist at all levels', () => {
    // All levels collide — identical hashes everywhere.
    const values = [
      makeHashes({ guidHash: 'g1', linkHash: 'l1', enclosureHash: 'e1', titleHash: 't1' }),
      makeHashes({ guidHash: 'g1', linkHash: 'l1', enclosureHash: 'e1', titleHash: 't1' }),
    ]

    expect(resolveFingerprintLevel(values)).toBe('title')
  })

  it('should skip to enclosure when guid and link collide', () => {
    const values = [
      makeHashes({ guidHash: 'g1', linkHash: 'l1', enclosureHash: 'e1', titleHash: 't1' }),
      makeHashes({ guidHash: 'g1', linkHash: 'l1', enclosureHash: 'e2', titleHash: 't2' }),
    ]

    expect(resolveFingerprintLevel(values)).toBe('enclosure')
  })

  it('should handle single-item batch as guid', () => {
    const values = [makeHashes({ guidHash: 'g1', linkHash: 'l1' })]

    expect(resolveFingerprintLevel(values)).toBe('guid')
  })

  it('should handle empty batch as title', () => {
    expect(resolveFingerprintLevel([])).toBe('title')
  })

  it('should preserve current min level on empty batch', () => {
    expect(resolveFingerprintLevel([], 'guid')).toBe('guid')
  })

  it('should skip levels that identify no items', () => {
    // Link-only items — guid produces no fingerprints, should skip to link.
    const values = [
      makeHashes({ linkHash: 'l1', titleHash: 't1' }),
      makeHashes({ linkHash: 'l2', titleHash: 't2' }),
    ]

    expect(resolveFingerprintLevel(values)).toBe('link')
  })

  it('should never upgrade above current min level', () => {
    // No collisions at guid, but current min level is title — should stay at title.
    const values = [
      makeHashes({ guidHash: 'g1', linkHash: 'l1', titleHash: 't1' }),
      makeHashes({ guidHash: 'g2', linkHash: 'l2', titleHash: 't2' }),
    ]

    expect(resolveFingerprintLevel(values, 'title')).toBe('title')
  })
})

describe('computeItemHashes', () => {
  it('should compute all hashes when all fields present', () => {
    const value: NewItem = {
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
    const value: NewItem = { guid: 'abc-123' }
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
    const value: NewItem = {}

    expect(computeItemHashes(value)).toEqual(makeHashes())
  })

  it('should use first enclosure URL when no isDefault', () => {
    const value: NewItem = {
      enclosures: [
        { url: 'https://example.com/first.mp3' },
        { url: 'https://example.com/second.mp3' },
      ],
    }

    const valueFirstOnly: NewItem = {
      enclosures: [{ url: 'https://example.com/first.mp3' }],
    }

    expect(computeItemHashes(value).enclosureHash).toBe(
      computeItemHashes(valueFirstOnly).enclosureHash,
    )
  })

  it('should prefer isDefault enclosure for enclosureHash', () => {
    const value: NewItem = {
      enclosures: [
        { url: 'https://example.com/first.mp3' },
        { url: 'https://example.com/default.mp3', isDefault: true },
      ],
    }

    const valueDefaultOnly: NewItem = {
      enclosures: [{ url: 'https://example.com/default.mp3' }],
    }

    expect(computeItemHashes(value).enclosureHash).toBe(
      computeItemHashes(valueDefaultOnly).enclosureHash,
    )
  })

  it('should produce stable hashes for same input', () => {
    const value: NewItem = {
      guid: 'guid-1',
      link: 'https://example.com/post',
      title: 'Post Title',
      enclosures: [{ url: 'https://example.com/audio.mp3' }],
    }

    expect(computeItemHashes(value)).toEqual(computeItemHashes(value))
  })

  it('should produce same guidHash for equivalent URL GUIDs', () => {
    const value1: NewItem = { guid: 'https://example.com/post' }
    const value2: NewItem = { guid: 'http://www.example.com/post/' }

    expect(computeItemHashes(value1).guidHash).toBe(computeItemHashes(value2).guidHash)
  })

  it('should produce same linkHash for equivalent URLs', () => {
    const value1: NewItem = { link: 'https://example.com/post' }
    const value2: NewItem = { link: 'http://www.example.com/post/' }

    expect(computeItemHashes(value1).linkHash).toBe(computeItemHashes(value2).linkHash)
  })

  it('should produce same titleHash for equivalent titles', () => {
    const value1: NewItem = { title: '  Hello  World  ' }
    const value2: NewItem = { title: 'hello world' }

    expect(computeItemHashes(value1).titleHash).toBe(computeItemHashes(value2).titleHash)
  })

  it('should produce same summaryHash for equivalent summaries', () => {
    const value1: NewItem = { summary: '  Hello  World  ' }
    const value2: NewItem = { summary: 'hello world' }

    expect(computeItemHashes(value1).summaryHash).toBe(computeItemHashes(value2).summaryHash)
  })

  it('should produce different contentHash for different content', () => {
    const value1: NewItem = { content: '<p>Hello</p>' }
    const value2: NewItem = { content: '<p>World</p>' }

    expect(computeItemHashes(value1).contentHash).not.toBe(computeItemHashes(value2).contentHash)
  })

  it('should skip contentHash when content is undefined', () => {
    const value: NewItem = { title: 'Post' }

    expect(computeItemHashes(value).contentHash).toBeNull()
  })

  it('should skip enclosureHash when enclosures array is empty', () => {
    const value: NewItem = { enclosures: [] }

    expect(computeItemHashes(value).enclosureHash).toBeNull()
  })

  it('should skip enclosureHash when first enclosure has no url', () => {
    const value = { enclosures: [{}] }

    expect(computeItemHashes(value).enclosureHash).toBeNull()
  })

  it('should treat null fields same as undefined', () => {
    const value: NewItem = {
      guid: null,
      link: null,
      title: null,
      summary: null,
      content: null,
      enclosures: null,
    }

    expect(computeItemHashes(value)).toEqual(makeHashes())
  })

  it('should compute linkFragmentHash when link contains fragment', () => {
    const value: NewItem = { link: 'https://example.com/post#section' }

    expect(computeItemHashes(value).linkFragmentHash).toMatch(/^[a-f0-9]{32}$/)
  })

  it('should not compute linkFragmentHash when link has no fragment', () => {
    const value: NewItem = { link: 'https://example.com/post' }

    expect(computeItemHashes(value).linkFragmentHash).toBeNull()
  })

  it('should produce different linkFragmentHash for different fragments', () => {
    const value1: NewItem = { link: 'https://example.com/post#Earth2' }
    const value2: NewItem = { link: 'https://example.com/post#LimeVPN' }

    expect(computeItemHashes(value1).linkFragmentHash).not.toBe(
      computeItemHashes(value2).linkFragmentHash,
    )
  })

  it('should produce same linkHash for links differing only by fragment', () => {
    const value1: NewItem = { link: 'https://example.com/post#Earth2' }
    const value2: NewItem = { link: 'https://example.com/post#LimeVPN' }

    expect(computeItemHashes(value1).linkHash).toBe(computeItemHashes(value2).linkHash)
  })

  it('should not compute linkFragmentHash when link is undefined', () => {
    const value: NewItem = { guid: 'abc-123' }

    expect(computeItemHashes(value).linkFragmentHash).toBeNull()
  })

  it('should compute guidFragmentHash when guid is URL with fragment', () => {
    const value: NewItem = { guid: 'https://example.com/page#item1' }

    expect(computeItemHashes(value).guidFragmentHash).toMatch(/^[a-f0-9]{32}$/)
  })

  it('should not compute guidFragmentHash when guid is URL without fragment', () => {
    const value: NewItem = { guid: 'https://example.com/page' }

    expect(computeItemHashes(value).guidFragmentHash).toBeNull()
  })

  it('should not compute guidFragmentHash when guid is non-URL', () => {
    const value: NewItem = { guid: 'abc-123#fragment' }

    expect(computeItemHashes(value).guidFragmentHash).toBeNull()
  })

  it('should produce different guidFragmentHash for different fragments', () => {
    const value1: NewItem = { guid: 'https://example.com/page#Earth2' }
    const value2: NewItem = { guid: 'https://example.com/page#LimeVPN' }

    expect(computeItemHashes(value1).guidFragmentHash).not.toBe(
      computeItemHashes(value2).guidFragmentHash,
    )
  })

  it('should produce same guidHash for URL GUIDs differing only by fragment', () => {
    const value1: NewItem = { guid: 'https://example.com/page#Earth2' }
    const value2: NewItem = { guid: 'https://example.com/page#LimeVPN' }

    expect(computeItemHashes(value1).guidHash).toBe(computeItemHashes(value2).guidHash)
  })
})

describe('hasStrongHash', () => {
  it('should return true when guidHash is present', () => {
    expect(hasStrongHash(makeHashes({ guidHash: 'abc' }))).toBe(true)
  })

  it('should return true when linkHash is present', () => {
    expect(hasStrongHash(makeHashes({ linkHash: 'abc' }))).toBe(true)
  })

  it('should return true when enclosureHash is present', () => {
    expect(hasStrongHash(makeHashes({ enclosureHash: 'abc' }))).toBe(true)
  })

  it('should return true when multiple strong hashes are present', () => {
    expect(hasStrongHash(makeHashes({ guidHash: 'abc', linkHash: 'def' }))).toBe(true)
  })

  it('should return false when only titleHash is present', () => {
    expect(hasStrongHash(makeHashes({ titleHash: 'abc' }))).toBe(false)
  })

  it('should return false when only contentHash is present', () => {
    expect(hasStrongHash(makeHashes({ contentHash: 'abc' }))).toBe(false)
  })

  it('should return false when only summaryHash is present', () => {
    expect(hasStrongHash(makeHashes({ summaryHash: 'abc' }))).toBe(false)
  })

  it('should return false when only fragment hashes are present', () => {
    expect(hasStrongHash(makeHashes({ guidFragmentHash: 'abc', linkFragmentHash: 'def' }))).toBe(
      false,
    )
  })

  it('should return false for empty hashes', () => {
    expect(hasStrongHash(makeHashes())).toBe(false)
  })
})
