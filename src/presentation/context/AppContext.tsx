import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { Track } from '../../domain/models/Track';
import {
  PlaybackState,
  createInitialPlaybackState,
  updatePosition,
  setPlaying,
  ShuffleMode,
} from '../../domain/models/PlaybackState';
import {
  QueueManagerState,
  createInitialQueueManagerState,
  currentTrack,
  upcomingTracks,
  totalTracks,
  currentIndex,
  loadQueue,
  skipToTrack,
} from '../../domain/engine/QueueManager';
import { Playlist } from '../../domain/models/Playlist';
import { Container } from '../../di/Container';
import { PermissionUtils } from '../../infrastructure/utils/PermissionUtils';

type AppAction =
  | { type: 'SET_TRACKS'; tracks: Track[] }
  | { type: 'SET_PLAYBACK_STATE'; playbackState: PlaybackState }
  | { type: 'SET_QUEUE_STATE'; queueState: QueueManagerState }
  | { type: 'UPDATE_POSITION'; position: number }
  | { type: 'UPDATE_DURATION'; duration: number }
  | { type: 'SET_SCANNING'; scanning: boolean }
  | {
      type: 'SET_SCAN_PROGRESS';
      completed: number;
      total: number;
      currentFile: string;
    }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | {
      type: 'BATCH_UPDATE';
      playbackState: PlaybackState;
      queueState: QueueManagerState;
    }
  | { type: 'SET_FAVOURITES'; favouriteIds: ReadonlySet<string> }
  | { type: 'SET_PLAYLISTS'; playlists: Playlist[] };

interface AppState {
  readonly tracks: Track[];
  readonly trackMap: ReadonlyMap<string, Track>;
  readonly playbackState: PlaybackState;
  readonly queueManagerState: QueueManagerState;
  readonly isScanning: boolean;
  readonly scanProgress: {
    completed: number;
    total: number;
    currentFile: string;
  };
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly favouriteIds: ReadonlySet<string>;
  readonly playlists: Playlist[];
}

interface AppActions {
  readonly scanLibrary: (customPath?: string) => Promise<void>;
  readonly playTrack: (track: Track) => Promise<void>;
  readonly playTrackInQueue: (track: Track) => Promise<void>;
  readonly togglePlayback: () => Promise<void>;
  readonly nextTrack: () => Promise<void>;
  readonly previousTrack: () => Promise<void>;
  readonly seekTo: (positionSeconds: number) => Promise<void>;
  readonly seekByFraction: (fraction: number) => Promise<void>;
  readonly toggleShuffle: () => Promise<void>;
  readonly setShuffleMode: (mode: ShuffleMode) => Promise<void>;
  readonly initializePlayer: () => Promise<void>;
  readonly getCurrentTrack: () => Track | null;
  readonly getUpcoming: () => Track[];
  readonly getTotalTracks: () => number;
  readonly getCurrentIndex: () => number;
  readonly toggleFavourite: (trackId: string) => Promise<void>;
  readonly isFavourite: (trackId: string) => boolean;
  readonly getFavouriteTracks: () => Track[];
  readonly playCollection: (
    tracks: Track[],
    startIndex?: number,
  ) => Promise<void>;
  readonly createPlaylist: (name: string, trackIds?: string[]) => Promise<void>;
  readonly deletePlaylist: (playlistId: string) => Promise<void>;
  readonly renamePlaylist: (playlistId: string, name: string) => Promise<void>;
  readonly addToPlaylist: (
    playlistId: string,
    trackId: string,
  ) => Promise<void>;
  readonly removeFromPlaylist: (
    playlistId: string,
    trackId: string,
  ) => Promise<void>;
  readonly getPlaylistTracks: (playlistId: string) => Track[];
}

interface AppContextValue {
  readonly state: AppState;
  readonly actions: AppActions;
}

function buildTrackMap(tracks: Track[]): ReadonlyMap<string, Track> {
  const map = new Map<string, Track>();
  for (const track of tracks) {
    map.set(track.id, track);
  }
  return map;
}

const InitialScanProgress = {
  completed: 0,
  total: 0,
  currentFile: '',
} as const;

const FavouritesStorageKey = 'favourites' as const;

