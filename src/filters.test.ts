import { describe, expect, it } from 'bun:test'
import { applyCandidateFilters, contentChangeFilter, enclosureConflictFilter } from './filters.js'
import type {
  CandidateFilter,
  CandidateFilterContext,
  ItemHashes,
  MatchableItem,
  MatchSource,
} from './types.js'

const makeItem = (overrides: Partial<MatchableItem> = {}): MatchableItem => {
  return {
    id: 'item-1',
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

describe('enclosureConflictFilter', () => {
  it('should reject when both sides have different enclosures on guid source', () => {
    const value: CandidateFilterContext = {
      identifierSource: 'guid',
      incoming: { hashes: { enclosureHash: 'enc-new' } },
      candidate: makeItem({ enclosureHash: 'enc-old' }),
      channel: { linkUniquenessRate: 1.0 },
    }

    expect(enclosureConflictFilter.evaluate(value)).toEqual({
      allow: false,
      reason: 'Enclosure hash mismatch',
    })
  })

  it('should reject when both sides have different enclosures on link source', () => {
    const value: CandidateFilterContext = {
      identifierSource: 'link',
      incoming: { hashes: { enclosureHash: 'enc-new' } },
      candidate: makeItem({ enclosureHash: 'enc-old' }),
      channel: { linkUniquenessRate: 1.0 },
    }

    expect(enclosureConflictFilter.evaluate(value)).toEqual({
      allow: false,
      reason: 'Enclosure hash mismatch',
    })
  })

  it('should allow when enclosures match', () => {
    const value: CandidateFilterContext = {
      identifierSource: 'guid',
      incoming: { hashes: { enclosureHash: 'enc-same' } },
      candidate: makeItem({ enclosureHash: 'enc-same' }),
      channel: { linkUniquenessRate: 1.0 },
    }

    expect(enclosureConflictFilter.evaluate(value)).toEqual({ allow: true })
  })

  it('should allow when candidate has no enclosure', () => {
    const value: CandidateFilterContext = {
      identifierSource: 'guid',
      incoming: { hashes: { enclosureHash: 'enc-new' } },
      candidate: makeItem({ enclosureHash: null }),
      channel: { linkUniquenessRate: 1.0 },
    }

    expect(enclosureConflictFilter.evaluate(value)).toEqual({ allow: true })
  })

  it('should allow when incoming has no enclosure', () => {
    const value: CandidateFilterContext = {
      identifierSource: 'guid',
      incoming: { hashes: {} },
      candidate: makeItem({ enclosureHash: 'enc-existing' }),
      channel: { linkUniquenessRate: 1.0 },
    }

    expect(enclosureConflictFilter.evaluate(value)).toEqual({ allow: true })
  })

  it('should allow when neither side has enclosure', () => {
    const value: CandidateFilterContext = {
      identifierSource: 'guid',
      incoming: { hashes: {} },
      candidate: makeItem({ enclosureHash: null }),
      channel: { linkUniquenessRate: 1.0 },
    }

    expect(enclosureConflictFilter.evaluate(value)).toEqual({ allow: true })
  })

  it('should only apply to guid and link sources', () => {
    expect(enclosureConflictFilter.appliesTo).toEqual(['guid', 'link'])
  })
})

describe('contentChangeFilter', () => {
  it('should update when title changes', () => {
    const value = {
      existing: makeItem({ titleHash: 'title-1' }),
      incomingHashes: { titleHash: 'title-2' } as ItemHashes,
      identifierSource: 'guid' as MatchSource,
    }

    expect(contentChangeFilter.shouldUpdate(value)).toBe(true)
  })

  it('should update when summary changes', () => {
    const value = {
      existing: makeItem({ summaryHash: 'sum-1' }),
      incomingHashes: { summaryHash: 'sum-2' } as ItemHashes,
      identifierSource: 'guid' as MatchSource,
    }

    expect(contentChangeFilter.shouldUpdate(value)).toBe(true)
  })

  it('should update when content changes', () => {
    const value = {
      existing: makeItem({ contentHash: 'cnt-1' }),
      incomingHashes: { contentHash: 'cnt-2' } as ItemHashes,
      identifierSource: 'guid' as MatchSource,
    }

    expect(contentChangeFilter.shouldUpdate(value)).toBe(true)
  })

  it('should update when enclosure changes', () => {
    const value = {
      existing: makeItem({ enclosureHash: 'enc-1' }),
      incomingHashes: { enclosureHash: 'enc-2' } as ItemHashes,
      identifierSource: 'guid' as MatchSource,
    }

    expect(contentChangeFilter.shouldUpdate(value)).toBe(true)
  })

  it('should not update when all content hashes match', () => {
    const value = {
      existing: makeItem({
        titleHash: 'title-1',
        summaryHash: 'sum-1',
        contentHash: 'cnt-1',
        enclosureHash: 'enc-1',
      }),
      incomingHashes: {
        titleHash: 'title-1',
        summaryHash: 'sum-1',
        contentHash: 'cnt-1',
        enclosureHash: 'enc-1',
      } as ItemHashes,
      identifierSource: 'guid' as MatchSource,
    }

    expect(contentChangeFilter.shouldUpdate(value)).toBe(false)
  })

  it('should not update when null and undefined are compared', () => {
    const value = {
      existing: makeItem({ titleHash: null, contentHash: null }),
      incomingHashes: {} as ItemHashes,
      identifierSource: 'guid' as MatchSource,
    }

    expect(contentChangeFilter.shouldUpdate(value)).toBe(false)
  })

  it('should ignore non-content hashes', () => {
    const value = {
      existing: makeItem({ guidHash: 'guid-1', linkHash: 'link-1' }),
      incomingHashes: { guidHash: 'guid-2', linkHash: 'link-2' } as ItemHashes,
      identifierSource: 'guid' as MatchSource,
    }

    expect(contentChangeFilter.shouldUpdate(value)).toBe(false)
  })
})

describe('applyCandidateFilters', () => {
  it('should return all candidates when no filters apply', () => {
    const candidates = [makeItem({ id: 'a' }), makeItem({ id: 'b' })]
    const filter: CandidateFilter = {
      name: 'irrelevant',
      appliesTo: ['enclosure'],
      evaluate: () => {
        return { allow: false, reason: 'blocked' }
      },
    }
    const value = applyCandidateFilters({
      candidates,
      identifierSource: 'guid',
      filters: [filter],
      incoming: { hashes: {} },
      channel: { linkUniquenessRate: 1.0 },
    })

    expect(value).toEqual(candidates)
  })

  it('should filter candidates using applicable filter', () => {
    const candidates = [
      makeItem({ id: 'a', enclosureHash: 'enc-1' }),
      makeItem({ id: 'b', enclosureHash: 'enc-2' }),
    ]
    const value = applyCandidateFilters({
      candidates,
      identifierSource: 'guid',
      filters: [enclosureConflictFilter],
      incoming: { hashes: { enclosureHash: 'enc-1' } },
      channel: { linkUniquenessRate: 1.0 },
    })
    const expected = [candidates[0]]

    expect(value).toEqual(expected)
  })

  it('should apply filter with appliesTo all', () => {
    const filter: CandidateFilter = {
      name: 'blockAll',
      appliesTo: 'all',
      evaluate: () => {
        return { allow: false, reason: 'blocked' }
      },
    }
    const candidates = [makeItem({ id: 'a' })]
    const value = applyCandidateFilters({
      candidates,
      identifierSource: 'title',
      filters: [filter],
      incoming: { hashes: {} },
      channel: { linkUniquenessRate: 1.0 },
    })

    expect(value).toEqual([])
  })

  it('should apply filters sequentially', () => {
    const filterA: CandidateFilter = {
      name: 'removeB',
      appliesTo: 'all',
      evaluate: (context) => {
        return context.candidate.id === 'b'
          ? { allow: false, reason: 'removed b' }
          : { allow: true }
      },
    }
    const filterB: CandidateFilter = {
      name: 'removeC',
      appliesTo: 'all',
      evaluate: (context) => {
        return context.candidate.id === 'c'
          ? { allow: false, reason: 'removed c' }
          : { allow: true }
      },
    }
    const candidates = [makeItem({ id: 'a' }), makeItem({ id: 'b' }), makeItem({ id: 'c' })]
    const value = applyCandidateFilters({
      candidates,
      identifierSource: 'guid',
      filters: [filterA, filterB],
      incoming: { hashes: {} },
      channel: { linkUniquenessRate: 1.0 },
    })
    const expected = [candidates[0]]

    expect(value).toEqual(expected)
  })

  it('should return empty array when all candidates are removed', () => {
    const filter: CandidateFilter = {
      name: 'blockAll',
      appliesTo: 'all',
      evaluate: () => {
        return { allow: false, reason: 'blocked' }
      },
    }
    const candidates = [makeItem({ id: 'a' }), makeItem({ id: 'b' })]
    const value = applyCandidateFilters({
      candidates,
      identifierSource: 'guid',
      filters: [filter],
      incoming: { hashes: {} },
      channel: { linkUniquenessRate: 1.0 },
    })

    expect(value).toEqual([])
  })

  it('should pass correct context to filter evaluate function', () => {
    const contexts: Array<CandidateFilterContext> = []
    const filter: CandidateFilter = {
      name: 'spy',
      appliesTo: 'all',
      evaluate: (context) => {
        contexts.push(context)
        return { allow: true }
      },
    }
    const candidate = makeItem({ id: 'a' })
    const hashes: ItemHashes = { guidHash: 'guid-1' }
    applyCandidateFilters({
      candidates: [candidate],
      identifierSource: 'link',
      filters: [filter],
      incoming: { hashes },
      channel: { linkUniquenessRate: 0.5 },
    })

    expect(contexts).toHaveLength(1)
    expect(contexts[0].identifierSource).toBe('link')
    expect(contexts[0].incoming.hashes).toBe(hashes)
    expect(contexts[0].candidate).toBe(candidate)
    expect(contexts[0].channel.linkUniquenessRate).toBe(0.5)
  })
})
