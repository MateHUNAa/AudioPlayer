import { Track } from './Track';

/** @field Ordered list of tracks in the queue */
/** @field Index of the currently active track */
/** @field Original track order before any shuffle was applied */
/** @field List of track IDs that have been played in this session */
export interface Queue {
  readonly tracks: readonly Track[];
  readonly currentIndex: number;
  readonly originalOrder: readonly Track[];
  readonly history: readonly string[];
}

const EmptyQueue: Queue = {
  tracks: [],
  currentIndex: -1,
  originalOrder: [],
  history: [],
};

/** @returns A fresh empty Queue */
export function createEmptyQueue(): Queue {
  return { ...EmptyQueue };
}

/** @param tracks - Tracks to populate the queue with */
/** @param startIndex - Optional index to start playback from */
/** @returns A new Queue populated with the provided tracks */
export function createQueue(tracks: Track[], startIndex: number = 0): Queue {
  if (tracks.length === 0) {
    return createEmptyQueue();
  }
  const clampedIndex = Math.max(0, Math.min(startIndex, tracks.length - 1));
  return {
    tracks: [...tracks],
    currentIndex: clampedIndex,
    originalOrder: [...tracks],
    history: [],
  };
}

/** @param queue - The current queue state */
/** @returns The currently active Track or null if queue is empty */
export function getCurrentTrack(queue: Queue): Track | null {
  if (queue.currentIndex < 0 || queue.currentIndex >= queue.tracks.length) {
    return null;
  }
  return queue.tracks[queue.currentIndex];
}

/** @param queue - The current queue state */
/** @returns Whether there is a next track available */
export function hasNext(queue: Queue): boolean {
  return queue.currentIndex < queue.tracks.length - 1;
}

/** @param queue - The current queue state */
/** @returns Whether there is a previous track available */
export function hasPrevious(queue: Queue): boolean {
  return queue.currentIndex > 0;
}

/** @param queue - The current queue state */
/** @returns Updated Queue advanced to the next track with history recorded */
export function advanceToNext(queue: Queue): Queue {
  if (!hasNext(queue)) {
    return queue;
  }

  const currentTrack = getCurrentTrack(queue);
  const updatedHistory = currentTrack
    ? [...queue.history, currentTrack.id]
    : [...queue.history];

  return {
    ...queue,
    currentIndex: queue.currentIndex + 1,
    history: updatedHistory,
  };
}

/** @param queue - The current queue state */
/** @returns Updated Queue moved back to the previous track */
export function returnToPrevious(queue: Queue): Queue {
  if (!hasPrevious(queue)) {
    return queue;
  }

  const newHistory = [...queue.history];
  newHistory.pop();

  return {
    ...queue,
    currentIndex: queue.currentIndex - 1,
    history: newHistory,
  };
}

/** @param queue - The current queue state */
/** @param index - The target index to jump to */
/** @returns Updated Queue jumped to the specified index */
export function jumpToIndex(queue: Queue, index: number): Queue {
  if (index < 0 || index >= queue.tracks.length || index === queue.currentIndex) {
    return queue;
  }

  const currentTrack = getCurrentTrack(queue);
  const updatedHistory = currentTrack
    ? [...queue.history, currentTrack.id]
    : [...queue.history];

  return {
    ...queue,
    currentIndex: index,
    history: updatedHistory,
  };
}

/** @param queue - The current queue state */
/** @param trackId - The track ID to find and jump to */
/** @returns Updated Queue jumped to the track with the given ID, or unchanged if not found */
export function jumpToTrack(queue: Queue, trackId: string): Queue {
  const index = queue.tracks.findIndex(t => t.id === trackId);
  if (index === -1) {
    return queue;
  }
  return jumpToIndex(queue, index);
}

/** @param queue - The current queue state */
/** @param shuffledTracks - The new shuffled track ordering */
/** @returns Updated Queue with shuffled track order preserving original order reference */
export function applyShuffledOrder(queue: Queue, shuffledTracks: Track[]): Queue {
  const currentTrack = getCurrentTrack(queue);
  const newIndex = currentTrack
    ? shuffledTracks.findIndex(t => t.id === currentTrack.id)
    : 0;

  return {
    ...queue,
    tracks: [...shuffledTracks],
    currentIndex: Math.max(0, newIndex),
    history: [],
  };
}

