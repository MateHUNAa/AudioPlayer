import { Track } from '../models/Track';
import {
  Queue,
  createQueue,
  createEmptyQueue,
  getCurrentTrack,
  hasNext,
  hasPrevious,
  advanceToNext,
  returnToPrevious,
  jumpToIndex,
  jumpToTrack,
  applyShuffledOrder,
  restoreOriginalOrder,
  appendTrack,
  insertNext,
  removeFromQueue,
  getUpcoming,
  loopToStart,
  replaceAllTracks,
  queueLength,
  isQueueEmpty,
} from '../models/Queue';
import { ShuffleMode, RepeatMode } from '../models/PlaybackState';
import {
  ShuffleConfig,
  createDefaultShuffleConfig,
  createRandomShuffleConfig,
} from '../models/ShuffleConfig';
import { SkipStatsMap, createEmptySkipStats } from '../models/SkipStats';
import {
  buildShuffledQueue,
  buildRandomQueue,
  createInitialShuffleState,
  createEmptySession,
  ShuffleState,
  SessionFeedback,
} from './ShuffleEngine';

/** @field The current queue state */
/** @field The active shuffle configuration */
/** @field The running shuffle state tracking history and frequency */
/** @field The active repeat mode */
/** @field Persistent skip statistics influencing shuffle scoring */
/** @field Loved track IDs (boosted by smart shuffle) */
/** @field This app session's skips and full listens (steer smart shuffle, never persisted) */
export interface QueueManagerState {
  readonly queue: Queue;
  readonly shuffleConfig: ShuffleConfig;
  readonly shuffleState: ShuffleState;
  readonly repeatMode: RepeatMode;
  readonly skipStats: SkipStatsMap;
  readonly favouriteIds: ReadonlySet<string>;
  readonly session: SessionFeedback;
}

/** @returns A fresh QueueManagerState with empty queue and default config */
export function createInitialQueueManagerState(): QueueManagerState {
  return {
    queue: createEmptyQueue(),
    shuffleConfig: createDefaultShuffleConfig(),
    shuffleState: createInitialShuffleState(),
    repeatMode: 'off',
    skipStats: createEmptySkipStats(),
    favouriteIds: new Set(),
    session: createEmptySession(),
  };
}

/** @param tracks - The tracks to load into the queue */
/** @param startIndex - Index to begin playback from */
/** @param shuffleMode - Whether to apply shuffle when loading */
/** @param state - Current QueueManagerState */
/** @returns Updated QueueManagerState with the new queue loaded */
export function loadQueue(
  tracks: Track[],
  startIndex: number,
  shuffleMode: ShuffleMode,
  state: QueueManagerState,
): QueueManagerState {
  if (tracks.length === 0) {
    return {
      ...state,
      queue: createEmptyQueue(),
      shuffleState: createInitialShuffleState(),
    };
  }

  const baseQueue = createQueue(tracks, startIndex);
  const startTrack =
    tracks[Math.max(0, Math.min(startIndex, tracks.length - 1))];

  if (shuffleMode === 'off') {
    return {
      ...state,
      queue: baseQueue,
      shuffleState: createInitialShuffleState(),
    };
  }

  return applyShuffle({ ...state, queue: baseQueue }, shuffleMode, startTrack);
}

/** @param state - Current QueueManagerState */
/** @returns The currently active track or null */
export function currentTrack(state: QueueManagerState): Track | null {
  return getCurrentTrack(state.queue);
}

/** @param state - Current QueueManagerState */
/** @returns Updated QueueManagerState advanced to the next track, respecting repeat mode */
export function next(state: QueueManagerState): QueueManagerState {
  if (isQueueEmpty(state.queue)) {
    return state;
  }

  if (state.repeatMode === 'one') {
    return state;
  }

  if (hasNext(state.queue)) {
    return {
      ...state,
      queue: advanceToNext(state.queue),
    };
  }

  if (state.repeatMode === 'all') {
    return {
      ...state,
      queue: loopToStart(state.queue),
    };
  }

  return state;
}

/** @param state - Current QueueManagerState */
/** @returns Updated QueueManagerState moved to the previous track */
export function previous(state: QueueManagerState): QueueManagerState {
  if (isQueueEmpty(state.queue)) {
    return state;
  }

  if (hasPrevious(state.queue)) {
    return {
      ...state,
      queue: returnToPrevious(state.queue),
    };
  }

  if (state.repeatMode === 'all') {
    const lastIndex = queueLength(state.queue) - 1;
    return {
      ...state,
      queue: jumpToIndex(state.queue, lastIndex),
    };
  }

  return state;
}

/** @param state - Current QueueManagerState */
/** @param index - Target index to skip to */
/** @returns Updated QueueManagerState jumped to the given index */
export function skipToIndex(
  state: QueueManagerState,
  index: number,
): QueueManagerState {
  return {
    ...state,
    queue: jumpToIndex(state.queue, index),
  };
}

