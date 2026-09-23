import { Track } from './Track';
import { SkipStatsMap } from './SkipStats';

/** Songs played to the end at least this many times (and not loved) get suggested. */
export const SuggestionMinFullPlays = 3;
/** After dismissing a suggestion it comes back only after this many more full plays. */
const DismissRegrace = 5;
const RecencyHalfLifeMs = 30 * 24 * 60 * 60 * 1000;

/** @field Track ID mapped to its full-play count when the user dismissed it */
export type DismissedSuggestions = ReadonlyMap<string, number>;

/** @field The suggested track */
/** @field How many times it was played to the end */
/** @field Ranking score (more plays, more recent = higher) */
export interface Suggestion {
  readonly track: Track;
  readonly fullPlays: number;
  readonly score: number;
}

/** @returns Tracks you keep listening to but haven't loved yet, best first */
export function computeSuggestions(
  tracks: readonly Track[],
  stats: SkipStatsMap,
  favouriteIds: ReadonlySet<string>,
  dismissed: DismissedSuggestions,
  now: number = Date.now(),
): Suggestion[] {
  const out: Suggestion[] = [];
  for (const track of tracks) {
    const record = stats.get(track.id);
    if (!record || record.fullPlays < SuggestionMinFullPlays || favouriteIds.has(track.id)) {
      continue;
    }
    const dismissedAt = dismissed.get(track.id);
    if (dismissedAt !== undefined && record.fullPlays < dismissedAt + DismissRegrace) {
      continue;
    }
    const age = Math.max(0, now - record.lastPlayedAt);
    const recency = Math.pow(0.5, age / RecencyHalfLifeMs);
    const score = record.fullPlays * (0.4 + 0.6 * recency) - 0.5 * record.skipCount;
    out.push({ track, fullPlays: record.fullPlays, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
