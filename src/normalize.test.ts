import { describe, expect, it } from 'bun:test'
import {
  isMediaEnclosure,
  normalizeEnclosureForHashing,
  normalizeGuidForHashing,
  normalizeGuidFragmentForHashing,
  normalizeHtmlForHashing,
  normalizeLinkForHashing,
  normalizeLinkFragmentForHashing,
  normalizeLinkWithFragmentForHashing,
  normalizeTextForHashing,
  normalizeWhitespace,
  selectEnclosure,
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

  it('should return non-URL garbage unchanged', () => {
    expect(normalizeLinkForHashing('not a url')).toBe('not a url')
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

  it('should return undefined for whitespace-only string', () => {
    expect(normalizeLinkFragmentForHashing('   ')).toBeUndefined()
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

  it('should treat uppercase-scheme guid as opaque string', () => {
    expect(normalizeGuidForHashing('HTTPS://example.com/post')).toBe('HTTPS://example.com/post')
  })

  it('should treat protocol-relative guid as opaque string', () => {
    expect(normalizeGuidForHashing('//example.com/post')).toBe('//example.com/post')
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

  it('should return undefined for whitespace-only string', () => {
    expect(normalizeHtmlForHashing('   ')).toBeUndefined()
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

describe('selectEnclosure', () => {
  it('should select the first enclosure with a url', () => {
    const value = [{ url: 'https://example.com/a.mp3' }, { url: 'https://example.com/b.mp3' }]

    expect(selectEnclosure(value)).toEqual({ url: 'https://example.com/a.mp3' })
  })

  it('should prefer the isDefault enclosure over an earlier one', () => {
    const value = [
      { url: 'https://example.com/first.mp3' },
      { url: 'https://example.com/default.mp3', isDefault: true },
    ]

    expect(selectEnclosure(value)).toEqual({
      url: 'https://example.com/default.mp3',
      isDefault: true,
    })
  })

  it('should skip an isDefault enclosure without a url', () => {
    const value = [{ isDefault: true }, { url: 'https://example.com/a.mp3' }]

    expect(selectEnclosure(value)).toEqual({ url: 'https://example.com/a.mp3' })
  })

  it('should skip url-less entries when picking the first', () => {
    const value = [{}, { url: 'https://example.com/a.mp3' }]

    expect(selectEnclosure(value)).toEqual({ url: 'https://example.com/a.mp3' })
  })

  it('should return undefined when no enclosure has a url', () => {
    expect(selectEnclosure([{ type: 'audio/mpeg' }, { isDefault: true }])).toBeUndefined()
  })

  it('should return undefined for empty input', () => {
    expect(selectEnclosure([])).toBeUndefined()
    expect(selectEnclosure(null)).toBeUndefined()
    expect(selectEnclosure(undefined)).toBeUndefined()
  })
})

describe('isMediaEnclosure', () => {
  it('should treat audio types as media', () => {
    expect(isMediaEnclosure([{ url: 'https://example.com/e', type: 'audio/mpeg' }])).toBe(true)
    expect(isMediaEnclosure([{ url: 'https://example.com/e', type: 'audio/mp4' }])).toBe(true)
    expect(isMediaEnclosure([{ url: 'https://example.com/e', type: 'audio/aac' }])).toBe(true)
    expect(isMediaEnclosure([{ url: 'https://example.com/e', type: 'audio/ogg' }])).toBe(true)
  })

  it('should treat video types as media', () => {
    expect(isMediaEnclosure([{ url: 'https://example.com/e', type: 'video/mp4' }])).toBe(true)
    expect(isMediaEnclosure([{ url: 'https://example.com/e', type: 'video/webm' }])).toBe(true)
  })

  it('should not treat image types as media', () => {
    expect(isMediaEnclosure([{ url: 'https://example.com/e', type: 'image/jpeg' }])).toBe(false)
    expect(isMediaEnclosure([{ url: 'https://example.com/e', type: 'image/png' }])).toBe(false)
    expect(isMediaEnclosure([{ url: 'https://example.com/e', type: 'image/webp' }])).toBe(false)
  })

  it('should treat an octet-stream enclosure with an audio extension as media', () => {
    const value = [{ url: 'https://example.com/ep.mp3', type: 'application/octet-stream' }]

    expect(isMediaEnclosure(value)).toBe(true)
  })

  it('should not treat an octet-stream enclosure without an extension as media', () => {
    const value = [{ url: 'https://example.com/download/12345', type: 'application/octet-stream' }]

    expect(isMediaEnclosure(value)).toBe(false)
  })

  it('should fall through to the extension when the type is an empty string', () => {
    expect(isMediaEnclosure([{ url: 'https://example.com/ep.mp3', type: '' }])).toBe(true)
  })

  it('should treat a type with parameters as media', () => {
    const value = [{ url: 'https://example.com/e', type: 'audio/mpeg; charset=binary' }]

    expect(isMediaEnclosure(value)).toBe(true)
  })

  it('should let an image type overrule an audio extension', () => {
    expect(isMediaEnclosure([{ url: 'https://example.com/e.mp3', type: 'image/jpeg' }])).toBe(false)
  })

  it('should not treat an audio type with an image extension as media', () => {
    expect(isMediaEnclosure([{ url: 'https://example.com/e.jpg', type: 'audio/mpeg' }])).toBe(false)
  })

  it('should trust an audio type when the URL has no recognized extension', () => {
    expect(isMediaEnclosure([{ url: 'https://example.com/episode', type: 'audio/mpeg' }])).toBe(
      true,
    )
  })

  it('should treat typeless audio and video extensions as media', () => {
    expect(isMediaEnclosure([{ url: 'https://example.com/ep.mp3' }])).toBe(true)
    expect(isMediaEnclosure([{ url: 'https://example.com/ep.m4a' }])).toBe(true)
    expect(isMediaEnclosure([{ url: 'https://example.com/ep.ogg' }])).toBe(true)
    expect(isMediaEnclosure([{ url: 'https://example.com/clip.mp4' }])).toBe(true)
    expect(isMediaEnclosure([{ url: 'https://example.com/clip.webm' }])).toBe(true)
  })

  it('should not treat typeless image extensions as media', () => {
    expect(isMediaEnclosure([{ url: 'https://example.com/thumb.jpg' }])).toBe(false)
    expect(isMediaEnclosure([{ url: 'https://example.com/thumb.png' }])).toBe(false)
    expect(isMediaEnclosure([{ url: 'https://example.com/thumb.webp' }])).toBe(false)
  })

  it('should not treat a url without any dot as media', () => {
    expect(isMediaEnclosure([{ url: 'https://localhost/stream' }])).toBe(false)
  })

  it('should not treat typeless extensionless urls as media', () => {
    expect(isMediaEnclosure([{ url: 'https://images.example.com/photo-1607823477653' }])).toBe(
      false,
    )
    expect(isMediaEnclosure([{ url: 'https://example.com/v/-1wPGYqygC8?version=3' }])).toBe(false)
    expect(isMediaEnclosure([{ url: 'https://example.com/i?r=BCH26J05HeR4mzFJ' }])).toBe(false)
    expect(isMediaEnclosure([{ url: 'https://example.com/avatar/e31c59f8b6bf988' }])).toBe(false)
  })

  it('should read the extension from the path before the query string', () => {
    expect(isMediaEnclosure([{ url: 'https://example.com/ep.mp3?token=abc' }])).toBe(true)
    expect(isMediaEnclosure([{ url: 'https://example.com/media?file=ep.mp3' }])).toBe(false)
  })

  it('should match types and extensions case-insensitively', () => {
    expect(isMediaEnclosure([{ url: 'https://example.com/e', type: 'AUDIO/MPEG' }])).toBe(true)
    expect(isMediaEnclosure([{ url: 'https://example.com/EP.MP3' }])).toBe(true)
  })

  it('should classify by the selected enclosure and ignore types on url-less entries', () => {
    const value = [{ type: 'audio/mpeg' }, { url: 'https://example.com/thumb.jpg' }]

    expect(isMediaEnclosure(value)).toBe(false)
  })

  it('should follow the isDefault selection when classifying', () => {
    const defaultAudio = [
      { url: 'https://example.com/thumb.jpg' },
      { url: 'https://example.com/ep.mp3', isDefault: true },
    ]
    const defaultImage = [
      { url: 'https://example.com/ep.mp3' },
      { url: 'https://example.com/thumb.jpg', isDefault: true },
    ]

    expect(isMediaEnclosure(defaultAudio)).toBe(true)
    expect(isMediaEnclosure(defaultImage)).toBe(false)
  })

  it('should return false for empty or absent enclosures', () => {
    expect(isMediaEnclosure([])).toBe(false)
    expect(isMediaEnclosure(null)).toBe(false)
    expect(isMediaEnclosure(undefined)).toBe(false)
  })
})
