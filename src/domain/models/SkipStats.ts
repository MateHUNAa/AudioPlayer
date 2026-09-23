/** @field Listens that ended in a skip (moved on before half the song) */
/** @field All listens, skipped or not */
/** @field Listens that reached the end of the song (or very close) */
export interface SkipRecord {
  readonly trackId: string;
  readonly skipCount: number;
  readonly playCount: number;
  readonly lastSkippedAt: number;
  readonly totalListenPercent: number;
  readonly fullPlays: number;
  readonly lastPlayedAt: number;
}

export type SkipStatsMap = ReadonlyMap<string, SkipRecord>;

/** @enum How a listen ended: why the player moved away from a track */
export type ListenIntent = 'auto' | 'next' | 'previous' | 'select';
export type ListenOutcome = 'skip' | 'play' | 'complete' | 'ignore';

const DecayHalfLifeMs = 14 * 24 * 60 * 60 * 1000;
const MaxSkipRate = 1.0;
/** A song is only penalized long-term after this many skips; one-off skips only steer the current session. */
export const ChronicSkipMinCount = 3;
const ChronicSkipRate = 0.5;
const SkipFraction = 0.5;
const CompleteFraction = 0.85;
const CompleteRemainingSeconds = 15;

export function createEmptySkipStats(): SkipStatsMap {
  return new Map();
}

export function createSkipRecord(trackId: string): SkipRecord {
  return {
    trackId,
    skipCount: 0,
    playCount: 0,
    lastSkippedAt: 0,
    totalListenPercent: 0,
    fullPlays: 0,
    lastPlayedAt: 0,
  };
}

/** @param positionSeconds - How far the listener got */
/** @param durationSeconds - Track duration */
/** @param intent - What moved playback away from the track */
/** @returns How the listen should be recorded */
export function classifyListen(
  positionSeconds: number,
  durationSeconds: number,
  intent: ListenIntent,
): ListenOutcome {
  if (!(durationSeconds > 0) || !(positionSeconds >= 0)) {
    return 'ignore';
  }
  const fraction = positionSeconds / durationSeconds;
  const nearEnd =
    fraction >= CompleteFraction ||
    durationSeconds - positionSeconds <= CompleteRemainingSeconds;

  // "auto" also covers lock-screen / notification / headset skips, so only position decides.
  if (nearEnd) {
    return 'complete';
  }
  if (intent === 'previous') {
    // Going back to replay something isn't a judgement on the current song.
    return fraction < SkipFraction ? 'ignore' : 'play';
  }
  return fraction < SkipFraction ? 'skip' : 'play';
}

export function recordSkip(
  stats: SkipStatsMap,
  trackId: string,
  listenPercent: number,
  now: number = Date.now(),
): SkipStatsMap {
  const updated = new Map(stats);
  const existing = updated.get(trackId) ?? createSkipRecord(trackId);
  const clampedPercent = Math.max(0, Math.min(1, listenPercent));

  updated.set(trackId, {
    ...existing,
    skipCount: existing.skipCount + 1,
    playCount: existing.playCount + 1,
    lastSkippedAt: now,
    totalListenPercent: existing.totalListenPercent + clampedPercent,
  });

  return updated;
}

/** @param listenPercent - Fraction listened; 1.0 (default) counts as a full play */
export function recordPlay(
  stats: SkipStatsMap,
  trackId: string,
  listenPercent: number = 1.0,
  now: number = Date.now(),
): SkipStatsMap {
  const updated = new Map(stats);
  const existing = updated.get(trackId) ?? createSkipRecord(trackId);
  const clampedPercent = Math.max(0, Math.min(1, listenPercent));
  const complete = clampedPercent >= CompleteFraction;

  updated.set(trackId, {
    ...existing,
    playCount: existing.playCount + 1,
    totalListenPercent: existing.totalListenPercent + clampedPercent,
    fullPlays: existing.fullPlays + (complete ? 1 : 0),
    lastPlayedAt: now,
  });

  return updated;
}

/** @returns Stats updated for a finished listen, or the same map when the listen is ignored */
export function recordListen(
  stats: SkipStatsMap,
  trackId: string,
  outcome: ListenOutcome,
  listenPercent: number,
  now: number = Date.now(),
): SkipStatsMap {
  switch (outcome) {
    case 'skip':
      return recordSkip(stats, trackId, listenPercent, now);
    case 'complete':
      return recordPlay(stats, trackId, 1.0, now);
    case 'play':
      return recordPlay(stats, trackId, listenPercent, now);
    default:
      return stats;
  }
}

