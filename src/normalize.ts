import { type NormalizeOptions, normalizeUrl } from 'feedcanon'
import { endsWithAnyOf, type Nullish, startsWithAnyOf } from 'trousse'
import type { CleanUrlFn, Enclosure } from './types.js'

const normalizeOptions: NormalizeOptions = {
  stripProtocol: true,
  stripAuthentication: true,
  stripWww: true,
  stripTrailingSlash: true,
  stripHash: true,
  sortQueryParams: true,
  stripEmptyQuery: true,
  normalizeEncoding: true,
  normalizeUnicode: true,
}

// Same as normalizeOptions but keeps fragments. Used for fragment hashes
// where the fragment is the sole differentiator between items
// (e.g. haveibeenpwned.com/PwnedWebsites#Earth2 vs #LimeVPN).
const normalizeWithFragmentOptions: NormalizeOptions = {
  ...normalizeOptions,
  stripHash: false,
}

// Trim + normalize URL. Feeds often contain whitespace-only strings that
// feedcanon returns as-is (garbage). Guard against that with a trim check.
const safeNormalizeUrl = (value: string, cleanUrlFn?: CleanUrlFn): string | undefined => {
  const trimmed = value.trim()

  if (trimmed === '') {
    return
  }

  return normalizeUrl(cleanUrlFn ? cleanUrlFn(trimmed) : trimmed, normalizeOptions)
}

// Normalize link for hashing to prevent duplicates from URL variations like
// http vs https, trailing slashes, www prefix, UTM params, etc.
export const normalizeLinkForHashing = (
  link: Nullish<string>,
  cleanUrlFn?: CleanUrlFn,
): string | undefined => {
  if (!link) {
    return
  }

  return safeNormalizeUrl(link, cleanUrlFn)
}

// Normalize link preserving fragment for disambiguation. Applies same
// normalization as normalizeLinkForHashing but keeps the fragment intact.
export const normalizeLinkWithFragmentForHashing = (
  link: Nullish<string>,
  cleanUrlFn?: CleanUrlFn,
): string | undefined => {
  if (!link) {
    return
  }

  const trimmed = link.trim()

  if (trimmed === '') {
    return
  }

  return normalizeUrl(cleanUrlFn ? cleanUrlFn(trimmed) : trimmed, normalizeWithFragmentOptions)
}

// Normalize link fragment for hashing. Only returns a value when link
// contains '#' — without a fragment, normalization produces the same
// string as linkHash, making a separate hash wasteful.
export const normalizeLinkFragmentForHashing = (
  link: Nullish<string>,
  cleanUrlFn?: CleanUrlFn,
): string | undefined => {
  if (!link?.includes('#')) {
    return
  }

  return normalizeLinkWithFragmentForHashing(link, cleanUrlFn)
}

// Normalize GUID for hashing. 70% of GUIDs are URLs — normalize those
// the same way as links. Non-URL GUIDs are opaque strings, just trimmed.
export const normalizeGuidForHashing = (
  guid: Nullish<string>,
  cleanUrlFn?: CleanUrlFn,
): string | undefined => {
  if (!guid) {
    return
  }

  const trimmed = guid.trim()

  if (trimmed === '') {
    return
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return normalizeLinkForHashing(trimmed, cleanUrlFn) || trimmed
  }

  return trimmed
}

// Normalize GUID fragment for hashing. Only returns a value when GUID is
// a URL containing '#'. Non-URL GUIDs don't strip fragments during
// normalization, so the fragment is already part of guidHash.
export const normalizeGuidFragmentForHashing = (
  guid: Nullish<string>,
  cleanUrlFn?: CleanUrlFn,
): string | undefined => {
  if (!guid) {
    return
  }

  const trimmed = guid.trim()

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return
  }

  if (!trimmed.includes('#')) {
    return
  }

  return normalizeLinkWithFragmentForHashing(guid, cleanUrlFn)
}

// MIME type prefixes that mark an enclosure as real audio/video media.
const mediaTypePrefixes = ['audio/', 'video/']

// MIME type prefixes that mark it as a decorative image.
const imageTypePrefixes = ['image/']

// Splits a URL at the start of its query string or fragment.
const urlPathEndRegex = /[?#]/

// File extensions that mark an enclosure URL as an image. A declared audio or
// video type is distrusted when the URL clearly points at an image file.
const imageExtensions = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.avif',
  '.svg',
  '.bmp',
  '.ico',
  '.tif',
  '.tiff',
]