function createInitialAppState(): AppState {
  return {
    tracks: [],
    trackMap: new Map(),
    playbackState: createInitialPlaybackState(),
    queueManagerState: createInitialQueueManagerState(),
    isScanning: false,
    scanProgress: { ...InitialScanProgress },
    isLoading: true,
    error: null,
    favouriteIds: new Set(),
    playlists: [],
  };
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_TRACKS':
      return {
        ...state,
        tracks: action.tracks,
        trackMap: buildTrackMap(action.tracks),
      };

    case 'SET_PLAYBACK_STATE':
      return {
        ...state,
        playbackState: action.playbackState,
      };

    case 'SET_QUEUE_STATE':
      return {
        ...state,
        queueManagerState: action.queueState,
      };

    case 'UPDATE_POSITION':
      return {
        ...state,
        playbackState: updatePosition(state.playbackState, action.position),
      };

    case 'UPDATE_DURATION':
      return {
        ...state,
        playbackState: {
          ...state.playbackState,
          duration: action.duration,
        },
      };

    case 'SET_SCANNING':
      return {
        ...state,
        isScanning: action.scanning,
        scanProgress: action.scanning
          ? { ...InitialScanProgress }
          : state.scanProgress,
      };

    case 'SET_SCAN_PROGRESS':
      return {
        ...state,
        scanProgress: {
          completed: action.completed,
          total: action.total,
          currentFile: action.currentFile,
        },
      };

    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.loading,
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.error,
      };

    case 'BATCH_UPDATE':
      return {
        ...state,
        playbackState: action.playbackState,
        queueManagerState: action.queueState,
      };

    case 'SET_FAVOURITES':
      return {
        ...state,
        favouriteIds: action.favouriteIds,
      };

    case 'SET_PLAYLISTS':
      return {
        ...state,
        playlists: action.playlists,
      };

    default:
      return state;
  }
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(
    appReducer,
    undefined,
    createInitialAppState,
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  const handleActiveTrackChanged = useCallback((trackId: string | null) => {
    if (!trackId) {
      return;
    }

    const current = stateRef.current;
    const activeTrack = current.playbackState.currentTrack;

    if (activeTrack && activeTrack.id === trackId) {
      return;
    }

    const newTrack = current.trackMap.get(trackId) ?? null;
    if (!newTrack) {
      return;
    }

    const updatedQueueState = skipToTrack(current.queueManagerState, trackId);
    const updatedPlaybackState = setPlaying(current.playbackState, newTrack);

    dispatch({
      type: 'BATCH_UPDATE',
      playbackState: updatedPlaybackState,
      queueState: updatedQueueState,
    });

    const storagePort = Container.resolveStoragePort();
    storagePort
      .savePlaybackState({
        lastTrackId: newTrack.id,
        lastPosition: 0,
        shuffleMode: updatedPlaybackState.shuffleMode,
        repeatMode: updatedPlaybackState.repeatMode,
        volume: updatedPlaybackState.volume,
      })
      .catch(() => {});
  }, []);

  const initializePlayer = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING', loading: true });

      const audioPort = Container.resolveAudioPort();
      await audioPort.initialize();

      audioPort.registerCallbacks({
        onPositionUpdate: (position: number) => {
          dispatch({ type: 'UPDATE_POSITION', position });
        },
        onDurationUpdate: (duration: number) => {
          dispatch({ type: 'UPDATE_DURATION', duration });
        },
        onError: (error: string) => {
          dispatch({ type: 'SET_ERROR', error });
        },
        onActiveTrackChanged: handleActiveTrackChanged,
      });

      const storagePort = Container.resolveStoragePort();
      const persistedTracks = await storagePort.loadTracks();

      if (persistedTracks.length > 0) {
        dispatch({ type: 'SET_TRACKS', tracks: persistedTracks });
      }

      const persistedConfig = await storagePort.loadShuffleConfig();
      if (persistedConfig) {
        dispatch({
          type: 'SET_QUEUE_STATE',
          queueState: {
            ...stateRef.current.queueManagerState,
            shuffleConfig: persistedConfig,
          },
        });
      }

      const savedFavourites = await storagePort.getItem<string[]>(
        FavouritesStorageKey,
      );
      if (savedFavourites && Array.isArray(savedFavourites)) {
        dispatch({
          type: 'SET_FAVOURITES',
          favouriteIds: new Set(savedFavourites),
        });
      }

      const savedPlaylists = await storagePort.loadPlaylists();
      if (savedPlaylists.length > 0) {
        dispatch({ type: 'SET_PLAYLISTS', playlists: savedPlaylists });
      }

      dispatch({ type: 'SET_LOADING', loading: false });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to initialize player';
      dispatch({ type: 'SET_ERROR', error: message });
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, [handleActiveTrackChanged]);

  const scanLibrary = useCallback(async (customPath?: string) => {
    try {
      dispatch({ type: 'SET_SCANNING', scanning: true });
      dispatch({ type: 'SET_ERROR', error: null });

      const permResult = await PermissionUtils.ensureStoragePermissions();
      if (!permResult.allGranted) {
        dispatch({
          type: 'SET_ERROR',
          error: 'Storage permission is required to scan your music library.',
        });
        dispatch({ type: 'SET_SCANNING', scanning: false });
        return;
      }

      const scanUseCase = Container.resolveScanLibraryUseCase();
      await scanUseCase.execute(customPath, (completed, total, currentFile) => {
        dispatch({ type: 'SET_SCAN_PROGRESS', completed, total, currentFile });
      });

      const storagePort = Container.resolveStoragePort();
      const updatedTracks = await storagePort.loadTracks();
      dispatch({ type: 'SET_TRACKS', tracks: updatedTracks });

      dispatch({ type: 'SET_SCANNING', scanning: false });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to scan library';
      dispatch({ type: 'SET_ERROR', error: message });
      dispatch({ type: 'SET_SCANNING', scanning: false });
    }
  }, []);

  const playTrack = useCallback(async (track: Track) => {
    try {
      dispatch({ type: 'SET_ERROR', error: null });

      const useCase = Container.resolvePlayTrackUseCase();
      const result = await useCase.execute(
        track,
        stateRef.current.tracks,
        stateRef.current.playbackState,
        stateRef.current.queueManagerState,
      );

      dispatch({
        type: 'BATCH_UPDATE',
        playbackState: result.playbackState,
        queueState: result.queueManagerState,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to play track';
      dispatch({ type: 'SET_ERROR', error: message });
    }
  }, []);

  const playTrackInQueue = useCallback(async (track: Track) => {
    try {
      dispatch({ type: 'SET_ERROR', error: null });

      const useCase = Container.resolvePlayTrackUseCase();
      const result = await useCase.executeInQueue(
        track,
        stateRef.current.playbackState,
        stateRef.current.queueManagerState,
      );

      dispatch({
        type: 'BATCH_UPDATE',
        playbackState: result.playbackState,
        queueState: result.queueManagerState,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to play track in queue';
      dispatch({ type: 'SET_ERROR', error: message });
    }
  }, []);

  const togglePlayback = useCallback(async () => {
    try {
      dispatch({ type: 'SET_ERROR', error: null });

      const useCase = Container.resolveTogglePlaybackUseCase();
      const result = await useCase.execute(
        stateRef.current.playbackState,
        stateRef.current.queueManagerState,
      );

      dispatch({
        type: 'SET_PLAYBACK_STATE',
        playbackState: result.playbackState,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to toggle playback';
      dispatch({ type: 'SET_ERROR', error: message });
    }
  }, []);

  const nextTrack = useCallback(async () => {
    try {
      dispatch({ type: 'SET_ERROR', error: null });

      const useCase = Container.resolveNextTrackUseCase();
      const result = await useCase.execute(
        stateRef.current.playbackState,
        stateRef.current.queueManagerState,
      );

      dispatch({
        type: 'BATCH_UPDATE',
        playbackState: result.playbackState,
        queueState: result.queueManagerState,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to skip to next';
      dispatch({ type: 'SET_ERROR', error: message });
    }
  }, []);

  const previousTrack = useCallback(async () => {
    try {
      dispatch({ type: 'SET_ERROR', error: null });

      const useCase = Container.resolvePreviousTrackUseCase();
      const result = await useCase.execute(
        stateRef.current.playbackState,
        stateRef.current.queueManagerState,
      );

      dispatch({
        type: 'BATCH_UPDATE',
        playbackState: result.playbackState,
        queueState: result.queueManagerState,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to go to previous';
      dispatch({ type: 'SET_ERROR', error: message });
    }
  }, []);

  const seekTo = useCallback(async (positionSeconds: number) => {
    try {
      const useCase = Container.resolveSeekUseCase();
      const result = await useCase.execute(
        positionSeconds,
        stateRef.current.playbackState,
      );
      dispatch({
        type: 'SET_PLAYBACK_STATE',
        playbackState: result.playbackState,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to seek';
      dispatch({ type: 'SET_ERROR', error: message });
    }
  }, []);

  const seekByFraction = useCallback(async (fraction: number) => {
    try {
      const useCase = Container.resolveSeekUseCase();
      const result = await useCase.executeByFraction(
        fraction,
        stateRef.current.playbackState,
      );
      dispatch({
        type: 'SET_PLAYBACK_STATE',
        playbackState: result.playbackState,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to seek';
      dispatch({ type: 'SET_ERROR', error: message });
    }
  }, []);

  const toggleShuffle = useCallback(async () => {
    try {
      dispatch({ type: 'SET_ERROR', error: null });

      const useCase = Container.resolveToggleShuffleUseCase();
      const result = await useCase.execute(
        stateRef.current.playbackState,
        stateRef.current.queueManagerState,
      );

      dispatch({
        type: 'BATCH_UPDATE',
        playbackState: result.playbackState,
        queueState: result.queueManagerState,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to toggle shuffle';
      dispatch({ type: 'SET_ERROR', error: message });
    }
  }, []);

  const setShuffleMode = useCallback(async (mode: ShuffleMode) => {
    try {
      dispatch({ type: 'SET_ERROR', error: null });

      const useCase = Container.resolveToggleShuffleUseCase();
      const result = await useCase.setMode(
        mode,
        stateRef.current.playbackState,
        stateRef.current.queueManagerState,
      );

      dispatch({
        type: 'BATCH_UPDATE',
        playbackState: result.playbackState,
        queueState: result.queueManagerState,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to set shuffle mode';
      dispatch({ type: 'SET_ERROR', error: message });
    }
  }, []);

  const toggleFavourite = useCallback(async (trackId: string) => {
    const current = stateRef.current.favouriteIds;
    const updated = new Set(current);

    if (updated.has(trackId)) {
      updated.delete(trackId);
    } else {
      updated.add(trackId);
    }

    dispatch({ type: 'SET_FAVOURITES', favouriteIds: updated });

    const storagePort = Container.resolveStoragePort();
    await storagePort.setItem(FavouritesStorageKey, Array.from(updated));
  }, []);

  const isFavourite = useCallback((trackId: string): boolean => {
    return stateRef.current.favouriteIds.has(trackId);
  }, []);

  const getFavouriteTracks = useCallback((): Track[] => {
    const ids = stateRef.current.favouriteIds;
    return stateRef.current.tracks.filter(t => ids.has(t.id));
  }, []);

  const playCollection = useCallback(
    async (tracks: Track[], startIndex: number = 0) => {
      if (tracks.length === 0) {
        return;
      }

      try {
        dispatch({ type: 'SET_ERROR', error: null });

        const clampedIndex = Math.max(
          0,
          Math.min(startIndex, tracks.length - 1),
        );
        const startTrack = tracks[clampedIndex];

        const updatedQueueState = loadQueue(
          tracks,
          clampedIndex,
          stateRef.current.queueManagerState.shuffleConfig.mode,
          stateRef.current.queueManagerState,
        );

        const audioPort = Container.resolveAudioPort();
        await audioPort.setQueue(updatedQueueState.queue.tracks);
        await audioPort.play(startTrack);

        const updatedPlaybackState = setPlaying(
          stateRef.current.playbackState,
          startTrack,
        );

        dispatch({
          type: 'BATCH_UPDATE',
          playbackState: updatedPlaybackState,
          queueState: updatedQueueState,
        });

        const storagePort = Container.resolveStoragePort();
        await storagePort.savePlaybackState({
          lastTrackId: startTrack.id,
          lastPosition: 0,
          shuffleMode: updatedPlaybackState.shuffleMode,
          repeatMode: updatedPlaybackState.repeatMode,
          volume: updatedPlaybackState.volume,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to play collection';
        dispatch({ type: 'SET_ERROR', error: message });
      }
    },
    [],
  );

  const createPlaylistAction = useCallback(
    async (name: string, trackIds: string[] = []) => {
      const { createPlaylist: domainCreate } = await import(
        '../../domain/models/Playlist'
      );
      const newPlaylist = domainCreate(name, trackIds);

      const updated = [...stateRef.current.playlists, newPlaylist];
      dispatch({ type: 'SET_PLAYLISTS', playlists: updated });

      const storagePort = Container.resolveStoragePort();
      await storagePort.savePlaylists(updated);
    },
    [],
  );

  const deletePlaylist = useCallback(async (playlistId: string) => {
    const updated = stateRef.current.playlists.filter(p => p.id !== playlistId);
    dispatch({ type: 'SET_PLAYLISTS', playlists: updated });

    const storagePort = Container.resolveStoragePort();
    await storagePort.savePlaylists(updated);
  }, []);

  const renamePlaylist = useCallback(
    async (playlistId: string, name: string) => {
      const updated = stateRef.current.playlists.map(p =>
        p.id === playlistId ? { ...p, name, updatedAt: Date.now() } : p,
      );
      dispatch({ type: 'SET_PLAYLISTS', playlists: updated });

      const storagePort = Container.resolveStoragePort();
      await storagePort.savePlaylists(updated);
    },
    [],
  );

  const addToPlaylist = useCallback(
    async (playlistId: string, trackId: string) => {
      const { addTrackToPlaylist } = await import(
        '../../domain/models/Playlist'
      );
      const updated = stateRef.current.playlists.map(p =>
        p.id === playlistId ? addTrackToPlaylist(p, trackId) : p,
      );
      dispatch({ type: 'SET_PLAYLISTS', playlists: updated });

      const storagePort = Container.resolveStoragePort();
      await storagePort.savePlaylists(updated);
    },
    [],
  );

  const removeFromPlaylist = useCallback(
    async (playlistId: string, trackId: string) => {
      const { removeTrackFromPlaylist } = await import(
        '../../domain/models/Playlist'
      );
      const updated = stateRef.current.playlists.map(p =>
        p.id === playlistId ? removeTrackFromPlaylist(p, trackId) : p,
      );
      dispatch({ type: 'SET_PLAYLISTS', playlists: updated });

      const storagePort = Container.resolveStoragePort();
      await storagePort.savePlaylists(updated);
    },
    [],
  );

  const getPlaylistTracks = useCallback((playlistId: string): Track[] => {
    const playlist = stateRef.current.playlists.find(p => p.id === playlistId);
    if (!playlist) {
      return [];
    }
    const map = stateRef.current.trackMap;
    const resolved: Track[] = [];
    for (const tid of playlist.trackIds) {
      const track = map.get(tid);
      if (track) {
        resolved.push(track);
      }
    }
    return resolved;
  }, []);

  const getCurrentTrackAction = useCallback((): Track | null => {
    return currentTrack(stateRef.current.queueManagerState);
  }, []);

  const getUpcoming = useCallback((): Track[] => {
    return upcomingTracks(stateRef.current.queueManagerState);
  }, []);

  const getTotalTracks = useCallback((): number => {
    return totalTracks(stateRef.current.queueManagerState);
  }, []);

  const getCurrentIndex = useCallback((): number => {
    return currentIndex(stateRef.current.queueManagerState);
  }, []);

  useEffect(() => {
    initializePlayer();
  }, [initializePlayer]);

  const actions: AppActions = {
    scanLibrary,
    playTrack,
    playTrackInQueue,
    togglePlayback,
    nextTrack,
    previousTrack,
    seekTo,
    seekByFraction,
    toggleShuffle,
    setShuffleMode,
    initializePlayer,
    getCurrentTrack: getCurrentTrackAction,
    getUpcoming,
    getTotalTracks,
    getCurrentIndex,
    toggleFavourite,
    isFavourite,
    getFavouriteTracks,
    playCollection,
    createPlaylist: createPlaylistAction,
    deletePlaylist,
    renamePlaylist,
    addToPlaylist,
    removeFromPlaylist,
    getPlaylistTracks,
  };

  const contextValue: AppContextValue = { state, actions };

  return (
    <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}

export function useAppState(): AppState {
  return useAppContext().state;
}

export function useAppActions(): AppActions {
  return useAppContext().actions;
}
