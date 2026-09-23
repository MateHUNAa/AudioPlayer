import { Track } from '../models/Track';
import {
  ShuffleConfig,
  createDefaultShuffleConfig,
} from '../models/ShuffleConfig';
import { SkipStatsMap, computeSkipPenalty } from '../models/SkipStats';
import {
  VibePoint,
  UnknownVibeDistance,
  blendVibe,
  isCurrentAnalysis,
  toVibePoint,
  vibeDistance,
} from '../models/TrackAnalysis';

/** @field Tracks that have been recently played, bounded by history window */
/** @field Count of how many times each artist has appeared in the history window */
/** @field Count of how many times each album has appeared in the history window */
/** @field Total number of tracks selected so far in this shuffle session */
/** @field BPM anchor value used for similarity/gradual matching or null if unset */
export interface ShuffleState {
  readonly recentHistory: readonly string[];
  readonly artistFrequency: ReadonlyMap<string, number>;
  readonly albumFrequency: ReadonlyMap<string, number>;
  readonly selectionCount: number;
  readonly anchorBpm: number | null;
}

/** @field The track that was selected */
/** @field The computed score that led to its selection */
export interface ShuffleResult {
  readonly track: Track;
  readonly score: number;
}

/** @field The ordered shuffled queue */
/** @field The state after building the full queue */
export interface ShuffledQueue {
  readonly tracks: readonly Track[];
  readonly finalState: ShuffleState;
}

/** @field The scored candidate with its computed weight */
interface ScoredCandidate {
  readonly track: Track;
  readonly weight: number;
}

const GradualDriftFactor = 0.3 as const;
const GradualToleranceMultiplier = 2.5 as const;
const NoBpmNeutralPenalty = 0.15 as const;

/** @returns A fresh ShuffleState with no history */
export function createInitialShuffleState(): ShuffleState {
  return {
    recentHistory: [],
    artistFrequency: new Map(),
    albumFrequency: new Map(),
    selectionCount: 0,
    anchorBpm: null,
  };
}

/** @param seed - Numeric seed value */
/** @returns A seeded pseudo-random number generator function producing values in [0, 1) */
function createSeededRng(seed: number): () => number {
  // Scramble the seed first: raw LCG outputs for nearby seeds (1, 2, 3...) start almost identical.
  let state = seed >>> 0;
  state = Math.imul(state ^ (state >>> 16), 0x85ebca6b) >>> 0;
  state = Math.imul(state ^ (state >>> 13), 0xc2b2ae35) >>> 0;
  state = (state ^ (state >>> 16)) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state >>> 0) / 0x100000000;
  };
}

/** @param config - Shuffle configuration to derive RNG from */
/** @returns A random number generator, seeded if config provides a seed */
function createRng(config: ShuffleConfig): () => number {
  if (config.seed !== null) {
    return createSeededRng(config.seed);
  }
  return () => Math.random();
}

/** @param state - Current shuffle state */
/** @param track - The track that was just selected */
/** @param config - Shuffle configuration for history window bounds */
/** @returns Updated ShuffleState reflecting the newly selected track */
export function recordSelection(
  state: ShuffleState,
  track: Track,
  config: ShuffleConfig,
): ShuffleState {
  const windowSize = config.historyWindowSize;

  let newHistory = [...state.recentHistory, track.id];
  if (newHistory.length > windowSize) {
    newHistory = newHistory.slice(newHistory.length - windowSize);
  }

  const newArtistFreq = new Map(state.artistFrequency);
  const currentArtistCount = newArtistFreq.get(track.artist) ?? 0;
  newArtistFreq.set(track.artist, currentArtistCount + 1);

  const newAlbumFreq = new Map(state.albumFrequency);
  const currentAlbumCount = newAlbumFreq.get(track.album) ?? 0;
  newAlbumFreq.set(track.album, currentAlbumCount + 1);

  const newAnchorBpm = computeNextAnchorBpm(state.anchorBpm, effectiveBpm(track), config);

  return {
    recentHistory: newHistory,
    artistFrequency: newArtistFreq,
    albumFrequency: newAlbumFreq,
    selectionCount: state.selectionCount + 1,
    anchorBpm: newAnchorBpm,
  };
}

