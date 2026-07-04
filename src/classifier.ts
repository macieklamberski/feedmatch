import { hashMeta, minReconciliationFields } from './constants.js'
import {
  buildFingerprint,
  computeItemHashes,
  generateHash,
  resolveFingerprintLevel,
} from './hashes.js'
import {
  agreesOnUniqueIdentifier,
  buildMatchIndex,
  classifyCandidateFilters,
  computeFeedProfile,
  computeMatchPolicy,
  prematchCandidateFilters,
  selectMatchingItem,
  updateFilters,
} from './matching.js'
import { isMediaEnclosure } from './normalize.js'
import type {
  ClassifyItemsInput,
  ClassifyItemsResult,
  CleanUrlFn,
  Enclosure,
  ExistingItem,
  FingerprintedItem,
  FingerprintLevel,
  IncomingItem,
  InsertAction,
  ItemHashes,
  ItemIdLike,
  MatchResult,
  NewItem,
  UpdateAction,
} from './types.js'

const contentHashKeys = hashMeta.filter((meta) => meta.isContent).map((meta) => meta.key)

// Find an existing item where guid or link differs but all content fields
// match (title, content, summary, enclosure, and publishedAt).
//
// Two cases:
// 1. GUID changed, link matches (non-null) → merge, update the guid.
// 2. Both GUIDs null, link differs → merge, update the link.
export const findReconciliationCandidate = (
  incoming: IncomingItem,
  existing: ExistingItem,
): MatchResult | undefined => {
  let matchingFields = 0
  let hasBodyHash = false

  for (const key of contentHashKeys) {
    if (incoming[key] !== existing[key]) {
      return
    }

    if (incoming[key] != null) {
      matchingFields++

      if (key === 'contentHash' || key === 'summaryHash') {
        hasBodyHash = true
      }
    }
  }

  if (matchingFields < minReconciliationFields) {
    return
  }

  const incomingDate = incoming.publishedAt?.getTime()
  const existingDate = existing.publishedAt?.getTime()

  if (incomingDate !== existingDate) {
    return
  }

  const isGuidMatch = incoming.guidHash === existing.guidHash
  const isLinkMatch = incoming.linkHash === existing.linkHash

  // Case 1: GUID differs, link is the same.
  if (!isGuidMatch && isLinkMatch && incoming.linkHash != null) {
    return { match: existing, matchedBy: 'link' }
  }

  // Case 2: No GUID on either side, link differs but all content fields
  // and publishedAt are the same. Requires at least one body hash
  // (contentHash or summaryHash) to prevent false merges on weak evidence.
  if (incoming.guidHash == null && existing.guidHash == null && !isLinkMatch && hasBodyHash) {
    return { match: existing, matchedBy: 'reconciled' }
  }

  // Domain migration. Both GUID and link changed but guid == link on each
  // side (common blog pattern where the post URL serves as both). All
  // content fields and publishedAt already verified above.
  if (
    !isGuidMatch &&
    !isLinkMatch &&
    hasBodyHash &&
    incoming.guidHash === incoming.linkHash &&
    existing.guidHash === existing.linkHash
  ) {
    return { match: existing, matchedBy: 'reconciled' }
  }
}

// Check if any changed identity field (guid or link) already belongs to a
// different existing item. For example, the guid points to item A but the
// link points to item B, so it's unclear which item this really is.
export const hasAmbiguousIdentity = (
  incoming: IncomingItem,
  candidate: ExistingItem,
  existingItems: Array<ExistingItem>,
): boolean => {
  const identityKeys: Array<keyof ItemHashes> = ['guidHash', 'linkHash']

  for (const key of identityKeys) {
    const value = incoming[key]

    if (value == null || value === candidate[key]) {
      continue
    }

    const isConflicting = existingItems.some((other) => {
      return other.id !== candidate.id && other[key] === value
    })

    if (isConflicting) {
      return true
    }
  }

  return false
}

