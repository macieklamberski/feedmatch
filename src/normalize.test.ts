import { describe, expect, it } from 'bun:test'
import {
  normalizeEnclosureForHashing,
  normalizeGuidForHashing,
  normalizeGuidFragmentForHashing,
  normalizeHtmlForHashing,
  normalizeLinkForHashing,
  normalizeLinkFragmentForHashing,
  normalizeLinkWithFragmentForHashing,
  normalizeTextForHashing,
  normalizeWhitespace,
} from './normalize.js'

// Stand-in for an injected cleaner (e.g. urlpurify): removes utm_ params.
const stripUtm = (url: string): string => {
  const parsed = new URL(url)

  for (const key of [...parsed.searchParams.keys()]) {
    if (key.startsWith('utm_')) {
      parsed.searchParams.delete(key)
    }
  }

  return parsed.toString()
}

describe('normalizeLinkForHashing', () => {
  it('should strip protocol from link', () => {
    expect(normalizeLinkForHashing('https://example.com/post')).toBe('example.com/post')
    expect(normalizeLinkForHashing('http://example.com/post')).toBe('example.com/post')
  })

  it('should strip www prefix', () => {
    expect(normalizeLinkForHashing('https://www.example.com/post')).toBe('example.com/post')
  })

  it('should strip trailing slash', () => {
    expect(normalizeLinkForHashing('https://example.com/post/')).toBe('example.com/post')
  })

  it('should strip hash fragment', () => {
    expect(normalizeLinkForHashing('https://example.com/post#section')).toBe('example.com/post')
  })

  it('should strip utm params with a cleanUrlFn', () => {
    const value = 'https://example.com/post?utm_source=rss'
    const expected = 'example.com/post'

    expect(normalizeLinkForHashing(value, stripUtm)).toBe(expected)
  })

  it('should keep tracking params without a cleanUrlFn', () => {
    const value = 'https://example.com/post?utm_source=rss'
    const expected = 'example.com/post?utm_source=rss'

    expect(normalizeLinkForHashing(value)).toBe(expected)
  })

  it('should sort query params', () => {
    expect(normalizeLinkForHashing('https://example.com/post?z=1&a=2')).toBe(
      'example.com/post?a=2&z=1',
    )
  })

  it('should produce same result for equivalent URLs', () => {
    const values = [
      'https://example.com/post',
      'http://example.com/post',
      'https://www.example.com/post',
      'https://example.com/post/',
      'https://example.com/post#comments',
      'https://example.com/post?utm_source=rss',
    ]

    const results = values.map((value) => normalizeLinkForHashing(value, stripUtm))
    expect(new Set(results).size).toBe(1)
    expect(results[0]).toBe('example.com/post')
  })

  it('should trim whitespace before normalizing', () => {
    expect(normalizeLinkForHashing('  https://example.com/post  ')).toBe('example.com/post')
  })

  it('should return undefined for empty string', () => {
    expect(normalizeLinkForHashing('')).toBeUndefined()
  })

  it('should return undefined for whitespace-only string', () => {
    expect(normalizeLinkForHashing('   ')).toBeUndefined()
  })

  it('should return undefined for undefined input', () => {
    expect(normalizeLinkForHashing(undefined)).toBeUndefined()
  })

  it('should return undefined for null input', () => {
    expect(normalizeLinkForHashing(null)).toBeUndefined()
  })
})