/** @param currentAnchor - Current BPM anchor or null */
/** @param trackBpm - BPM of the newly selected track or null */
/** @param config - Shuffle config with BPM mode */
/** @returns Updated anchor BPM after selecting the track */
function computeNextAnchorBpm(
  currentAnchor: number | null,
  trackBpm: number | null,
  config: ShuffleConfig,
): number | null {
  if (config.bpmMode === 'off') {
    return null;
  }

  if (trackBpm == null || trackBpm <= 0) {
    return currentAnchor;
  }

  if (currentAnchor == null) {
    return trackBpm;
  }

  if (config.bpmMode === 'similar') {
    return currentAnchor;
  }

  if (config.bpmMode === 'gradual') {
    return currentAnchor + (trackBpm - currentAnchor) * GradualDriftFactor;
  }

  return currentAnchor;
}

/** @param track - Candidate track to score */
/** @param state - Current shuffle state with play history */
/** @param config - Shuffle configuration with penalty weights */
/** @param rng - Random number generator function */
/** @returns Computed weight score for the candidate track */
export function computeTrackScore(
  track: Track,
  state: ShuffleState,
  config: ShuffleConfig,
  rng: () => number,
): number {
  let score = config.baseWeight;

  const recentHistory = state.recentHistory;
  const historyLength = recentHistory.length;

  const recentIndex = recentHistory.lastIndexOf(track.id);
  if (recentIndex !== -1) {
    const recency = historyLength - recentIndex;
    const decayFactor = recency / (config.historyWindowSize + 1);
    score -= config.recentPlayPenalty * (1 - decayFactor);
  }

  let artistProximity = Infinity;
  for (let i = historyLength - 1; i >= 0; i--) {
    if (isArtistInHistory(recentHistory[i], track.artist, state)) {
      artistProximity = historyLength - i;
      break;
    }
  }
  if (artistProximity <= config.minArtistGap) {
    score -= config.artistPenalty * 2;
  } else if (artistProximity < config.historyWindowSize) {
    const artistDecay = artistProximity / config.historyWindowSize;
    score -= config.artistPenalty * (1 - artistDecay);
  }

  const artistCount = state.artistFrequency.get(track.artist) ?? 0;
  if (artistCount > 0 && state.selectionCount > 0) {
    const artistOverrepresentation = artistCount / state.selectionCount;
    if (artistOverrepresentation > 0.3) {
      score -= config.artistPenalty * 0.5;
    }
  }

  let albumProximity = Infinity;
  for (let i = historyLength - 1; i >= 0; i--) {
    if (isAlbumInHistory(recentHistory[i], track.album, state)) {
      albumProximity = historyLength - i;
      break;
    }
  }
  if (albumProximity <= config.minAlbumGap) {
    score -= config.albumPenalty * 2;
  } else if (albumProximity < config.historyWindowSize) {
    const albumDecay = albumProximity / config.historyWindowSize;
    score -= config.albumPenalty * (1 - albumDecay);
  }

  const randomComponent = (rng() * 2 - 1) * config.randomnessFactor;
  score += randomComponent;

  return Math.max(1, score);
}

/** @param trackId - Track ID from history to check */
/** @param artist - Artist name to match against */
/** @param _state - Shuffle state (reserved for future lookup optimization) */
/** @returns Whether the track ID belongs to the given artist */
function isArtistInHistory(
  _trackId: string,
  _artist: string,
  _state: ShuffleState,
): boolean {
  return false;
}

/** @param trackId - Track ID from history to check */
/** @param album - Album name to match against */
/** @param _state - Shuffle state (reserved for future lookup optimization) */
/** @returns Whether the track ID belongs to the given album */
function isAlbumInHistory(
  _trackId: string,
  _album: string,
  _state: ShuffleState,
): boolean {
  return false;
}

/** @field Map from track ID to its Track object for O(1) lookups */
interface TrackIndex {
  readonly byId: ReadonlyMap<string, Track>;
}

/** @param tracks - All tracks to index */
/** @returns A TrackIndex for fast ID-based lookups */
function buildTrackIndex(tracks: readonly Track[]): TrackIndex {
  const byId = new Map<string, Track>();
  for (const track of tracks) {
    byId.set(track.id, track);
  }
  return { byId };
}