/** @param state - Current QueueManagerState */
/** @param trackId - The ID of the track to skip to */
/** @returns Updated QueueManagerState jumped to the track with the given ID */
export function skipToTrack(
  state: QueueManagerState,
  trackId: string,
): QueueManagerState {
  return {
    ...state,
    queue: jumpToTrack(state.queue, trackId),
  };
}

/** @param state - Current QueueManagerState */
/** @param mode - The shuffle mode to enable */
/** @param anchor - Optional track to keep at the front of the shuffled queue */
/** @returns Updated QueueManagerState with shuffle applied */
export function applyShuffle(
  state: QueueManagerState,
  mode: ShuffleMode,
  anchor?: Track | null,
): QueueManagerState {
  if (mode === 'off') {
    return disableShuffle(state);
  }

  const tracks = [...state.queue.originalOrder];
  if (tracks.length === 0) {
    return state;
  }

  const anchorTrack = anchor ?? currentTrack(state);
  const config =
    mode === 'random' ? createRandomShuffleConfig() : state.shuffleConfig;

  const shuffled =
    mode === 'random'
      ? buildRandomQueue(tracks, anchorTrack, config.seed)
      : buildShuffledQueue(tracks, anchorTrack, config, state.skipStats, {
          favouriteIds: state.favouriteIds,
          session: state.session,
        });

  return {
    ...state,
    queue: applyShuffledOrder(state.queue, [...shuffled.tracks]),
    shuffleConfig: { ...config, mode },
    shuffleState: shuffled.finalState,
  };
}

/** @param state - Current QueueManagerState */
/** @returns Updated QueueManagerState with shuffle disabled and original order restored */
export function disableShuffle(state: QueueManagerState): QueueManagerState {
  return {
    ...state,
    queue: restoreOriginalOrder(state.queue),
    shuffleConfig: { ...state.shuffleConfig, mode: 'off' },
    shuffleState: createInitialShuffleState(),
  };
}

/** @param state - Current QueueManagerState */
/** @param mode - The new repeat mode to set */
/** @returns Updated QueueManagerState with the repeat mode changed */
export function setRepeat(
  state: QueueManagerState,
  mode: RepeatMode,
): QueueManagerState {
  return {
    ...state,
    repeatMode: mode,
  };
}

/** @param state - Current QueueManagerState */
/** @returns Updated QueueManagerState with repeat mode cycled to the next value */
export function cycleRepeat(state: QueueManagerState): QueueManagerState {
  const CycleMap: Record<RepeatMode, RepeatMode> = {
    off: 'all',
    all: 'one',
    one: 'off',
  };
  return setRepeat(state, CycleMap[state.repeatMode]);
}

/** @param state - Current QueueManagerState */
/** @param track - Track to add to the end of the queue */
/** @returns Updated QueueManagerState with the track appended */
export function enqueue(
  state: QueueManagerState,
  track: Track,
): QueueManagerState {
  return {
    ...state,
    queue: appendTrack(state.queue, track),
  };
}

/** @param state - Current QueueManagerState */
/** @param track - Track to insert as the next track after the current one */
/** @returns Updated QueueManagerState with the track inserted next */
export function playNext(
  state: QueueManagerState,
  track: Track,
): QueueManagerState {
  return {
    ...state,
    queue: insertNext(state.queue, track),
  };
}

/** @param state - Current QueueManagerState */
/** @param trackId - The ID of the track to remove from the queue */
/** @returns Updated QueueManagerState with the track removed */
export function dequeue(
  state: QueueManagerState,
  trackId: string,
): QueueManagerState {
  return {
    ...state,
    queue: removeFromQueue(state.queue, trackId),
  };
}

/** @param state - Current QueueManagerState */
/** @param newTracks - Replacement track list */
/** @param shuffleMode - Whether to shuffle the replacement tracks */
/** @returns Updated QueueManagerState with all tracks replaced */
export function replaceQueue(
  state: QueueManagerState,
  newTracks: Track[],
  shuffleMode: ShuffleMode,
): QueueManagerState {
  const replaced: QueueManagerState = {
    ...state,
    queue: replaceAllTracks(state.queue, newTracks),
    shuffleState: createInitialShuffleState(),
  };

  if (shuffleMode !== 'off' && newTracks.length > 0) {
    return applyShuffle(replaced, shuffleMode, newTracks[0]);
  }

  return replaced;
}

/** @param state - Current QueueManagerState */
/** @returns List of upcoming tracks after the current one */
export function upcomingTracks(state: QueueManagerState): Track[] {
  return getUpcoming(state.queue);
}

