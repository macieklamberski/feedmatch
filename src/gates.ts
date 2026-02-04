import { hashMeta } from './meta.js'
import type {
  CandidateGate,
  CandidateGateContext,
  ItemHashes,
  MatchableItem,
  MatchSource,
  UpdateGate,
} from './types.js'

// Rejects candidates where both sides have an enclosureHash and they differ.
// Prevents merging items that share a URL but have different enclosures
// (e.g. podcast episodes on a show page with regenerated GUIDs).
export const enclosureConflictGate: CandidateGate = {
  name: 'enclosureConflict',
  appliesTo: ['guid', 'link'],
  decide: (context) => {
    const candidateEnclosure = context.candidate.enclosureHash
    const incomingEnclosure = context.incoming.hashes.enclosureHash

    if (candidateEnclosure && incomingEnclosure && candidateEnclosure !== incomingEnclosure) {
      return { allow: false, reason: 'Enclosure hash mismatch' }
    }

    return { allow: true }
  },
}

// Emits an update only when content hashes differ between existing and incoming.
// Compares all isContent hashes (title, summary, content, enclosure).
export const contentChangeGate: UpdateGate = {
  name: 'contentChange',
  shouldEmit: (context) => {
    return (
      hashMeta
        .filter((meta) => meta.isContent)
        /* biome-ignore lint/suspicious/noDoubleEquals: Intentional — null == undefined. */
        .some((meta) => context.existing[meta.key] != context.incomingHashes[meta.key])
    )
  },
}

// TODO: Consider splitting into prematch/classify gate arrays if a future
// gate needs to apply only during classification (not pre-match).
export const candidateGates: Array<CandidateGate> = [enclosureConflictGate]
export const updateGates: Array<UpdateGate> = [contentChangeGate]

// Apply all applicable candidate gates to a candidate list for a given source.
// Gates are applied sequentially — each gate filters the output of the previous.
export const applyCandidateGates = ({
  candidates,
  source,
  gates,
  incoming,
  channel,
}: {
  candidates: Array<MatchableItem>
  source: MatchSource
  gates: Array<CandidateGate>
  incoming: { hashes: ItemHashes }
  channel: { linkUniquenessRate: number }
}): Array<MatchableItem> => {
  let result = candidates

  for (const gate of gates) {
    if (gate.appliesTo !== 'all' && !gate.appliesTo.includes(source)) {
      continue
    }

    result = result.filter((candidate) => {
      const context: CandidateGateContext = { source, incoming, candidate, channel }
      return gate.decide(context).allow
    })
  }

  return result
}