/** @param queue - The current queue state */
/** @returns Updated Queue restored to the original track order */
export function restoreOriginalOrder(queue: Queue): Queue {
  const currentTrack = getCurrentTrack(queue);
  const newIndex = currentTrack
    ? queue.originalOrder.findIndex(t => t.id === currentTrack.id)
    : 0;

  return {
    ...queue,
    tracks: [...queue.originalOrder],
    currentIndex: Math.max(0, newIndex),
    history: [],
  };
}

/** @param queue - The current queue state */
/** @param track - The track to append to the end of the queue */
/** @returns Updated Queue with the track appended */
export function appendTrack(queue: Queue, track: Track): Queue {
  return {
    ...queue,
    tracks: [...queue.tracks, track],
    originalOrder: [...queue.originalOrder, track],
  };
}

/** @param queue - The current queue state */
/** @param track - The track to insert immediately after the current track */
/** @returns Updated Queue with the track inserted as next up */
export function insertNext(queue: Queue, track: Track): Queue {
  const insertAt = queue.currentIndex + 1;
  const newTracks = [...queue.tracks];
  newTracks.splice(insertAt, 0, track);

  return {
    ...queue,
    tracks: newTracks,
    originalOrder: [...queue.originalOrder, track],
  };
}

/** @param queue - The current queue state */
/** @param trackId - The ID of the track to remove */
/** @returns Updated Queue with the specified track removed */
export function removeFromQueue(queue: Queue, trackId: string): Queue {
  const removeIndex = queue.tracks.findIndex(t => t.id === trackId);
  if (removeIndex === -1) {
    return queue;
  }

  const newTracks = queue.tracks.filter(t => t.id !== trackId);
  const newOriginal = queue.originalOrder.filter(t => t.id !== trackId);

  let newIndex = queue.currentIndex;
  if (removeIndex < queue.currentIndex) {
    newIndex = queue.currentIndex - 1;
  } else if (removeIndex === queue.currentIndex) {
    newIndex = Math.min(queue.currentIndex, newTracks.length - 1);
  }

  return {
    ...queue,
    tracks: newTracks,
    originalOrder: newOriginal,
    currentIndex: newTracks.length === 0 ? -1 : newIndex,
  };
}

/** @param queue - The current queue state */
/** @returns Total number of tracks in the queue */
export function queueLength(queue: Queue): number {
  return queue.tracks.length;
}

/** @param queue - The current queue state */
/** @returns Whether the queue has no tracks */
export function isQueueEmpty(queue: Queue): boolean {
  return queue.tracks.length === 0;
}

/** @param queue - The current queue state */
/** @returns List of tracks remaining after the current index */
export function getUpcoming(queue: Queue): Track[] {
  if (queue.currentIndex < 0 || queue.currentIndex >= queue.tracks.length - 1) {
    return [];
  }
  return queue.tracks.slice(queue.currentIndex + 1);
}

/** @param queue - The current queue state */
/** @returns Updated Queue looped back to the first track */
export function loopToStart(queue: Queue): Queue {
  if (queue.tracks.length === 0) {
    return queue;
  }

  const currentTrack = getCurrentTrack(queue);
  const updatedHistory = currentTrack
    ? [...queue.history, currentTrack.id]
    : [...queue.history];

  return {
    ...queue,
    currentIndex: 0,
    history: updatedHistory,
  };
}

/** @param queue - The current queue state */
/** @param newTracks - The replacement track list */
/** @returns Updated Queue with tracks replaced and original order updated */
export function replaceAllTracks(queue: Queue, newTracks: Track[]): Queue {
  if (newTracks.length === 0) {
    return createEmptyQueue();
  }
  return {
    tracks: [...newTracks],
    currentIndex: 0,
    originalOrder: [...newTracks],
    history: [],
  };
}