/** @param candidateBpm - BPM of the candidate track or null */
/** @param anchorBpm - Current anchor BPM or null */
/** @param config - Shuffle config with BPM mode, tolerance, penalty */
/** @param rng - Random number generator for gradual mode variance */
/** @returns Penalty value to subtract from the candidate score */
function computeBpmPenalty(
  candidateBpm: number | null,
  anchorBpm: number | null,
  config: ShuffleConfig,
  rng: () => number,
): number {
  if (config.bpmMode === 'off' || anchorBpm == null) {
    return 0;
  }

  if (candidateBpm == null || candidateBpm <= 0) {
    return config.bpmPenalty * NoBpmNeutralPenalty;
  }

  const distance = Math.abs(candidateBpm - anchorBpm);

  if (config.bpmMode === 'similar') {
    if (distance <= config.bpmTolerance) {
      return 0;
    }
    const overshoot = distance - config.bpmTolerance;
    const normalizedOvershoot = Math.min(
      1,
      overshoot / (config.bpmTolerance * 2),
    );
    return config.bpmPenalty * normalizedOvershoot;
  }

  if (config.bpmMode === 'gradual') {
    const gradualTolerance = config.bpmTolerance * GradualToleranceMultiplier;
    if (distance <= gradualTolerance) {
      const softPenalty =
        (distance / gradualTolerance) * config.bpmPenalty * 0.4;
      return softPenalty;
    }
    const overshoot = distance - gradualTolerance;
    const normalizedOvershoot = Math.min(1, overshoot / gradualTolerance);
    const jitter = rng() * config.bpmPenalty * 0.15;
    return (
      config.bpmPenalty * 0.4 +
      config.bpmPenalty * 0.6 * normalizedOvershoot -
      jitter
    );
  }

  return 0;
}

/** @param track - Candidate track to score */
/** @param state - Current shuffle state with play history */
/** @param config - Shuffle configuration with penalty weights */
/** @param rng - Random number generator function */
/** @param trackIndex - Index for resolving track IDs from history */
/** @param skipStats - Persistent skip statistics for all tracks */
/** @returns Computed weight score for the candidate track with full history awareness */
function computeTrackScoreWithIndex(
  track: Track,
  state: ShuffleState,
  config: ShuffleConfig,
  rng: () => number,
  trackIndex: TrackIndex,
  skipStats: SkipStatsMap,
): number {
  let score = config.baseWeight;

  const recentHistory = state.recentHistory;
  const historyLength = recentHistory.length;

  const recentIndex = recentHistory.lastIndexOf(track.id);
  if (recentIndex !== -1) {
    const recency = historyLength - recentIndex;
    const decayFactor = recency / (config.historyWindowSize + 1);
    score -= config.recentPlayPenalty * (1 - decayFactor);
  }

  let artistProximity = Infinity;
  for (let i = historyLength - 1; i >= 0; i--) {
    const histTrack = trackIndex.byId.get(recentHistory[i]);
    if (histTrack && histTrack.artist === track.artist) {
      artistProximity = historyLength - i;
      break;
    }
  }
  if (artistProximity <= config.minArtistGap) {
    score -= config.artistPenalty * 2;
  } else if (artistProximity < config.historyWindowSize) {
    const artistDecay = artistProximity / config.historyWindowSize;
    score -= config.artistPenalty * (1 - artistDecay);
  }

  const artistCount = state.artistFrequency.get(track.artist) ?? 0;
  if (artistCount > 0 && state.selectionCount > 0) {
    const artistOverrepresentation = artistCount / state.selectionCount;
    if (artistOverrepresentation > 0.3) {
      score -= config.artistPenalty * 0.5;
    }
  }

  let albumProximity = Infinity;
  for (let i = historyLength - 1; i >= 0; i--) {
    const histTrack = trackIndex.byId.get(recentHistory[i]);
    if (histTrack && histTrack.album === track.album) {
      albumProximity = historyLength - i;
      break;
    }
  }
  if (albumProximity <= config.minAlbumGap) {
    score -= config.albumPenalty * 2;
  } else if (albumProximity < config.historyWindowSize) {
    const albumDecay = albumProximity / config.historyWindowSize;
    score -= config.albumPenalty * (1 - albumDecay);
  }

  const bpmPenaltyValue = computeBpmPenalty(
    effectiveBpm(track),
    state.anchorBpm,
    config,
    rng,
  );
  score -= bpmPenaltyValue;

  if (config.skipPenalty > 0) {
    const skipPenaltyValue = computeSkipPenalty(
      skipStats,
      track.id,
      config.skipPenalty,
    );
    score -= skipPenaltyValue;
  }

  const randomComponent = (rng() * 2 - 1) * config.randomnessFactor;
  score += randomComponent;

  return Math.max(1, score);
}

