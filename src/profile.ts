import { signalHashKeys } from './constants.js'
import { isDefined } from './hashes.js'
import type { ExistingItem, IncomingItem } from './types.js'

export type SignalStats = {
  present: number
  total: number
  presenceRate: number
  distinct: number
  uniquenessRate: number
}

export type SignalProfile = {
  existing: SignalStats
  incoming: SignalStats
  effective: {
    presenceRate: number
    uniquenessRate: number
  }
}

export type FeedProfile = {
  guid: SignalProfile
  link: SignalProfile
  enclosure: SignalProfile
  title: SignalProfile
}

// Compute stats for a single signal from a set of hash values.
export const computeSignalStats = (values: Array<string | null>): SignalStats => {
  const present = values.filter(isDefined)
  const distinct = new Set(present).size

  return {
    present: present.length,
    total: values.length,
    presenceRate: values.length > 0 ? present.length / values.length : 0,
    distinct,
    uniquenessRate: present.length > 0 ? distinct / present.length : 0,
  }
}

// Compute feed profile from existing + incoming items. Per-signal stats
// are kept separate; effective rates use conservative combining: when one
// side has no present values, fall back to the other; otherwise min.
export const computeFeedProfile = (
  existingItems: Array<ExistingItem>,
  incomingItems: Array<IncomingItem>,
): FeedProfile => {
  const profile = {} as FeedProfile

  for (const [signal, hashKey] of signalHashKeys) {
    const existing = computeSignalStats(existingItems.map((item) => item[hashKey]))
    const incoming = computeSignalStats(incomingItems.map((item) => item[hashKey]))

    // When one side has no present values, use the other side's rates.
    // Otherwise take the minimum (conservative).
    const effective =
      existing.present === 0
        ? { presenceRate: incoming.presenceRate, uniquenessRate: incoming.uniquenessRate }
        : incoming.present === 0
          ? { presenceRate: existing.presenceRate, uniquenessRate: existing.uniquenessRate }
          : {
              presenceRate: Math.min(existing.presenceRate, incoming.presenceRate),
              uniquenessRate: Math.min(existing.uniquenessRate, incoming.uniquenessRate),
            }

    profile[signal] = { existing, incoming, effective }
  }

  return profile
}
