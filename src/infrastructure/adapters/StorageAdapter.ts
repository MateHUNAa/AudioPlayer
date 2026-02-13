import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track } from '../../domain/models/Track';
import { Playlist } from '../../domain/models/Playlist';
import { ShuffleConfig } from '../../domain/models/ShuffleConfig';
import {
  IStoragePort,
  PersistedPlaybackState,
  LibraryScanMeta,
} from '../../domain/ports/IStoragePort';

const StorageKeys = {
  tracks: '@audioplayer/tracks',
  playlists: '@audioplayer/playlists',
  playbackState: '@audioplayer/playback_state',
  shuffleConfig: '@audioplayer/shuffle_config',
  scanMeta: '@audioplayer/scan_meta',
  recentlyPlayed: '@audioplayer/recently_played',
} as const;

const MaxChunkSize = 500;

/** @param key - The storage key prefix for chunked data */
/** @param index - The chunk index */
/** @returns A namespaced chunk key for AsyncStorage */
function chunkKey(key: string, index: number): string {
  return `${key}__chunk_${index}`;
}

/** @param data - Array of items to split into serializable chunks */
/** @param size - Maximum number of items per chunk */
/** @returns Array of sub-arrays each containing at most `size` items */
function splitIntoChunks<T>(data: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < data.length; i += size) {
    chunks.push(data.slice(i, i + size));
  }
  return chunks;
}

export class StorageAdapter implements IStoragePort {
  /** @param tracks - Array of Track models to persist */
  async saveTracks(tracks: readonly Track[]): Promise<void> {
    const chunks = splitIntoChunks(tracks, MaxChunkSize);
    const chunkCount = chunks.length;

    const pairs: [string, string][] = [
      [StorageKeys.tracks, JSON.stringify({ chunkCount, total: tracks.length })],
    ];

    for (let i = 0; i < chunkCount; i++) {
      pairs.push([chunkKey(StorageKeys.tracks, i), JSON.stringify(chunks[i])]);
    }

    await AsyncStorage.multiSet(pairs);

    const previousMeta = await AsyncStorage.getItem(StorageKeys.tracks);
    if (previousMeta) {
      try {
        const prevParsed = JSON.parse(previousMeta) as { chunkCount: number };
        for (let i = chunkCount; i < prevParsed.chunkCount; i++) {
          await AsyncStorage.removeItem(chunkKey(StorageKeys.tracks, i));
        }
      } catch {
        /* previous meta was not chunked, ignore */
      }
    }
  }

  /** @returns All persisted tracks from local storage */
  async loadTracks(): Promise<Track[]> {
    const metaRaw = await AsyncStorage.getItem(StorageKeys.tracks);
    if (!metaRaw) {
      return [];
    }

    try {
      const meta = JSON.parse(metaRaw) as { chunkCount: number; total: number };

      if (typeof meta.chunkCount !== 'number') {
        const directParsed = JSON.parse(metaRaw);
        if (Array.isArray(directParsed)) {
          return directParsed as Track[];
        }
        return [];
      }

      const keys: string[] = [];
      for (let i = 0; i < meta.chunkCount; i++) {
        keys.push(chunkKey(StorageKeys.tracks, i));
      }

      const pairs = await AsyncStorage.multiGet(keys);
      const allTracks: Track[] = [];

      for (const [, value] of pairs) {
        if (value) {
          const chunk = JSON.parse(value) as Track[];
          allTracks.push(...chunk);
        }
      }

      return allTracks;
    } catch {
      return [];
    }
  }

  /** @param trackId - ID of the track to remove from storage */
  async removeTrack(trackId: string): Promise<void> {
    const tracks = await this.loadTracks();
    const filtered = tracks.filter(t => t.id !== trackId);
    await this.saveTracks(filtered);
  }

  /** @returns Whether the track index has been persisted at least once */
  async hasTrackIndex(): Promise<boolean> {
    const metaRaw = await AsyncStorage.getItem(StorageKeys.tracks);
    return metaRaw !== null;
  }

  /** @param playlists - Array of Playlist models to persist */
  async savePlaylists(playlists: readonly Playlist[]): Promise<void> {
    await AsyncStorage.setItem(StorageKeys.playlists, JSON.stringify(playlists));
  }

  /** @returns All persisted playlists from local storage */
  async loadPlaylists(): Promise<Playlist[]> {
    const raw = await AsyncStorage.getItem(StorageKeys.playlists);
    if (!raw) {
      return [];
    }

    try {
      return JSON.parse(raw) as Playlist[];
    } catch {
      return [];
    }
  }