describe('normalizeLinkWithFragmentForHashing', () => {
  it('should preserve fragment in link', () => {
    expect(normalizeLinkWithFragmentForHashing('https://example.com/post#section')).toBe(
      'example.com/post#section',
    )
  })

  it('should strip protocol and www', () => {
    expect(normalizeLinkWithFragmentForHashing('https://www.example.com/post#section')).toBe(
      'example.com/post#section',
    )
  })

  it('should strip utm params but keep fragment', () => {
    const value = 'https://example.com/post?utm_source=rss#section'
    const expected = 'example.com/post#section'

    expect(normalizeLinkWithFragmentForHashing(value, stripUtm)).toBe(expected)
  })

  it('should strip trailing slash', () => {
    expect(normalizeLinkWithFragmentForHashing('https://example.com/post/#section')).toBe(
      'example.com/post#section',
    )
  })

  it('should produce different results for different fragments', () => {
    const value1 = normalizeLinkWithFragmentForHashing('https://example.com/post#Earth2')
    const value2 = normalizeLinkWithFragmentForHashing('https://example.com/post#LimeVPN')

    expect(value1).not.toBe(value2)
  })

  it('should trim whitespace before normalizing', () => {
    expect(normalizeLinkWithFragmentForHashing('  https://example.com/post#section  ')).toBe(
      'example.com/post#section',
    )
  })

  it('should return undefined for empty string', () => {
    expect(normalizeLinkWithFragmentForHashing('')).toBeUndefined()
  })

  it('should return undefined for whitespace-only string', () => {
    expect(normalizeLinkWithFragmentForHashing('   ')).toBeUndefined()
  })

  it('should return undefined for undefined input', () => {
    expect(normalizeLinkWithFragmentForHashing(undefined)).toBeUndefined()
  })

  it('should return undefined for null input', () => {
    expect(normalizeLinkWithFragmentForHashing(null)).toBeUndefined()
  })
})

describe('normalizeLinkFragmentForHashing', () => {
  it('should normalize link preserving fragment when link contains hash', () => {
    expect(normalizeLinkFragmentForHashing('https://example.com/post#section')).toBe(
      'example.com/post#section',
    )
  })

  it('should produce different results for different fragments', () => {
    const value1 = normalizeLinkFragmentForHashing('https://example.com/post#Earth2')
    const value2 = normalizeLinkFragmentForHashing('https://example.com/post#LimeVPN')

    expect(value1).not.toBe(value2)
  })

  it('should return undefined when link has no fragment', () => {
    expect(normalizeLinkFragmentForHashing('https://example.com/post')).toBeUndefined()
  })

  it('should return undefined for undefined input', () => {
    expect(normalizeLinkFragmentForHashing(undefined)).toBeUndefined()
  })

  it('should return undefined for empty string', () => {
    expect(normalizeLinkFragmentForHashing('')).toBeUndefined()
  })

  it('should return undefined for null input', () => {
    expect(normalizeLinkFragmentForHashing(null)).toBeUndefined()
  })
})

describe('normalizeGuidForHashing', () => {
  it('should normalize URL-shaped GUIDs like links', () => {
    expect(normalizeGuidForHashing('https://example.com/post')).toBe('example.com/post')
    expect(normalizeGuidForHashing('http://www.example.com/post/')).toBe('example.com/post')
  })

  it('should return trimmed string for non-URL GUIDs', () => {
    expect(normalizeGuidForHashing('abc-123')).toBe('abc-123')
    expect(normalizeGuidForHashing('  abc-123  ')).toBe('abc-123')
  })

  it('should handle URL GUIDs with tracking params', () => {
    const value = 'https://example.com/post?utm_source=feed'
    const expected = 'example.com/post'

    expect(normalizeGuidForHashing(value, stripUtm)).toBe(expected)
  })

  it('should fall back to trimmed value when URL normalization fails', () => {
    expect(normalizeGuidForHashing('https://')).toBe('https://')
  })

  it('should return undefined for undefined input', () => {
    expect(normalizeGuidForHashing(undefined)).toBeUndefined()
  })

  it('should return undefined for empty string', () => {
    expect(normalizeGuidForHashing('')).toBeUndefined()
  })

  it('should return undefined for whitespace-only string', () => {
    expect(normalizeGuidForHashing('   ')).toBeUndefined()
  })

  it('should return undefined for null input', () => {
    expect(normalizeGuidForHashing(null)).toBeUndefined()
  })
})

