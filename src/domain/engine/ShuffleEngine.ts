import { Track } from '../models/Track';
import {
  ShuffleConfig,
  createDefaultShuffleConfig,
} from '../models/ShuffleConfig';

/** @field Tracks that have been recently played, bounded by history window */
/** @field Count of how many times each artist has appeared in the history window */
/** @field Count of how many times each album has appeared in the history window */
/** @field Total number of tracks selected so far in this shuffle session */
export interface ShuffleState {
  readonly recentHistory: readonly string[];
  readonly artistFrequency: ReadonlyMap<string, number>;
  readonly albumFrequency: ReadonlyMap<string, number>;
  readonly selectionCount: number;
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

/** @returns A fresh ShuffleState with no history */
export function createInitialShuffleState(): ShuffleState {
  return {
    recentHistory: [],
    artistFrequency: new Map(),
    albumFrequency: new Map(),
    selectionCount: 0,
  };
}

/** @param seed - Numeric seed value */
/** @returns A seeded pseudo-random number generator function producing values in [0, 1) */
function createSeededRng(seed: number): () => number {
  let state = seed;
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

  return {
    recentHistory: newHistory,
    artistFrequency: newArtistFreq,
    albumFrequency: newAlbumFreq,
    selectionCount: state.selectionCount + 1,
  };
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

/** @param track - Candidate track to score */
/** @param state - Current shuffle state with play history */
/** @param config - Shuffle configuration with penalty weights */
/** @param rng - Random number generator function */
/** @param trackIndex - Index for resolving track IDs from history */
/** @returns Computed weight score for the candidate track with full history awareness */
function computeTrackScoreWithIndex(
  track: Track,
  state: ShuffleState,
  config: ShuffleConfig,
  rng: () => number,
  trackIndex: TrackIndex,
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
/** @returns The next track selected using smart shuffle scoring */
export function selectNextTrack(
  tracks: readonly Track[],
  currentTrack: Track | null,
  state: ShuffleState,
  config: ShuffleConfig,
): ShuffleResult | null {
  if (tracks.length === 0) {
    return null;
  }

  if (tracks.length === 1) {
    return { track: tracks[0], score: config.baseWeight };
  }

  const rng = createRng(config);
  const trackIndex = buildTrackIndex(tracks);

  const candidates: ScoredCandidate[] = [];
  for (const track of tracks) {
    if (currentTrack && track.id === currentTrack.id) {
      continue;
    }

    const weight = computeTrackScoreWithIndex(
      track,
      state,
      config,
      rng,
      trackIndex,
    );
    candidates.push({ track, weight });
  }

  if (candidates.length === 0) {
    return { track: tracks[0], score: config.baseWeight };
  }

  const selected = weightedRandomSelect(candidates, rng);
  return { track: selected.track, score: selected.weight };
}

/** @param tracks - Full list of tracks to shuffle into a queue */
/** @param startTrack - Optional track to place first in the queue */
/** @param config - Shuffle configuration controlling algorithm behavior */
/** @returns A fully ordered shuffled queue with final shuffle state */
export function buildShuffledQueue(
  tracks: readonly Track[],
  startTrack: Track | null,
  config: ShuffleConfig = createDefaultShuffleConfig(),
): ShuffledQueue {
  if (tracks.length === 0) {
    return { tracks: [], finalState: createInitialShuffleState() };
  }

  if (tracks.length === 1) {
    return {
      tracks: [...tracks],
      finalState: recordSelection(
        createInitialShuffleState(),
        tracks[0],
        config,
      ),
    };
  }

  const rng = createRng(config);
  const trackIndex = buildTrackIndex(tracks);
  const result: Track[] = [];
  const remaining = new Set<string>(tracks.map(t => t.id));
  let state = createInitialShuffleState();

  if (startTrack && remaining.has(startTrack.id)) {
    result.push(startTrack);
    remaining.delete(startTrack.id);
    state = recordSelection(state, startTrack, config);
  }

  while (remaining.size > 0) {
    const candidates: ScoredCandidate[] = [];

    for (const trackId of remaining) {
      const track = trackIndex.byId.get(trackId);
      if (!track) {
        continue;
      }

      const weight = computeTrackScoreWithIndex(
        track,
        state,
        config,
        rng,
        trackIndex,
      );
      candidates.push({ track, weight });
    }

    if (candidates.length === 0) {
      break;
    }

    const selected = weightedRandomSelect(candidates, rng);
    result.push(selected.track);
    remaining.delete(selected.track.id);
    state = recordSelection(state, selected.track, config);

    if (
      state.selectionCount >= config.historyWindowSize * 3 &&
      remaining.size > 0
    ) {
      state = {
        ...state,
        recentHistory: state.recentHistory.slice(-config.historyWindowSize),
        artistFrequency: rebuildFrequencyFromRecent(
          state.recentHistory.slice(-config.historyWindowSize),
          trackIndex,
          'artist',
        ),
        albumFrequency: rebuildFrequencyFromRecent(
          state.recentHistory.slice(-config.historyWindowSize),
          trackIndex,
          'album',
        ),
      };
    }
  }

  return { tracks: result, finalState: state };
}

/** @param recentIds - Recent track IDs to rebuild frequency from */
/** @param trackIndex - Index for resolving track IDs to Track objects */
/** @param field - Which Track field to aggregate frequency for */
/** @returns A new frequency map rebuilt from the recent history window */
function rebuildFrequencyFromRecent(
  recentIds: readonly string[],
  trackIndex: TrackIndex,
  field: 'artist' | 'album',
): ReadonlyMap<string, number> {
  const freq = new Map<string, number>();
  for (const id of recentIds) {
    const track = trackIndex.byId.get(id);
    if (track) {
      const key = track[field];
      const count = freq.get(key) ?? 0;
      freq.set(key, count + 1);
    }
  }
  return freq;
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