// Reclassify inserts that are identical to an existing item except for guid
// or link. Handles feeds with unstable identifiers that the fingerprint
// system cannot match. Treats ambiguous matches (multiple candidates for one
// insert, or multiple inserts targeting the same existing item) as non-matches.
export const reconcileInserts = <T extends NewItem>(
  inserts: Array<InsertAction<T>>,
  existingItems: Array<ExistingItem>,
  claimedExistingIds: Set<ItemIdLike>,
): { reconciledInserts: Array<InsertAction<T>>; reconciledUpdates: Array<UpdateAction<T>> } => {
  // Phase 1: collect all eligible candidates for each insert.
  const candidatesByInsert = new Map<
    number,
    Array<{ existing: ExistingItem; result: MatchResult }>
  >()

  for (let i = 0; i < inserts.length; i++) {
    const candidates: Array<{ existing: ExistingItem; result: MatchResult }> = []

    for (const existing of existingItems) {
      if (claimedExistingIds.has(existing.id)) {
        continue
      }

      const result = findReconciliationCandidate(inserts[i].item, existing)

      if (!result) {
        continue
      }

      if (hasAmbiguousIdentity(inserts[i].item, existing, existingItems)) {
        continue
      }

      candidates.push({ existing, result })
    }

    candidatesByInsert.set(i, candidates)
  }

  // Phase 2: resolve — only reconcile when both insert and target are
  // uniquely determined (exactly 1 candidate, no competing inserts).
  const insertsByTarget = new Map<ItemIdLike, Array<number>>()

  for (const [insertIndex, candidates] of candidatesByInsert) {
    if (candidates.length === 1) {
      const targetId = candidates[0].existing.id
      const list = insertsByTarget.get(targetId) ?? []
      list.push(insertIndex)
      insertsByTarget.set(targetId, list)
    }
  }

  const reconciledInserts: Array<InsertAction<T>> = []
  const reconciledUpdates: Array<UpdateAction<T>> = []

  for (let i = 0; i < inserts.length; i++) {
    const candidates = candidatesByInsert.get(i) ?? []

    if (candidates.length !== 1) {
      reconciledInserts.push(inserts[i])
      continue
    }

    const { result } = candidates[0]
    const competingInserts = insertsByTarget.get(result.match.id) ?? []

    if (competingInserts.length > 1) {
      reconciledInserts.push(inserts[i])
      continue
    }

    reconciledUpdates.push({
      item: inserts[i].item,
      fingerprintHash: inserts[i].fingerprintHash,
      existingItemId: result.match.id,
      matchedBy: result.matchedBy,
    })
  }

  return { reconciledInserts, reconciledUpdates }
}

// How we treat enclosures:
// - Default: the enclosure is changeable content, not identity. A swapped
//   image is an update, not a new item. This is what fixes the duplicates.
// - It stays part of identity only when it is clearly real media (audio or
//   video; see isMediaEnclosure), or when guid, link, and title are all
//   absent and the enclosure is the only thing identifying the item.
//
// Exclusion returns a copy with enclosureHash nulled so identity fingerprints
// and matching ignore the enclosure. The original item keeps the real hash
// for change detection, payloads, and reconciliation. Items whose raw
// enclosures are unavailable are kept as-is (the caller has not opted in).
export const excludeEnclosureFromIdentity = <
  T extends ItemHashes & { enclosures?: Array<Enclosure> | null },
>(
  item: T,
): T => {
  if (item.enclosureHash == null || item.enclosures == null) {
    return item
  }

  if (isMediaEnclosure(item.enclosures)) {
    return item
  }

  if (item.guidHash == null && item.linkHash == null && item.titleHash == null) {
    return item
  }

  return { ...item, enclosureHash: null }
}

// When the candidate has raw enclosures, its enclosure exclusion is decided from
// their type, like for incoming items. When it has none (older stored rows),
// reuse the decision made for the incoming item, so both sides of the comparison
// agree.
export const excludeCandidateEnclosure = (
  candidate: ExistingItem,
  isIncomingExcluded: boolean,
): ExistingItem => {
  if (candidate.enclosures != null) {
    return excludeEnclosureFromIdentity(candidate)
  }

  if (!isIncomingExcluded || candidate.enclosureHash == null) {
    return candidate
  }

  if (candidate.guidHash == null && candidate.linkHash == null && candidate.titleHash == null) {
    return candidate
  }

  return { ...candidate, enclosureHash: null }
}