  /** @param playlistId - ID of the playlist to remove from storage */
  async removePlaylist(playlistId: string): Promise<void> {
    const playlists = await this.loadPlaylists();
    const filtered = playlists.filter(p => p.id !== playlistId);
    await this.savePlaylists(filtered);
  }

  /** @param state - Playback state snapshot to persist for session restoration */
  async savePlaybackState(state: PersistedPlaybackState): Promise<void> {
    await AsyncStorage.setItem(StorageKeys.playbackState, JSON.stringify(state));
  }

  /** @returns Last persisted playback state or null if none saved */
  async loadPlaybackState(): Promise<PersistedPlaybackState | null> {
    const raw = await AsyncStorage.getItem(StorageKeys.playbackState);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as PersistedPlaybackState;
    } catch {
      return null;
    }
  }

  /** @param config - Shuffle configuration to persist across sessions */
  async saveShuffleConfig(config: ShuffleConfig): Promise<void> {
    await AsyncStorage.setItem(StorageKeys.shuffleConfig, JSON.stringify(config));
  }

  /** @returns Last persisted shuffle configuration or null if none saved */
  async loadShuffleConfig(): Promise<ShuffleConfig | null> {
    const raw = await AsyncStorage.getItem(StorageKeys.shuffleConfig);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as ShuffleConfig;
    } catch {
      return null;
    }
  }

  /** @param meta - Library scan metadata to persist */
  async saveScanMeta(meta: LibraryScanMeta): Promise<void> {
    await AsyncStorage.setItem(StorageKeys.scanMeta, JSON.stringify(meta));
  }

  /** @returns Last persisted scan metadata or null if never scanned */
  async loadScanMeta(): Promise<LibraryScanMeta | null> {
    const raw = await AsyncStorage.getItem(StorageKeys.scanMeta);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as LibraryScanMeta;
    } catch {
      return null;
    }
  }

  /** @param trackIds - Ordered list of recently played track IDs to persist */
  async saveRecentlyPlayed(trackIds: readonly string[]): Promise<void> {
    await AsyncStorage.setItem(StorageKeys.recentlyPlayed, JSON.stringify(trackIds));
  }

  /** @returns Persisted list of recently played track IDs */
  async loadRecentlyPlayed(): Promise<string[]> {
    const raw = await AsyncStorage.getItem(StorageKeys.recentlyPlayed);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as string[];
      }
      return [];
    } catch {
      return [];
    }
  }

  /** @returns Resolves when all persisted data is wiped */
  async clearAll(): Promise<void> {
    const metaRaw = await AsyncStorage.getItem(StorageKeys.tracks);
    const chunkKeysToRemove: string[] = [];

    if (metaRaw) {
      try {
        const meta = JSON.parse(metaRaw) as { chunkCount: number };
        if (typeof meta.chunkCount === 'number') {
          for (let i = 0; i < meta.chunkCount; i++) {
            chunkKeysToRemove.push(chunkKey(StorageKeys.tracks, i));
          }
        }
      } catch {
        /* no chunks to clean */
      }
    }

    const allKeys = [
      StorageKeys.tracks,
      StorageKeys.playlists,
      StorageKeys.playbackState,
      StorageKeys.shuffleConfig,
      StorageKeys.scanMeta,
      StorageKeys.recentlyPlayed,
      ...chunkKeysToRemove,
    ];

    await AsyncStorage.multiRemove(allKeys);
  }

  /** @param key - Arbitrary string key for generic storage */
  /** @param value - JSON-serializable value to store */
  async setItem<T>(key: string, value: T): Promise<void> {
    const namespacedKey = `@audioplayer/custom/${key}`;
    await AsyncStorage.setItem(namespacedKey, JSON.stringify(value));
  }

  /** @param key - Arbitrary string key to retrieve */
  /** @returns The stored value deserialized from JSON, or null if not found */
  async getItem<T>(key: string): Promise<T | null> {
    const namespacedKey = `@audioplayer/custom/${key}`;
    const raw = await AsyncStorage.getItem(namespacedKey);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /** @param key - Arbitrary string key to remove */
  async removeItem(key: string): Promise<void> {
    const namespacedKey = `@audioplayer/custom/${key}`;
    await AsyncStorage.removeItem(namespacedKey);
  }
}
