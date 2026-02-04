import { signalHashKeys } from './constants.js'
import { isDefined } from './hashes.js'
import type { ExistingItem, ItemHashes } from './types.js'

export type SignalStats = {
  present: number
  total: number
  presenceRate: number
  distinct: number
  uniquenessRate: number
}

export type FeedProfile = {
  guid: SignalStats
  link: SignalStats
  enclosure: SignalStats
  title: SignalStats
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

// Combine two SignalStats conservatively. When one side has no present values,
// fall back to the other side. Otherwise take the minimum of both rates.
const combineSignalStats = (historical: SignalStats, batch: SignalStats): SignalStats => {
  if (historical.present === 0) {
    return batch
  }

  if (batch.present === 0) {
    return historical
  }

  const present = historical.present + batch.present
  const total = historical.total + batch.total
  const distinct = historical.distinct + batch.distinct

  return {
    present,
    total,
    presenceRate: Math.min(historical.presenceRate, batch.presenceRate),
    distinct,
    uniquenessRate: Math.min(historical.uniquenessRate, batch.uniquenessRate),
  }
}

// Compute feed profile from existing + incoming hashes. Per-signal stats
// use conservative combining: when one side has no present values, fall
// back to the other side; otherwise take the minimum of both rates.
export const computeFeedProfile = (
  existingItems: Array<ExistingItem>,
  incomingHashes: Array<ItemHashes>,
): FeedProfile => {
  const profile = {} as FeedProfile

  for (const [signal, hashKey] of signalHashKeys) {
    const historical = computeSignalStats(existingItems.map((item) => item[hashKey]))
    const batch = computeSignalStats(incomingHashes.map((hashes) => hashes[hashKey]))
    profile[signal] = combineSignalStats(historical, batch)
  }

  return profile
}