/** @param candidates - Array of scored candidates with positive weights */
/** @param rng - Random number generator function */
/** @returns The selected candidate using weighted probability distribution */
function weightedRandomSelect(
  candidates: readonly ScoredCandidate[],
  rng: () => number,
): ScoredCandidate {
  let totalWeight = 0;
  for (const candidate of candidates) {
    totalWeight += candidate.weight;
  }

  let roll = rng() * totalWeight;

  for (const candidate of candidates) {
    roll -= candidate.weight;
    if (roll <= 0) {
      return candidate;
    }
  }

  return candidates[candidates.length - 1];
}

/** @param tracks - Full list of candidate tracks */
/** @param currentTrack - Currently playing track to exclude or anchor */
/** @param state - Current shuffle state */
/** @param config - Shuffle configuration */
/** @param skipStats - Persistent skip statistics for penalty scoring */
/** @returns The next track selected using smart shuffle scoring */
export function selectNextTrack(
  tracks: readonly Track[],
  currentTrack: Track | null,
  state: ShuffleState,
  config: ShuffleConfig,
  skipStats: SkipStatsMap = new Map(),
): ShuffleResult | null {
  if (tracks.length === 0) {
    return null;
  }

  if (tracks.length === 1) {
    return { track: tracks[0], score: config.baseWeight };
  }

  const rng = createRng(config);
  const trackIndex = buildTrackIndex(tracks);

  const stateWithAnchor = resolveInitialAnchor(state, currentTrack, config);

  const candidates: ScoredCandidate[] = [];
  for (const track of tracks) {
    if (currentTrack && track.id === currentTrack.id) {
      continue;
    }

    const weight = computeTrackScoreWithIndex(
      track,
      stateWithAnchor,
      config,
      rng,
      trackIndex,
      skipStats,
    );
    candidates.push({ track, weight });
  }

  if (candidates.length === 0) {
    return { track: tracks[0], score: config.baseWeight };
  }

  const selected = weightedRandomSelect(candidates, rng);
  return { track: selected.track, score: selected.weight };
}

/** @param state - Current shuffle state that may lack an anchor BPM */
/** @param anchorTrack - Track to derive initial BPM anchor from */
/** @param config - Shuffle config with BPM mode */
/** @returns ShuffleState with anchorBpm initialized if needed */
function resolveInitialAnchor(
  state: ShuffleState,
  anchorTrack: Track | null,
  config: ShuffleConfig,
): ShuffleState {
  if (config.bpmMode === 'off') {
    return state;
  }

  if (state.anchorBpm != null) {
    return state;
  }

  const bpm = anchorTrack ? effectiveBpm(anchorTrack) : null;
  if (bpm != null) {
    return { ...state, anchorBpm: bpm };
  }

  return state;
}


/** @field Recent listening feedback from this app session (not persisted) */
export interface SessionFeedback {
  readonly skipped: readonly string[];
  readonly completed: readonly string[];
}

export function createEmptySession(): SessionFeedback {
  return { skipped: [], completed: [] };
}

const SessionMemory = 8;

/** @returns Session feedback with the track appended to the given list (bounded, most recent last) */
export function withSessionFeedback(
  session: SessionFeedback,
  trackId: string,
  kind: 'skipped' | 'completed',
): SessionFeedback {
  const add = (list: readonly string[]) =>
    [...list.filter(id => id !== trackId), trackId].slice(-SessionMemory);
  const drop = (list: readonly string[]) => list.filter(id => id !== trackId);
  return kind === 'skipped'
    ? { skipped: add(session.skipped), completed: drop(session.completed) }
    : { skipped: drop(session.skipped), completed: add(session.completed) };
}

