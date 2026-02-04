import { describe, expect, it } from 'bun:test'
import { hasStrongHash } from './meta.js'
import type { ItemHashes } from './types.js'

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