/** @param state - Current QueueManagerState */
/** @returns Whether advancing to the next track is possible given repeat settings */
export function canAdvance(state: QueueManagerState): boolean {
  if (isQueueEmpty(state.queue)) {
    return false;
  }
  if (state.repeatMode === 'one' || state.repeatMode === 'all') {
    return true;
  }
  return hasNext(state.queue);
}

/** @param state - Current QueueManagerState */
/** @returns Whether going back to the previous track is possible given repeat settings */
export function canGoBack(state: QueueManagerState): boolean {
  if (isQueueEmpty(state.queue)) {
    return false;
  }
  if (state.repeatMode === 'all') {
    return true;
  }
  return hasPrevious(state.queue);
}

/** @param state - Current QueueManagerState */
/** @returns Total number of tracks currently in the queue */
export function totalTracks(state: QueueManagerState): number {
  return queueLength(state.queue);
}

/** @param state - Current QueueManagerState */
/** @returns The zero-based index of the currently active track */
export function currentIndex(state: QueueManagerState): number {
  return state.queue.currentIndex;
}

/** @param state - Current QueueManagerState */
/** @param config - New shuffle configuration to apply */
/** @returns Updated QueueManagerState with the shuffle config replaced */
export function updateShuffleConfig(
  state: QueueManagerState,
  config: ShuffleConfig,
): QueueManagerState {
  const updated: QueueManagerState = {
    ...state,
    shuffleConfig: config,
  };

  if (config.mode !== 'off' && !isQueueEmpty(state.queue)) {
    return applyShuffle(updated, config.mode);
  }

  return updated;
}

/** @param state - Current QueueManagerState */
/** @returns Updated QueueManagerState with shuffle re-applied using fresh randomization */
export function reshuffle(state: QueueManagerState): QueueManagerState {
  if (state.shuffleConfig.mode === 'off') {
    return state;
  }

  return applyShuffle(
    { ...state, shuffleState: createInitialShuffleState() },
    state.shuffleConfig.mode,
  );
}

/** @param state - Current QueueManagerState */
/** @param skipStats - Updated skip statistics map to apply */
/** @returns Updated QueueManagerState with new skip stats */
export function updateSkipStats(
  state: QueueManagerState,
  skipStats: SkipStatsMap,
): QueueManagerState {
  return {
    ...state,
    skipStats,
  };
}

/** How many already-played tracks feed spacing and vibe continuity when re-planning. */
const ReplanHistory = 12;
/** How many upcoming tracks a re-plan reorders; later ones keep their order. */
export const ReplanWindow = 150;

/** @param state - Current QueueManagerState */
/** @returns State with everything after the current track re-ordered by smart shuffle using the latest session feedback, or the same state when not applicable */
export function replanUpcoming(state: QueueManagerState): QueueManagerState {
  const { queue } = state;
  if (state.shuffleConfig.mode !== 'smart' || queue.currentIndex < 0) {
    return state;
  }
  const upcoming = queue.tracks.slice(queue.currentIndex + 1);
  if (upcoming.length < 2) {
    return state;
  }
  const history = queue.tracks.slice(
    Math.max(0, queue.currentIndex + 1 - ReplanHistory),
    queue.currentIndex + 1,
  );
  const planned = buildShuffledQueue(upcoming, null, state.shuffleConfig, state.skipStats, {
    favouriteIds: state.favouriteIds,
    session: state.session,
    history,
    limit: ReplanWindow,
  });
  return {
    ...state,
    queue: {
      ...queue,
      tracks: [...queue.tracks.slice(0, queue.currentIndex + 1), ...planned.tracks],
    },
  };
}

/** @param state - Current QueueManagerState */
/** @param session - Updated session feedback */
/** @returns State with the new session feedback applied */
export function updateSession(
  state: QueueManagerState,
  session: SessionFeedback,
): QueueManagerState {
  return { ...state, session };
}

/** @param state - Current QueueManagerState */
/** @param favouriteIds - Current loved track IDs */
/** @returns State with favourites applied */
export function updateFavourites(
  state: QueueManagerState,
  favouriteIds: ReadonlySet<string>,
): QueueManagerState {
  return { ...state, favouriteIds };
}

/** @param state - Current QueueManagerState */
/** @param tracksById - Latest track objects (e.g. with fresh analysis) */
/** @returns State whose queue references the latest track objects */
export function refreshQueueTracks(
  state: QueueManagerState,
  tracksById: ReadonlyMap<string, Track>,
): QueueManagerState {
  const { queue } = state;
  if (queue.tracks.length === 0) {
    return state;
  }
  const swap = (list: readonly Track[]) => list.map(t => tracksById.get(t.id) ?? t);
  return {
    ...state,
    queue: { ...queue, tracks: swap(queue.tracks), originalOrder: swap(queue.originalOrder) },
  };
}