/** @field Loved tracks get a score bonus */
/** @field This session's skips/completions steer picks away from/towards those vibes */
/** @field Tracks already played (oldest first, current last) for spacing and vibe continuity */
export interface ShuffleContext {
  readonly favouriteIds?: ReadonlySet<string>;
  readonly session?: SessionFeedback;
  readonly history?: readonly Track[];
  /** Stop after this many picks; the rest keep their input order (cheap partial re-plans) */
  readonly limit?: number;
}

/** Candidates scored per pick. Bounds a full-queue build to O(n * SampleSize). */
const SampleSize = 160;
/** How far the vibe anchor moves toward each picked track (0 = never moves, 1 = jumps). */
const VibeDrift = 0.35;
/** Vibe distance under which a candidate counts as "like" a skipped/completed song. */
const SkipVibeRadius = 0.3;
const LikeVibeRadius = 0.25;

/** @returns The analyzed tempo if available, else the tag BPM */
export function effectiveBpm(track: Track): number | null {
  const analyzed = track.analysis?.bpm;
  if (analyzed != null && analyzed > 0) {
    return analyzed;
  }
  return track.bpm != null && track.bpm > 0 ? track.bpm : null;
}

function vibeOf(track: Track): VibePoint | null {
  return isCurrentAnalysis(track.analysis) ? toVibePoint(track.analysis) : null;
}

/** @returns Per-track score adjustment from this session's skips and full listens (computed once per build) */
function computeSessionAdjustments(
  tracks: readonly Track[],
  vibes: ReadonlyMap<string, VibePoint | null>,
  session: SessionFeedback | undefined,
  weight: number,
  lookup: ReadonlyMap<string, Track>,
): Map<string, number> {
  const adjustments = new Map<string, number>();
  if (!session || weight <= 0 || (session.skipped.length === 0 && session.completed.length === 0)) {
    return adjustments;
  }
  const resolve = (ids: readonly string[]) =>
    ids.map(id => lookup.get(id)).filter((t): t is Track => t != null);
  const skipped = resolve(session.skipped);
  const completed = resolve(session.completed);
  const skippedArtists = new Set(skipped.map(t => t.artist));
  // More recent feedback counts more.
  const recencyWeight = (i: number, len: number) => 0.5 + (0.5 * (i + 1)) / len;

  for (const track of tracks) {
    const v = vibes.get(track.id) ?? null;
    let adj = 0;
    if (skippedArtists.has(track.artist)) {
      adj -= weight * 0.3;
    }
    if (v) {
      skipped.forEach((s, i) => {
        const sv = vibes.get(s.id) ?? vibeOf(s);
        if (sv) {
          const closeness = 1 - vibeDistance(v, sv) / SkipVibeRadius;
          if (closeness > 0) {
            adj -= weight * closeness * recencyWeight(i, skipped.length);
          }
        }
      });
      completed.forEach((c, i) => {
        const cv = vibes.get(c.id) ?? vibeOf(c);
        if (cv) {
          const closeness = 1 - vibeDistance(v, cv) / LikeVibeRadius;
          if (closeness > 0) {
            adj += weight * 0.3 * closeness * recencyWeight(i, completed.length);
          }
        }
      });
    }
    if (adj !== 0) {
      adjustments.set(track.id, adj);
    }
  }
  return adjustments;
}

