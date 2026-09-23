export { isSupportedFormat, createTrack } from './models/Track';
export type { Track, TrackFormat } from './models/Track';

export {
  createPlaylist,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
  reorderPlaylistTrack,
  resolvePlaylistTracks,
} from './models/Playlist';
export type { Playlist } from './models/Playlist';

export {
  createInitialPlaybackState,
  setPlaying,
  setPaused,
  setResumed,
  setStopped,
  seekTo,
  updatePosition,
  setVolume,
  toggleMute,
  cycleRepeatMode,
  setShuffleMode,
  setPlaybackRate,
  setError,
  isActive,
  hasTrackLoaded,
} from './models/PlaybackState';
export type {
  PlaybackState,
  PlaybackStatus,
  RepeatMode,
  ShuffleMode,
} from './models/PlaybackState';

export {
  createEmptyQueue,
  createQueue,
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
  queueLength,
  isQueueEmpty,
  getUpcoming,
  loopToStart,
  replaceAllTracks,
} from './models/Queue';
export type { Queue } from './models/Queue';

export {
  createDefaultShuffleConfig,
  createShuffleConfig,
  createRandomShuffleConfig,
  isValidShuffleConfig,
  withShuffleMode,
  withSeed,
  withHistoryWindow,
  withRandomnessFactor,
} from './models/ShuffleConfig';
export type { ShuffleConfig } from './models/ShuffleConfig';

export {
  createInitialShuffleState,
  recordSelection,
  computeTrackScore,
  selectNextTrack,
  buildShuffledQueue,
  buildRandomQueue,
  resetShuffleState,
  hasCompletedCycle,
} from './engine/ShuffleEngine';
export type {
  ShuffleState,
  ShuffleResult,
  ShuffledQueue,
} from './engine/ShuffleEngine';

export {
  createInitialQueueManagerState,
  loadQueue,
  currentTrack,
  next,
  previous,
  skipToIndex,
  skipToTrack,
  applyShuffle,
  disableShuffle,
  setRepeat,
  cycleRepeat,
  enqueue,
  playNext,
  dequeue,
  replaceQueue,
  upcomingTracks,
  canAdvance,
  canGoBack,
  totalTracks,
  currentIndex,
  updateShuffleConfig,
  reshuffle,
} from './engine/QueueManager';
export type { QueueManagerState } from './engine/QueueManager';

export type {
  IAudioPort,
  AudioEventCallbacks,
  AudioPortState,
} from './ports/IAudioPort';
export type {
  IFileSystemPort,
  FileEntry,
  DirectoryScanResult,
} from './ports/IFileSystemPort';
export type {
  IMetadataPort,
  TrackMetadata,
  MetadataParseResult,
} from './ports/IMetadataPort';
export type {
  IStoragePort,
  PersistedPlaybackState,
  LibraryScanMeta,
} from './ports/IStoragePort';
export type { IBpmPort } from './ports/IBpmPort';
export type { ISkipStatsPort } from './ports/ISkipStatsPort';

export type { BpmMode } from './models/ShuffleConfig';
export {
  withBpmMode,
  withBpmTolerance,
  withBpmPenalty,
  withSkipPenalty,
} from './models/ShuffleConfig';

export type { SkipRecord, SkipStatsMap } from './models/SkipStats';
export {
  createEmptySkipStats,
  createSkipRecord,
  recordSkip,
  recordPlay,
  computeRawSkipRate,
  computeDecayedSkipRate,
  computeAvgListenPercent,
  isFrequentlySkipped,
  computeSkipPenalty,
  serializeSkipStats,
  deserializeSkipStats,
  pruneStaleRecords,
  mergeSkipStats,
} from './models/SkipStats';

export { updateSkipStats } from './engine/QueueManager';