// Score an item by how many hash slots are populated, weighted by signal strength.
export const scoreItem = (hashes: ItemHashes): number => {
  let score = 0

  for (const { key, weight } of hashMeta) {
    if (hashes[key]) {
      score += weight
    }
  }

  return score
}

export const composeIncomingItems = <T extends NewItem>(
  items: Array<T>,
  cleanUrlFn?: CleanUrlFn,
): Array<IncomingItem<T>> => {
  return items.map((item) => ({ ...item, ...computeItemHashes(item, cleanUrlFn) }))
}

// Build fingerprints for all hashed items at a given level. The fingerprint is
// computed from the identity view (enclosure excluded), but the stored item
// keeps its real hashes so payloads and change detection stay untouched.
// Items that produce no fingerprint (no hashes in prefix) are dropped.
export const buildFingerprints = <T extends NewItem>(
  items: Array<IncomingItem<T>>,
  level: FingerprintLevel,
): Array<FingerprintedItem<T>> => {
  const result: Array<FingerprintedItem<T>> = []

  for (const item of items) {
    const fingerprint = buildFingerprint(excludeEnclosureFromIdentity(item), level)

    if (fingerprint) {
      result.push({ ...item, fingerprint })
    }
  }

  return result
}

export const deduplicateItemsByFingerprint = <T extends NewItem>(
  items: Array<FingerprintedItem<T>>,
): Array<FingerprintedItem<T>> => {
  const bestByFingerprint = new Map<string, FingerprintedItem<T>>()

  for (const item of items) {
    const existing = bestByFingerprint.get(item.fingerprint)

    if (!existing || scoreItem(item) > scoreItem(existing)) {
      bestByFingerprint.set(item.fingerprint, item)
    }
  }

  return [...bestByFingerprint.values()]
}