describe('normalizeGuidFragmentForHashing', () => {
  it('should normalize URL guid preserving fragment when guid is URL with hash', () => {
    expect(normalizeGuidFragmentForHashing('https://example.com/page#item1')).toBe(
      'example.com/page#item1',
    )
  })

  it('should produce different results for different fragments', () => {
    const value1 = normalizeGuidFragmentForHashing('https://example.com/page#Earth2')
    const value2 = normalizeGuidFragmentForHashing('https://example.com/page#LimeVPN')

    expect(value1).not.toBe(value2)
  })

  it('should return undefined when guid is URL without fragment', () => {
    expect(normalizeGuidFragmentForHashing('https://example.com/page')).toBeUndefined()
  })

  it('should return undefined when guid is non-URL even with hash', () => {
    expect(normalizeGuidFragmentForHashing('abc-123#fragment')).toBeUndefined()
  })

  it('should return undefined for undefined input', () => {
    expect(normalizeGuidFragmentForHashing(undefined)).toBeUndefined()
  })

  it('should return undefined for empty string', () => {
    expect(normalizeGuidFragmentForHashing('')).toBeUndefined()
  })

  it('should return undefined for whitespace-only string', () => {
    expect(normalizeGuidFragmentForHashing('   ')).toBeUndefined()
  })

  it('should return undefined for null input', () => {
    expect(normalizeGuidFragmentForHashing(null)).toBeUndefined()
  })
})

describe('normalizeEnclosureForHashing', () => {
  it('should strip protocol and www', () => {
    const value = [{ url: 'https://www.example.com/audio.mp3' }]

    expect(normalizeEnclosureForHashing(value)).toBe('example.com/audio.mp3')
  })

  it('should strip trailing slash', () => {
    const value = [{ url: 'https://example.com/audio/' }]

    expect(normalizeEnclosureForHashing(value)).toBe('example.com/audio')
  })

  it('should strip hash fragment', () => {
    const value = [{ url: 'https://example.com/audio.mp3#t=10' }]

    expect(normalizeEnclosureForHashing(value)).toBe('example.com/audio.mp3')
  })

  it('should strip utm params but keep identity params', () => {
    const value = [{ url: 'https://example.com/dl?id=123&utm_source=rss' }]
    const expected = 'example.com/dl?id=123'

    expect(normalizeEnclosureForHashing(value, stripUtm)).toBe(expected)
  })

  it('should sort query params', () => {
    const value = [{ url: 'https://example.com/dl?z=1&a=2' }]

    expect(normalizeEnclosureForHashing(value)).toBe('example.com/dl?a=2&z=1')
  })

  it('should prefer enclosure with isDefault', () => {
    const value = [
      { url: 'https://example.com/first.mp3' },
      { url: 'https://example.com/default.mp3', isDefault: true },
      { url: 'https://example.com/third.mp3' },
    ]

    expect(normalizeEnclosureForHashing(value)).toBe('example.com/default.mp3')
  })

  it('should use first enclosure when none has isDefault', () => {
    const value = [
      { url: 'https://example.com/first.mp3' },
      { url: 'https://example.com/second.mp3' },
    ]

    expect(normalizeEnclosureForHashing(value)).toBe('example.com/first.mp3')
  })

  it('should skip first enclosure without URL', () => {
    const value = [{ type: 'audio/mp3' }, { url: 'https://example.com/second.mp3' }]

    expect(normalizeEnclosureForHashing(value)).toBe('example.com/second.mp3')
  })

  it('should skip isDefault enclosure without URL', () => {
    const value = [
      { url: 'https://example.com/first.mp3' },
      { isDefault: true },
      { url: 'https://example.com/third.mp3' },
    ]

    expect(normalizeEnclosureForHashing(value)).toBe('example.com/first.mp3')
  })

  it('should use first isDefault when multiple exist', () => {
    const value = [
      { url: 'https://example.com/first.mp3', isDefault: true },
      { url: 'https://example.com/second.mp3', isDefault: true },
    ]

    expect(normalizeEnclosureForHashing(value)).toBe('example.com/first.mp3')
  })

  it('should return undefined for undefined input', () => {
    expect(normalizeEnclosureForHashing(undefined)).toBeUndefined()
  })

  it('should return undefined for empty array', () => {
    expect(normalizeEnclosureForHashing([])).toBeUndefined()
  })

  it('should return undefined when no enclosure has URL', () => {
    const value = [{ type: 'audio/mp3' }, { isDefault: true }]

    expect(normalizeEnclosureForHashing(value)).toBeUndefined()
  })

  it('should trim whitespace from URL before normalizing', () => {
    const value = [{ url: '  https://example.com/audio.mp3  ' }]

    expect(normalizeEnclosureForHashing(value)).toBe('example.com/audio.mp3')
  })

  it('should return undefined for whitespace-only URL', () => {
    const value = [{ url: '   ' }]

    expect(normalizeEnclosureForHashing(value)).toBeUndefined()
  })

  it('should return undefined for null input', () => {
    expect(normalizeEnclosureForHashing(null)).toBeUndefined()
  })
})