export function computeRawSkipRate(record: SkipRecord): number {
  if (record.skipCount < ChronicSkipMinCount || record.playCount <= 0) {
    return 0;
  }
  return Math.min(MaxSkipRate, record.skipCount / record.playCount);
}

export function computeDecayedSkipRate(
  record: SkipRecord,
  now: number = Date.now(),
): number {
  const rawRate = computeRawSkipRate(record);
  if (rawRate < ChronicSkipRate || record.lastSkippedAt <= 0) {
    return 0;
  }

  const elapsed = Math.max(0, now - record.lastSkippedAt);
  const decayFactor = Math.pow(0.5, elapsed / DecayHalfLifeMs);

  return rawRate * decayFactor;
}

export function computeAvgListenPercent(record: SkipRecord): number {
  if (record.playCount <= 0) {
    return 1.0;
  }
  return Math.min(1.0, record.totalListenPercent / record.playCount);
}

export function isFrequentlySkipped(
  record: SkipRecord,
  threshold: number = ChronicSkipRate,
): boolean {
  return computeRawSkipRate(record) >= threshold;
}

/** @returns Long-term penalty, non-zero only for songs you keep skipping */
export function computeSkipPenalty(
  stats: SkipStatsMap,
  trackId: string,
  penaltyWeight: number,
  now: number = Date.now(),
): number {
  const record = stats.get(trackId);
  if (!record) {
    return 0;
  }

  const decayedRate = computeDecayedSkipRate(record, now);
  if (decayedRate <= 0) {
    return 0;
  }

  const avgListen = computeAvgListenPercent(record);
  const earlySkipMultiplier =
    avgListen < 0.25 ? 1.5 : avgListen < 0.5 ? 1.2 : 1.0;

  return decayedRate * penaltyWeight * earlySkipMultiplier;
}

export function serializeSkipStats(stats: SkipStatsMap): SkipRecord[] {
  return Array.from(stats.values());
}

export function deserializeSkipStats(
  records: readonly SkipRecord[],
): SkipStatsMap {
  const map = new Map<string, SkipRecord>();
  for (const record of records) {
    map.set(record.trackId, record);
  }
  return map;
}

/** @param raw - A persisted record from any app version */
/** @param legacy - True for records written before completed plays were tracked */
/** @returns A valid record, or null if the data is unusable */
export function normalizeSkipRecord(raw: unknown, legacy: boolean): SkipRecord | null {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0);
  if (typeof r.trackId !== 'string') {
    return null;
  }
  const record: SkipRecord = {
    trackId: r.trackId,
    skipCount: num(r.skipCount),
    playCount: num(r.playCount),
    lastSkippedAt: num(r.lastSkippedAt),
    totalListenPercent: num(r.totalListenPercent),
    fullPlays: num(r.fullPlays),
    lastPlayedAt: num(r.lastPlayedAt),
  };
  if (!legacy) {
    return record;
  }
  // Old versions never counted songs that played to the end, so their skip rates were
  // wildly inflated and one skip could bury a song for weeks. Start them below the
  // chronic threshold so nothing stays penalized because of that bug.
  return {
    ...record,
    skipCount: Math.min(record.skipCount, ChronicSkipMinCount - 1),
  };
}

export function pruneStaleRecords(
  stats: SkipStatsMap,
  maxAgeMs: number = 180 * 24 * 60 * 60 * 1000,
  now: number = Date.now(),
): SkipStatsMap {
  const pruned = new Map<string, SkipRecord>();
  for (const [trackId, record] of stats) {
    const lastActivity = Math.max(record.lastSkippedAt, record.lastPlayedAt);
    if (lastActivity <= 0 ? record.playCount > 0 : now - lastActivity < maxAgeMs) {
      pruned.set(trackId, record);
    }
  }
  return pruned;
}

export function mergeSkipStats(
  base: SkipStatsMap,
  incoming: SkipStatsMap,
): SkipStatsMap {
  const merged = new Map(base);
  for (const [trackId, record] of incoming) {
    const existing = merged.get(trackId);
    if (!existing) {
      merged.set(trackId, record);
      continue;
    }
    merged.set(trackId, {
      trackId,
      skipCount: existing.skipCount + record.skipCount,
      playCount: existing.playCount + record.playCount,
      lastSkippedAt: Math.max(existing.lastSkippedAt, record.lastSkippedAt),
      totalListenPercent:
        existing.totalListenPercent + record.totalListenPercent,
      fullPlays: existing.fullPlays + record.fullPlays,
      lastPlayedAt: Math.max(existing.lastPlayedAt, record.lastPlayedAt),
    });
  }
  return merged;
}