// Classify new items against existing items into inserts/updates.
// Uses level-based fingerprinting with auto-computed level when not provided.
export const classifyItems = <T extends NewItem>(
  input: ClassifyItemsInput<T>,
): ClassifyItemsResult<T> => {
  const { newItems, existingItems, fingerprintLevel: inputLevel, cleanUrlFn } = input

  const incomingItems = composeIncomingItems(newItems, cleanUrlFn)

  // Compute profile early — used for both pre-match exclusion and final
  // classification. Uses raw (not deduped) incoming hashes; duplicates
  // lower uniqueness slightly, which is conservative (fewer link matches).
  const feedProfile = computeFeedProfile(existingItems, incomingItems)
  const matchPolicy = computeMatchPolicy(feedProfile)

  // Pre-match: find existing items that are true updates and exclude them
  // from the level collision set. A match is "strong enough" when it's by
  // guid, enclosure, or title — those are unambiguously the same item. A
  // link match is only trusted when the max-level fingerprints agree (true
  // duplicate); a bare link match with different titles could be hub onset
  // and must stay in the collision set so the level can detect it.
  const findCandidates = buildMatchIndex(existingItems)
  const matchedExistingIds = new Set<ItemIdLike>()

  for (const incomingItem of incomingItems) {
    const identityIncoming = excludeEnclosureFromIdentity(incomingItem)
    const isIncomingExcluded = identityIncoming !== incomingItem
    const candidates = findCandidates(identityIncoming)
    const result = selectMatchingItem({
      incoming: identityIncoming,
      candidates,
      matchPolicy,
      candidateFilters: prematchCandidateFilters,
    })

    if (!result) {
      continue
    }

    if (result.matchedBy !== 'link') {
      matchedExistingIds.add(result.match.id)
      continue
    }

    // Link match: only exclude when max-level fingerprints agree (true duplicate).
    const incomingMaxKey = buildFingerprint(identityIncoming, 'title')
    const existingMaxKey = buildFingerprint(
      excludeCandidateEnclosure(result.match, isIncomingExcluded),
      'title',
    )

    if (incomingMaxKey === existingMaxKey) {
      matchedExistingIds.add(result.match.id)
    }
  }

  const unmatchedExistingItems = existingItems.filter((item) => {
    return !matchedExistingIds.has(item.id)
  })

  // Dedup by max-level fingerprint so identity-equivalent items (literal
  // duplicates, or same item with slightly different hash coverage) don't
  // cause false downgrades. Items with no level identity are skipped.
  // Level resolution sees the identity view, so a feed with excluded enclosures
  // cannot be pinned to the enclosure level by a decorative image.
  const seenKeys = new Set<string>()
  const levelHashes = [...incomingItems, ...unmatchedExistingItems]
    .map((item) => excludeEnclosureFromIdentity(item))
    .filter((item) => {
      const maxKey = buildFingerprint(item, 'title')

      if (!maxKey) {
        return false
      }

      if (seenKeys.has(maxKey)) {
        return false
      }

      seenKeys.add(maxKey)

      return true
    })

  // Resolve fingerprint level: validate/downgrade if provided, compute from data otherwise.
  const resolvedLevel = resolveFingerprintLevel(levelHashes, inputLevel)

  // Build fingerprinted items at the resolved level.
  const fingerprintedItems = buildFingerprints(incomingItems, resolvedLevel)
  const deduplicatedItems = deduplicateItemsByFingerprint(fingerprintedItems)

  // Classify against existing items.
  const inserts: Array<InsertAction<T>> = []
  const updates: Array<UpdateAction<T>> = []
  const claimedExistingIds = new Set<ItemIdLike>()

  for (const fingerprintedItem of deduplicatedItems) {
    const { fingerprint, ...rest } = fingerprintedItem
    const item = rest as IncomingItem<T>
    // Matching and fingerprint comparisons run on the identity view; the
    // original item (real hashes) feeds change detection and the payloads.
    const identityItem = excludeEnclosureFromIdentity(item)
    const isIncomingExcluded = identityItem !== item
    const fingerprintHash = generateHash(fingerprint)
    const candidates = findCandidates(identityItem)

    // Reject candidates whose fingerprint differs from the incoming item.
    // This prevents matching (and merging) items that the levels consider
    // distinct. Exception: when the incoming item and a candidate agree on a
    // feed-unique guid, keep the candidate even if a volatile field changed —
    // an edited title or rotated enclosure on a stable guid is the same item,
    // not a new one.
    const levelFilteredCandidates = candidates.filter((candidate) => {
      if (agreesOnUniqueIdentifier(item, candidate, feedProfile)) {
        return true
      }

      const identityCandidate = excludeCandidateEnclosure(candidate, isIncomingExcluded)

      return buildFingerprint(identityCandidate, resolvedLevel) === fingerprint
    })

    const result = selectMatchingItem({
      incoming: identityItem,
      candidates: levelFilteredCandidates,
      matchPolicy,
      candidateFilters: classifyCandidateFilters,
    })

    if (!result) {
      inserts.push({
        item,
        fingerprintHash,
      })

      continue
    }

    claimedExistingIds.add(result.match.id)

    const shouldUpdate = updateFilters.every((filter) => {
      return filter.shouldUpdate({
        existing: result.match,
        incoming: item,
        matchedBy: result.matchedBy,
      })
    })

    if (shouldUpdate) {
      updates.push({
        item,
        fingerprintHash,
        existingItemId: result.match.id,
        matchedBy: result.matchedBy,
      })
    }
  }

  // Reconciliation: reclassify inserts that match existing items by content.
  const { reconciledInserts, reconciledUpdates } = reconcileInserts(
    inserts,
    existingItems,
    claimedExistingIds,
  )

  return {
    inserts: reconciledInserts,
    updates: [...updates, ...reconciledUpdates],
    fingerprintLevel: resolvedLevel,
  }
}
