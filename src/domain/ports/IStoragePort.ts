import { Track } from '../models/Track';
import { Playlist } from '../models/Playlist';
import { ShuffleConfig } from '../models/ShuffleConfig';
import { RepeatMode, ShuffleMode } from '../models/PlaybackState';

/** @field Last played track ID */
/** @field Last playback position in seconds */
/** @field Last active shuffle mode */
/** @field Last active repeat mode */
/** @field Volume level at time of save */
export interface PersistedPlaybackState {
  readonly lastTrackId: string | null;
  readonly lastPosition: number;
  readonly shuffleMode: ShuffleMode;
  readonly repeatMode: RepeatMode;
  readonly volume: number;
}

/** @field Timestamp of the last completed library scan */
/** @field Total number of tracks found during last scan */
/** @field Directories that were scanned */
export interface LibraryScanMeta {
  readonly lastScanTimestamp: number;
  readonly totalTracksFound: number;
  readonly scannedDirectories: readonly string[];
}

/** @interface Contract for local persistence of app data */
export interface IStoragePort {
  /** @param tracks - Array of Track models to persist */
  saveTracks(tracks: readonly Track[]): Promise<void>;

  /** @returns All persisted tracks from local storage */
  loadTracks(): Promise<Track[]>;

  /** @param trackId - ID of the track to remove from storage */
  removeTrack(trackId: string): Promise<void>;

  /** @returns Whether the track index has been persisted at least once */
  hasTrackIndex(): Promise<boolean>;

  /** @param playlists - Array of Playlist models to persist */
  savePlaylists(playlists: readonly Playlist[]): Promise<void>;

  /** @returns All persisted playlists from local storage */
  loadPlaylists(): Promise<Playlist[]>;

  /** @param playlistId - ID of the playlist to remove from storage */
  removePlaylist(playlistId: string): Promise<void>;

  /** @param state - Playback state snapshot to persist for session restoration */
  savePlaybackState(state: PersistedPlaybackState): Promise<void>;

  /** @returns Last persisted playback state or null if none saved */
  loadPlaybackState(): Promise<PersistedPlaybackState | null>;

  /** @param config - Shuffle configuration to persist across sessions */
  saveShuffleConfig(config: ShuffleConfig): Promise<void>;

  /** @returns Last persisted shuffle configuration or null if none saved */
  loadShuffleConfig(): Promise<ShuffleConfig | null>;

  /** @param meta - Library scan metadata to persist */
  saveScanMeta(meta: LibraryScanMeta): Promise<void>;

  /** @returns Last persisted scan metadata or null if never scanned */
  loadScanMeta(): Promise<LibraryScanMeta | null>;

  /** @param trackIds - Ordered list of recently played track IDs to persist */
  saveRecentlyPlayed(trackIds: readonly string[]): Promise<void>;

  /** @returns Persisted list of recently played track IDs */
  loadRecentlyPlayed(): Promise<string[]>;

  /** @returns Resolves when all persisted data is wiped */
  clearAll(): Promise<void>;

  /** @param key - Arbitrary string key for generic storage */
  /** @param value - JSON-serializable value to store */
  setItem<T>(key: string, value: T): Promise<void>;

  /** @param key - Arbitrary string key to retrieve */
  /** @returns The stored value deserialized from JSON, or null if not found */
  getItem<T>(key: string): Promise<T | null>;

  /** @param key - Arbitrary string key to remove */
  removeItem(key: string): Promise<void>;
}
