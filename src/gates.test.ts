import { describe, expect, it } from 'bun:test'
import { applyCandidateGates, contentChangeGate, enclosureConflictGate } from './gates.js'
import type {
  CandidateGate,
  CandidateGateContext,
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

describe('enclosureConflictGate', () => {
  it('should reject when both sides have different enclosures on guid source', () => {
    const value: CandidateGateContext = {
      identifierSource: 'guid',
      incoming: { hashes: { enclosureHash: 'enc-new' } },
      candidate: makeItem({ enclosureHash: 'enc-old' }),
      channel: { linkUniquenessRate: 1.0 },
    }

    expect(enclosureConflictGate.decide(value)).toEqual({
      allow: false,
      reason: 'Enclosure hash mismatch',
    })
  })

  it('should reject when both sides have different enclosures on link source', () => {
    const value: CandidateGateContext = {
      identifierSource: 'link',
      incoming: { hashes: { enclosureHash: 'enc-new' } },
      candidate: makeItem({ enclosureHash: 'enc-old' }),
      channel: { linkUniquenessRate: 1.0 },
    }

    expect(enclosureConflictGate.decide(value)).toEqual({
      allow: false,
      reason: 'Enclosure hash mismatch',
    })
  })

  it('should allow when enclosures match', () => {
    const value: CandidateGateContext = {
      identifierSource: 'guid',
      incoming: { hashes: { enclosureHash: 'enc-same' } },
      candidate: makeItem({ enclosureHash: 'enc-same' }),
      channel: { linkUniquenessRate: 1.0 },
    }

    expect(enclosureConflictGate.decide(value)).toEqual({ allow: true })
  })

  it('should allow when candidate has no enclosure', () => {
    const value: CandidateGateContext = {
      identifierSource: 'guid',
      incoming: { hashes: { enclosureHash: 'enc-new' } },
      candidate: makeItem({ enclosureHash: null }),
      channel: { linkUniquenessRate: 1.0 },
    }

    expect(enclosureConflictGate.decide(value)).toEqual({ allow: true })
  })

  it('should allow when incoming has no enclosure', () => {
    const value: CandidateGateContext = {
      identifierSource: 'guid',
      incoming: { hashes: {} },
      candidate: makeItem({ enclosureHash: 'enc-existing' }),
      channel: { linkUniquenessRate: 1.0 },
    }

    expect(enclosureConflictGate.decide(value)).toEqual({ allow: true })
  })

  it('should allow when neither side has enclosure', () => {
    const value: CandidateGateContext = {
      identifierSource: 'guid',
      incoming: { hashes: {} },
      candidate: makeItem({ enclosureHash: null }),
      channel: { linkUniquenessRate: 1.0 },
    }

    expect(enclosureConflictGate.decide(value)).toEqual({ allow: true })
  })

  it('should only apply to guid and link sources', () => {
    expect(enclosureConflictGate.appliesTo).toEqual(['guid', 'link'])
  })
})

describe('contentChangeGate', () => {
  it('should emit when title changes', () => {
    const value = {
      existing: makeItem({ titleHash: 'title-1' }),
      incomingHashes: { titleHash: 'title-2' } as ItemHashes,
      identifierSource: 'guid' as MatchSource,
    }

    expect(contentChangeGate.shouldEmit(value)).toBe(true)
  })

  it('should emit when summary changes', () => {
    const value = {
      existing: makeItem({ summaryHash: 'sum-1' }),
      incomingHashes: { summaryHash: 'sum-2' } as ItemHashes,
      identifierSource: 'guid' as MatchSource,
    }

    expect(contentChangeGate.shouldEmit(value)).toBe(true)
  })

  it('should emit when content changes', () => {
    const value = {
      existing: makeItem({ contentHash: 'cnt-1' }),
      incomingHashes: { contentHash: 'cnt-2' } as ItemHashes,
      identifierSource: 'guid' as MatchSource,
    }

    expect(contentChangeGate.shouldEmit(value)).toBe(true)
  })

  it('should emit when enclosure changes', () => {
    const value = {
      existing: makeItem({ enclosureHash: 'enc-1' }),
      incomingHashes: { enclosureHash: 'enc-2' } as ItemHashes,
      identifierSource: 'guid' as MatchSource,
    }

    expect(contentChangeGate.shouldEmit(value)).toBe(true)
  })

  it('should not emit when all content hashes match', () => {
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

    expect(contentChangeGate.shouldEmit(value)).toBe(false)
  })

  it('should not emit when null and undefined are compared', () => {
    const value = {
      existing: makeItem({ titleHash: null, contentHash: null }),
      incomingHashes: {} as ItemHashes,
      identifierSource: 'guid' as MatchSource,
    }

    expect(contentChangeGate.shouldEmit(value)).toBe(false)
  })

  it('should ignore non-content hashes', () => {
    const value = {
      existing: makeItem({ guidHash: 'guid-1', linkHash: 'link-1' }),
      incomingHashes: { guidHash: 'guid-2', linkHash: 'link-2' } as ItemHashes,
      identifierSource: 'guid' as MatchSource,
    }

    expect(contentChangeGate.shouldEmit(value)).toBe(false)
  })
})

describe('applyCandidateGates', () => {
  it('should return all candidates when no gates apply', () => {
    const candidates = [makeItem({ id: 'a' }), makeItem({ id: 'b' })]
    const gate: CandidateGate = {
      name: 'irrelevant',
      appliesTo: ['enclosure'],
      decide: () => {
        return { allow: false, reason: 'blocked' }
      },
    }
    const value = applyCandidateGates({
      candidates,
      identifierSource: 'guid',
      gates: [gate],
      incoming: { hashes: {} },
      channel: { linkUniquenessRate: 1.0 },
    })

    expect(value).toEqual(candidates)
  })

  it('should filter candidates using applicable gate', () => {
    const candidates = [
      makeItem({ id: 'a', enclosureHash: 'enc-1' }),
      makeItem({ id: 'b', enclosureHash: 'enc-2' }),
    ]
    const value = applyCandidateGates({
      candidates,
      identifierSource: 'guid',
      gates: [enclosureConflictGate],
      incoming: { hashes: { enclosureHash: 'enc-1' } },
      channel: { linkUniquenessRate: 1.0 },
    })
    const expected = [candidates[0]]

    expect(value).toEqual(expected)
  })

  it('should apply gate with appliesTo all', () => {
    const gate: CandidateGate = {
      name: 'blockAll',
      appliesTo: 'all',
      decide: () => {
        return { allow: false, reason: 'blocked' }
      },
    }
    const candidates = [makeItem({ id: 'a' })]
    const value = applyCandidateGates({
      candidates,
      identifierSource: 'title',
      gates: [gate],
      incoming: { hashes: {} },
      channel: { linkUniquenessRate: 1.0 },
    })

    expect(value).toEqual([])
  })

  it('should apply gates sequentially', () => {
    const gateA: CandidateGate = {
      name: 'removeB',
      appliesTo: 'all',
      decide: (context) => {
        return context.candidate.id === 'b'
          ? { allow: false, reason: 'removed b' }
          : { allow: true }
      },
    }
    const gateB: CandidateGate = {
      name: 'removeC',
      appliesTo: 'all',
      decide: (context) => {
        return context.candidate.id === 'c'
          ? { allow: false, reason: 'removed c' }
          : { allow: true }
      },
    }
    const candidates = [makeItem({ id: 'a' }), makeItem({ id: 'b' }), makeItem({ id: 'c' })]
    const value = applyCandidateGates({
      candidates,
      identifierSource: 'guid',
      gates: [gateA, gateB],
      incoming: { hashes: {} },
      channel: { linkUniquenessRate: 1.0 },
    })
    const expected = [candidates[0]]

    expect(value).toEqual(expected)
  })

  it('should return empty array when all candidates are removed', () => {
    const gate: CandidateGate = {
      name: 'blockAll',
      appliesTo: 'all',
      decide: () => {
        return { allow: false, reason: 'blocked' }
      },
    }
    const candidates = [makeItem({ id: 'a' }), makeItem({ id: 'b' })]
    const value = applyCandidateGates({
      candidates,
      identifierSource: 'guid',
      gates: [gate],
      incoming: { hashes: {} },
      channel: { linkUniquenessRate: 1.0 },
    })

    expect(value).toEqual([])
  })

  it('should pass correct context to gate decide function', () => {
    const contexts: Array<CandidateGateContext> = []
    const gate: CandidateGate = {
      name: 'spy',
      appliesTo: 'all',
      decide: (context) => {
        contexts.push(context)
        return { allow: true }
      },
    }
    const candidate = makeItem({ id: 'a' })
    const hashes: ItemHashes = { guidHash: 'guid-1' }
    applyCandidateGates({
      candidates: [candidate],
      identifierSource: 'link',
      gates: [gate],
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