/** @param tracks - Full list of tracks to shuffle into a queue */
/** @param startTrack - Optional track to place first in the queue */
/** @param config - Shuffle configuration controlling algorithm behavior */
/** @param skipStats - Persistent listening statistics for chronic-skip penalties */
/** @param context - Favourites, session feedback and play history for vibe-aware ordering */
/** @returns A fully ordered shuffled queue with final shuffle state */
export function buildShuffledQueue(
  tracks: readonly Track[],
  startTrack: Track | null,
  config: ShuffleConfig = createDefaultShuffleConfig(),
  skipStats: SkipStatsMap = new Map(),
  context: ShuffleContext = {},
): ShuffledQueue {
  if (tracks.length === 0) {
    return { tracks: [], finalState: createInitialShuffleState() };
  }

  if (tracks.length === 1) {
    return {
      tracks: [...tracks],
      finalState: recordSelection(createInitialShuffleState(), tracks[0], config),
    };
  }

  const rng = createRng(config);
  const historyWindow = Math.max(1, config.historyWindowSize);
  const temperature = 4 + 0.5 * Math.max(0, config.randomnessFactor);
  const favourites = context.favouriteIds;
  const history = context.history ?? [];

  const lookup = new Map<string, Track>();
  for (const t of history) {
    lookup.set(t.id, t);
  }
  for (const t of tracks) {
    lookup.set(t.id, t);
  }
  const vibes = new Map<string, VibePoint | null>();
  for (const t of lookup.values()) {
    vibes.set(t.id, vibeOf(t));
  }
  const sessionAdjust = computeSessionAdjustments(
    tracks,
    vibes,
    context.session,
    config.sessionWeight ?? 0,
    lookup,
  );

  // Static per-track part of the score: skip history, favourites, session feedback.
  const staticScore = new Map<string, number>();
  const now = Date.now();
  for (const t of tracks) {
    let s = config.baseWeight;
    if (config.skipPenalty > 0) {
      s -= computeSkipPenalty(skipStats, t.id, config.skipPenalty, now);
    }
    if (favourites?.has(t.id)) {
      s += config.favouriteBoost ?? 0;
    }
    s += sessionAdjust.get(t.id) ?? 0;
    staticScore.set(t.id, s);
  }

  const result: Track[] = [];
  const artistLastPos = new Map<string, number>();
  const albumLastPos = new Map<string, number>();
  const artistWindowCount = new Map<string, number>();
  const placed: Track[] = [];
  let anchorVibe: VibePoint | null = null;
  let anchorBpm: number | null = null;

  const place = (track: Track, pos: number) => {
    artistLastPos.set(track.artist, pos);
    albumLastPos.set(track.album, pos);
    placed.push(track);
    artistWindowCount.set(track.artist, (artistWindowCount.get(track.artist) ?? 0) + 1);
    if (placed.length > historyWindow) {
      const old = placed[placed.length - historyWindow - 1];
      artistWindowCount.set(old.artist, (artistWindowCount.get(old.artist) ?? 1) - 1);
    }
    const v = vibes.get(track.id) ?? null;
    if (v) {
      anchorVibe = blendVibe(anchorVibe, v, anchorVibe ? VibeDrift : 1);
    }
    anchorBpm = computeNextAnchorBpm(anchorBpm, effectiveBpm(track), config);
  };

  history.forEach((t, i) => place(t, i - history.length));

  const remaining: Track[] = [];
  for (const t of tracks) {
    if (!startTrack || t.id !== startTrack.id) {
      remaining.push(t);
    }
  }
  if (startTrack && remaining.length < tracks.length) {
    result.push(startTrack);
    place(startTrack, 0);
  }

  const candidateWeights: number[] = [];
  const limit = context.limit ?? Infinity;
  while (remaining.length > 0 && result.length < limit) {
    const pos = result.length;
    const sampleCount = Math.min(SampleSize, remaining.length);
    // Partial Fisher-Yates: the first sampleCount entries become a uniform random sample.
    if (sampleCount < remaining.length) {
      for (let k = 0; k < sampleCount; k++) {
        const j = k + Math.floor(rng() * (remaining.length - k));
        const tmp = remaining[k];
        remaining[k] = remaining[j];
        remaining[j] = tmp;
      }
    }

    let maxScore = -Infinity;
    candidateWeights.length = sampleCount;
    const selectionCount = Math.min(placed.length, historyWindow);
    // Cast: TS cannot see that place() reassigns anchorVibe inside the closure.
    const anchor = anchorVibe as VibePoint | null;
    for (let k = 0; k < sampleCount; k++) {
      const track = remaining[k];
      let score = staticScore.get(track.id) ?? config.baseWeight;

      const artistPos = artistLastPos.get(track.artist);
      if (artistPos !== undefined) {
        const proximity = pos - artistPos;
        if (proximity <= config.minArtistGap) {
          score -= config.artistPenalty * 2;
        } else if (proximity < historyWindow) {
          score -= config.artistPenalty * (1 - proximity / historyWindow);
        }
        const count = artistWindowCount.get(track.artist) ?? 0;
        if (selectionCount > 0 && count / selectionCount > 0.3) {
          score -= config.artistPenalty * 0.5;
        }
      }

      const albumPos = albumLastPos.get(track.album);
      if (albumPos !== undefined) {
        const proximity = pos - albumPos;
        if (proximity <= config.minAlbumGap) {
          score -= config.albumPenalty * 2;
        } else if (proximity < historyWindow) {
          score -= config.albumPenalty * (1 - proximity / historyWindow);
        }
      }

      if (config.bpmMode !== 'off') {
        score -= computeBpmPenalty(effectiveBpm(track), anchorBpm, config, rng);
      }

      if (anchor && config.vibeWeight > 0) {
        const v = vibes.get(track.id) ?? null;
        score -= config.vibeWeight * (v ? vibeDistance(anchor, v) : UnknownVibeDistance);
      }

      candidateWeights[k] = score;
      if (score > maxScore) {
        maxScore = score;
      }
    }

    // Softmax selection: penalties translate into real probability differences.
    let total = 0;
    for (let k = 0; k < sampleCount; k++) {
      const w = Math.exp((candidateWeights[k] - maxScore) / temperature);
      candidateWeights[k] = w;
      total += w;
    }
    let roll = rng() * total;
    let chosen = sampleCount - 1;
    for (let k = 0; k < sampleCount; k++) {
      roll -= candidateWeights[k];
      if (roll <= 0) {
        chosen = k;
        break;
      }
    }

    const picked = remaining[chosen];
    remaining[chosen] = remaining[remaining.length - 1];
    remaining.pop();
    result.push(picked);
    place(picked, pos);
  }

  if (remaining.length > 0) {
    const pickedIds = new Set(result.map(t => t.id));
    for (const t of tracks) {
      if (!pickedIds.has(t.id)) {
        result.push(t);
      }
    }
  }

  const recent = placed.slice(-historyWindow);
  const artistFrequency = new Map<string, number>();
  const albumFrequency = new Map<string, number>();
  for (const t of recent) {
    artistFrequency.set(t.artist, (artistFrequency.get(t.artist) ?? 0) + 1);
    albumFrequency.set(t.album, (albumFrequency.get(t.album) ?? 0) + 1);
  }

  return {
    tracks: result,
    finalState: {
      recentHistory: recent.map(t => t.id),
      artistFrequency,
      albumFrequency,
      selectionCount: result.length,
      anchorBpm,
    },
  };
}