describe('normalizeTextForHashing', () => {
  it('should trim and lowercase', () => {
    expect(normalizeTextForHashing('  Hello World  ')).toBe('hello world')
  })

  it('should collapse whitespace', () => {
    expect(normalizeTextForHashing('Hello   World')).toBe('hello world')
  })

  it('should collapse tabs and newlines', () => {
    expect(normalizeTextForHashing('Hello\t\nWorld')).toBe('hello world')
  })

  it('should return undefined for undefined input', () => {
    expect(normalizeTextForHashing(undefined)).toBeUndefined()
  })

  it('should return undefined for empty string', () => {
    expect(normalizeTextForHashing('')).toBeUndefined()
  })

  it('should return undefined for whitespace-only string', () => {
    expect(normalizeTextForHashing('   ')).toBeUndefined()
  })

  it('should return undefined for null input', () => {
    expect(normalizeTextForHashing(null)).toBeUndefined()
  })
})

describe('normalizeHtmlForHashing', () => {
  it('should trim and collapse whitespace', () => {
    expect(normalizeHtmlForHashing('  Hello   World  ')).toBe('Hello World')
  })

  it('should keep letter case', () => {
    expect(normalizeHtmlForHashing('<p><img src="https://example.com/My-Image.png"></p>')).toBe(
      '<p><img src="https://example.com/My-Image.png"></p>',
    )
  })

  it('should produce different values for case-only differences', () => {
    const lowercase = normalizeHtmlForHashing('<img src="https://example.com/image.png">')
    const capitalized = normalizeHtmlForHashing('<img src="https://example.com/Image.png">')

    expect(lowercase).not.toBe(capitalized)
  })

  it('should produce equal values for whitespace-only differences', () => {
    const spaced = normalizeHtmlForHashing('<p>Hello   World</p>')
    const collapsed = normalizeHtmlForHashing('<p>Hello World</p>')

    expect(spaced).toBe(collapsed)
  })

  it('should return undefined for undefined input', () => {
    expect(normalizeHtmlForHashing(undefined)).toBeUndefined()
  })

  it('should return undefined for empty string', () => {
    expect(normalizeHtmlForHashing('')).toBeUndefined()
  })

  it('should return undefined for null input', () => {
    expect(normalizeHtmlForHashing(null)).toBeUndefined()
  })
})

describe('normalizeWhitespace', () => {
  it('should trim and collapse whitespace while keeping case', () => {
    expect(normalizeWhitespace('  Hello   World  ')).toBe('Hello World')
  })

  it('should collapse tabs and newlines', () => {
    expect(normalizeWhitespace('Hello\t\nWorld')).toBe('Hello World')
  })

  it('should return undefined for undefined input', () => {
    expect(normalizeWhitespace(undefined)).toBeUndefined()
  })

  it('should return undefined for empty string', () => {
    expect(normalizeWhitespace('')).toBeUndefined()
  })

  it('should return undefined for whitespace-only string', () => {
    expect(normalizeWhitespace('   ')).toBeUndefined()
  })

  it('should return undefined for null input', () => {
    expect(normalizeWhitespace(null)).toBeUndefined()
  })
})
