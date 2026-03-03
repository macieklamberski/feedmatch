import { defaultStrippedParams, type NormalizeOptions, normalizeUrl } from 'feedcanon'

const normalizeOptions: NormalizeOptions = {
  stripProtocol: true,
  stripAuthentication: true,
  stripWww: true,
  stripTrailingSlash: true,
  stripHash: true,
  sortQueryParams: true,
  stripQueryParams: defaultStrippedParams,
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
const safeNormalizeUrl = (value: string): string | undefined => {
  const trimmed = value.trim()

  if (trimmed === '') {
    return
  }

  return normalizeUrl(trimmed, normalizeOptions)
}

// Normalize link for hashing to prevent duplicates from URL variations like
// http vs https, trailing slashes, www prefix, UTM params, etc.
export const normalizeLinkForHashing = (link: string | null | undefined): string | undefined => {
  if (!link) {
    return
  }

  return safeNormalizeUrl(link)
}

// Normalize link preserving fragment for disambiguation. Applies same
// normalization as normalizeLinkForHashing but keeps the fragment intact.
export const normalizeLinkWithFragmentForHashing = (
  link: string | null | undefined,
): string | undefined => {
  if (!link) {
    return
  }

  const trimmed = link.trim()

  if (trimmed === '') {
    return
  }

  return normalizeUrl(trimmed, normalizeWithFragmentOptions)
}

// Normalize link fragment for hashing. Only returns a value when link
// contains '#' — without a fragment, normalization produces the same
// string as linkHash, making a separate hash wasteful.
export const normalizeLinkFragmentForHashing = (
  link: string | null | undefined,
): string | undefined => {
  if (!link?.includes('#')) {
    return
  }

  return normalizeLinkWithFragmentForHashing(link)
}

// Normalize GUID for hashing. 70% of GUIDs are URLs — normalize those
// the same way as links. Non-URL GUIDs are opaque strings, just trimmed.
export const normalizeGuidForHashing = (guid: string | null | undefined): string | undefined => {
  if (!guid) {
    return
  }

  const trimmed = guid.trim()

  if (trimmed === '') {
    return
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return normalizeLinkForHashing(trimmed) || trimmed
  }

  return trimmed
}

// Normalize GUID fragment for hashing. Only returns a value when GUID is
// a URL containing '#'. Non-URL GUIDs don't strip fragments during
// normalization, so the fragment is already part of guidHash.
export const normalizeGuidFragmentForHashing = (
  guid: string | null | undefined,
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

  return normalizeLinkWithFragmentForHashing(guid)
}

// Select preferred enclosure (isDefault first, then first with URL) and normalize
// for hashing. Keeps non-tracking query params (identity can live there).
// TODO: Improve stability by normalizing+sorting all enclosure URLs instead of
// picking one. Current approach changes hash if feed reorders enclosures or
// toggles isDefault between scans, causing false duplicates over time.
export const normalizeEnclosureForHashing = (
  enclosures: Array<{ url?: string; isDefault?: boolean }> | null | undefined,
): string | undefined => {
  if (!enclosures?.length) {
    return
  }

  const defaultEnclosure = enclosures.find((enclosure) => enclosure.isDefault && enclosure.url)
  const firstEnclosure = enclosures.find((enclosure) => enclosure.url)
  const url = defaultEnclosure?.url ?? firstEnclosure?.url

  if (!url) {
    return
  }

  return safeNormalizeUrl(url)
}

// Collapse whitespace and lowercase for text-based hashing (title).
export const normalizeTextForHashing = (text: string | null | undefined): string | undefined => {
  if (!text) {
    return
  }

  const normalized = text.trim().replace(/\s+/g, ' ').toLowerCase()

  if (normalized === '') {
    return
  }

  return normalized
}

// Normalize HTML content for hashing (summary, content).
// TODO: Strip HTML tags → plain text before normalizing. Currently delegates
// to normalizeTextForHashing which only handles whitespace/case. A proper
// implementation would strip tags so that markup-only changes (different
// wrapper elements, whitespace in tags, ad markup) don't affect the hash.
export const normalizeHtmlForHashing = (html: string | null | undefined): string | undefined => {
  return normalizeTextForHashing(html)
}