/** @param tracks - Full list of tracks to truly randomly shuffle */
/** @param startTrack - Optional track to place first */
/** @param seed - Optional seed for deterministic random order */
/** @returns A randomly shuffled queue using Fisher-Yates algorithm */
export function buildRandomQueue(
  tracks: readonly Track[],
  startTrack: Track | null,
  seed: number | null = null,
): ShuffledQueue {
  if (tracks.length <= 1) {
    return {
      tracks: [...tracks],
      finalState: createInitialShuffleState(),
    };
  }

  const rng = seed !== null ? createSeededRng(seed) : () => Math.random();
  const shuffled = [...tracks];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  if (startTrack) {
    const startIdx = shuffled.findIndex(t => t.id === startTrack.id);
    if (startIdx > 0) {
      [shuffled[0], shuffled[startIdx]] = [shuffled[startIdx], shuffled[0]];
    }
  }

  return {
    tracks: shuffled,
    finalState: createInitialShuffleState(),
  };
}

/** @param state - The current shuffle state to reset */
/** @returns A fresh ShuffleState with all history cleared */
export function resetShuffleState(_state: ShuffleState): ShuffleState {
  return createInitialShuffleState();
}

/** @param state - Current shuffle state to inspect */
/** @returns Whether the shuffle session has completed a full cycle */
export function hasCompletedCycle(
  state: ShuffleState,
  totalTracks: number,
): boolean {
  return state.selectionCount >= totalTracks;
}