// File extensions that mark an enclosure URL as audio or video media.
const mediaExtensions = [
  '.mp3',
  '.m4a',
  '.m4b',
  '.aac',
  '.ogg',
  '.oga',
  '.opus',
  '.flac',
  '.wav',
  '.mp4',
  '.m4v',
  '.mov',
  '.webm',
  '.mkv',
  '.avi',
]

// Whether a single enclosure is real audio/video media. A recognized MIME type
// decides (audio/* or video/* is media, image/* is not); a missing or
// unrecognized type (podcast CDNs commonly serve audio as
// application/octet-stream) falls through to the URL file extension; no type
// and no recognized extension means not media.
const isMedia = (enclosure: Enclosure): boolean => {
  if (!enclosure.url) {
    return false
  }

  const path = enclosure.url.split(urlPathEndRegex)[0]
  const type = enclosure.type?.trim()

  if (type) {
    if (startsWithAnyOf(type, mediaTypePrefixes)) {
      // An audio/video type on a URL that clearly points at an image file is
      // contradictory; do not count the enclosure as media on a bad signal.
      return !endsWithAnyOf(path, imageExtensions)
    }

    if (startsWithAnyOf(type, imageTypePrefixes)) {
      return false
    }
  }

  return endsWithAnyOf(path, mediaExtensions)
}

// Select the preferred enclosure: the first with isDefault and a URL, else the
// first audio/video one, else the first with a URL. Preferring media keeps an
// image listed before the real audio/video (common in media:content groups)
// from becoming the enclosure hash and classification target of the item.
export const selectEnclosure = (enclosures: Nullish<Array<Enclosure>>): Enclosure | undefined => {
  if (!enclosures?.length) {
    return
  }

  const defaultEnclosure = enclosures.find((enclosure) => enclosure.isDefault && enclosure.url)

  return (
    defaultEnclosure ??
    enclosures.find((enclosure) => isMedia(enclosure)) ??
    enclosures.find((enclosure) => enclosure.url)
  )
}

// How we treat enclosures:
// - Default: the enclosure is changeable content, not identity. A swapped
//   image is an update, not a new item.
// - It counts as identity only when it is clearly real media (audio or
//   video). For those (podcasts), the file is the item.
export const isMediaEnclosure = (enclosures: Nullish<Array<Enclosure>>): boolean => {
  const enclosure = selectEnclosure(enclosures)

  return enclosure != null && isMedia(enclosure)
}

// Select preferred enclosure (isDefault first, then first with URL) and normalize
// for hashing. Keeps non-tracking query params (identity can live there).
// TODO: Improve stability by normalizing+sorting all enclosure URLs instead of
// picking one. Current approach changes hash if feed reorders enclosures or
// toggles isDefault between scans, causing false duplicates over time.
export const normalizeEnclosureForHashing = (
  enclosures: Nullish<Array<Enclosure>>,
  cleanUrlFn?: CleanUrlFn,
): string | undefined => {
  const url = selectEnclosure(enclosures)?.url

  if (!url) {
    return
  }

  return safeNormalizeUrl(url, cleanUrlFn)
}

// Trim and collapse whitespace runs into single spaces, keeping letter case.
export const normalizeWhitespace = (text: Nullish<string>): string | undefined => {
  if (!text) {
    return
  }

  const normalized = text.trim().replace(/\s+/g, ' ')

  if (normalized === '') {
    return
  }

  return normalized
}

// Collapse whitespace and lowercase for text-based hashing (title). Lowercasing
// keeps title matching tolerant to casing drift in feeds without guids/links.
export const normalizeTextForHashing = (text: Nullish<string>): string | undefined => {
  return normalizeWhitespace(text)?.toLowerCase()
}

// Normalize HTML content for hashing (summary, content). Keeps letter case and
// tags: these hashes drive change detection, and a publisher's fix can be a
// case-only edit inside an attribute (a wrongly-cased image URL that 404s on a
// case-sensitive server). Lowercasing made such fixes hash-identical, so the
// corrected content was never written to the existing item.
export const normalizeHtmlForHashing = (html: Nullish<string>): string | undefined => {
  return normalizeWhitespace(html)
}
