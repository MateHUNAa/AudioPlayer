import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { AppState as RNAppState, InteractionManager } from 'react-native';
import { Track } from '../../domain/models/Track';
import {
  PlaybackState,
  createInitialPlaybackState,
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
  updateSkipStats,
  updateSession,
  updateFavourites,
  refreshQueueTracks,
  replanUpcoming,
  ReplanWindow,
  updateShuffleConfig as qmUpdateShuffleConfig,
  applyShuffle,
  disableShuffle,
} from '../../domain/engine/QueueManager';
import {
  SessionFeedback,
  withSessionFeedback,
} from '../../domain/engine/ShuffleEngine';
import {
  ShuffleConfig,
  normalizeShuffleConfig,
} from '../../domain/models/ShuffleConfig';
import {
  SkipStatsMap,
  ListenIntent,
  classifyListen,
  createEmptySkipStats,
  recordListen,
} from '../../domain/models/SkipStats';
import {
  TrackAnalysis,
  buildAnalysis,
  isCurrentAnalysis,
} from '../../domain/models/TrackAnalysis';
import { DismissedSuggestions } from '../../domain/models/Suggestions';
import {
  LibraryBackup,
  analysesFromBackup,
  createAnalysisBackup,
  createLibraryBackup,
  restoreLibraryBackup,
} from '../../domain/models/Backup';
import { Playlist } from '../../domain/models/Playlist';
import { PreviousTrackInfo } from '../../domain/ports/IAudioPort';
import { AnalysisResultEvent } from '../../domain/ports/IAnalysisPort';
import { Container } from '../../di/Container';
import { PermissionUtils } from '../../infrastructure/utils/PermissionUtils';
import { ProgressStore } from '../state/progressStore';

/** @field Whether the native analyzer exists in this build */
/** @field Whether a background batch is running */
/** @field Tracks with a current analysis */
/** @field Tracks in the library */
/** @field Files that could not be analyzed this session */
export interface AnalysisStatus {
  readonly available: boolean;
  readonly running: boolean;
  readonly analyzed: number;
  readonly total: number;
  readonly failed: number;
}

/** @field Where backups are written (for display) */
/** @field Whether the app can read backups written before a reinstall */
export interface BackupStatus {
  readonly location: string;
  readonly allFilesAccess: boolean | null;
  readonly lastBackupAt: number | null;
  readonly lastError: string | null;
  readonly restoredAt: number | null;
}

type AppAction =
  | { type: 'SET_TRACKS'; tracks: Track[] }
  | { type: 'SET_PLAYBACK_STATE'; playbackState: PlaybackState }
  | { type: 'SET_QUEUE_STATE'; queueState: QueueManagerState }
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
  | { type: 'SET_PLAYLISTS'; playlists: Playlist[] }
  | { type: 'SET_SKIP_STATS'; skipStats: SkipStatsMap }
  | { type: 'SET_SESSION'; session: SessionFeedback }
  | { type: 'MERGE_ANALYSIS'; analyses: ReadonlyMap<string, TrackAnalysis> }
  | { type: 'SET_ANALYSIS_STATUS'; status: Partial<AnalysisStatus> }
  | { type: 'SET_BACKUP_STATUS'; status: Partial<BackupStatus> }
  | { type: 'SET_DISMISSED'; dismissed: DismissedSuggestions };

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
  readonly dismissedSuggestions: DismissedSuggestions;
  readonly analysisStatus: AnalysisStatus;
  readonly backupStatus: BackupStatus;
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
  readonly updateShuffleConfig: (config: ShuffleConfig) => Promise<void>;
  readonly clearSkipStats: () => Promise<void>;
  readonly dismissSuggestion: (trackId: string) => Promise<void>;
  readonly startAnalysis: () => Promise<void>;
  readonly cancelAnalysis: () => Promise<void>;
  readonly backupNow: () => Promise<void>;
  readonly restoreFromBackup: () => Promise<boolean>;
  readonly requestAllFilesAccess: () => Promise<void>;
}

interface AppContextValue {
  readonly state: AppState;
  readonly actions: AppActions;
}

function buildTrackMap(tracks: readonly Track[]): ReadonlyMap<string, Track> {
  const map = new Map<string, Track>();
  for (const track of tracks) {
    map.set(track.id, track);
  }
  return map;
}

function countAnalyzed(tracks: readonly Track[]): number {
  let n = 0;
  for (const t of tracks) {
    if (isCurrentAnalysis(t.analysis)) {
      n++;
    }
  }
  return n;
}

const InitialScanProgress = {
  completed: 0,
  total: 0,
  currentFile: '',
} as const;

const FavouritesStorageKey = 'favourites' as const;
const DismissedStorageKey = 'dismissed_suggestions' as const;

/** Skips shorter than this only count when the user pressed "next" (not transient queue loads). */
const MinAutoSkipSeconds = 2;
const AnalysisFlushSize = 25;

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
    dismissedSuggestions: new Map(),
    analysisStatus: { available: true, running: false, analyzed: 0, total: 0, failed: 0 },
    backupStatus: {
      location: Container.resolveBackupPort().getBackupLocation(),
      allFilesAccess: null,
      lastBackupAt: null,
      lastError: null,
      restoredAt: null,
    },
  };
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_TRACKS':
      return {
        ...state,
        tracks: action.tracks,
        trackMap: buildTrackMap(action.tracks),
        analysisStatus: {
          ...state.analysisStatus,
          analyzed: countAnalyzed(action.tracks),
          total: action.tracks.length,
        },
      };

    case 'SET_PLAYBACK_STATE':
      return { ...state, playbackState: action.playbackState };

    case 'SET_QUEUE_STATE':
      return { ...state, queueManagerState: action.queueState };

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
      return { ...state, isLoading: action.loading };

    case 'SET_ERROR':
      return state.error === action.error ? state : { ...state, error: action.error };

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
        queueManagerState: updateFavourites(state.queueManagerState, action.favouriteIds),
      };

    case 'SET_PLAYLISTS':
      return { ...state, playlists: action.playlists };

    case 'SET_SKIP_STATS':
      return {
        ...state,
        queueManagerState: updateSkipStats(state.queueManagerState, action.skipStats),
      };

    case 'SET_SESSION':
      return {
        ...state,
        queueManagerState: updateSession(state.queueManagerState, action.session),
      };

    case 'MERGE_ANALYSIS': {
      if (action.analyses.size === 0) {
        return state;
      }
      const tracks = state.tracks.map(t => {
        const analysis = action.analyses.get(t.id);
        return analysis ? { ...t, analysis } : t;
      });
      const trackMap = buildTrackMap(tracks);
      const current = state.playbackState.currentTrack;
      return {
        ...state,
        tracks,
        trackMap,
        queueManagerState: refreshQueueTracks(state.queueManagerState, trackMap),
        playbackState:
          current && action.analyses.has(current.id)
            ? { ...state.playbackState, currentTrack: trackMap.get(current.id) ?? current }
            : state.playbackState,
        analysisStatus: { ...state.analysisStatus, analyzed: countAnalyzed(tracks) },
      };
    }

    case 'SET_ANALYSIS_STATUS':
      return { ...state, analysisStatus: { ...state.analysisStatus, ...action.status } };

    case 'SET_BACKUP_STATUS':
      return { ...state, backupStatus: { ...state.backupStatus, ...action.status } };

    case 'SET_DISMISSED':
      return { ...state, dismissedSuggestions: action.dismissed };

    default:
      return state;
  }
}

/** @field Track being listened to and how far the listener got */
interface ActiveListen {
  readonly trackId: string;
  duration: number;
  maxPosition: number;
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

  /** Dispatches and applies the action to stateRef immediately, so follow-up reads in the same callback see it. */
  const commit = useCallback((action: AppAction) => {
    stateRef.current = appReducer(stateRef.current, action);
    dispatch(action);
  }, []);

  const listenRef = useRef<ActiveListen | null>(null);
  const intentRef = useRef<ListenIntent>('auto');
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const pendingAnalysesRef = useRef(new Map<string, TrackAnalysis>());
  const failedAnalysisRef = useRef(new Set<string>());
  const pendingRestoreRef = useRef<LibraryBackup | null>(null);
  const userEditedRef = useRef(false);
  const initializedRef = useRef(false);

  const debounce = useCallback((key: string, ms: number, fn: () => void) => {
    const timers = timersRef.current;
    if (timers[key]) {
      clearTimeout(timers[key]);
    }
    timers[key] = setTimeout(() => {
      timers[key] = undefined;
      fn();
    }, ms);
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      Object.values(timers).forEach(t => t && clearTimeout(t));
    };
  }, []);

  const logError = useCallback((context: string, error: unknown) => {
    const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
    Container.resolveBackupPort()
      .appendErrorLog(`[${new Date().toISOString()}] ${context}: ${message}`)
      .catch(() => {});
  }, []);

  // ---------- backup ----------

  const writeLibraryBackup = useCallback(async (): Promise<void> => {
    const s = stateRef.current;
    if (s.tracks.length === 0) {
      // Never overwrite a good backup with an empty library (e.g. right after a reinstall).
      return;
    }
    const backup = createLibraryBackup({
      tracks: s.tracks,
      trackMap: s.trackMap,
      favouriteIds: s.favouriteIds,
      playlists: s.playlists,
      skipStats: s.queueManagerState.skipStats,
      dismissed: s.dismissedSuggestions,
      shuffleConfig: s.queueManagerState.shuffleConfig,
    });
    try {
      await Container.resolveBackupPort().writeLibraryBackup(backup);
      commit({ type: 'SET_BACKUP_STATUS', status: { lastBackupAt: backup.savedAt, lastError: null } });
    } catch (error) {
      const access = await Container.resolveAnalysisPort().hasAllFilesAccess().catch(() => false);
      commit({
        type: 'SET_BACKUP_STATUS',
        status: {
          allFilesAccess: access,
          lastError: access
            ? error instanceof Error ? error.message : 'Backup failed'
            : 'Allow "All files access" so the backup can be saved and restored after reinstalling.',
        },
      });
    }
  }, [commit]);

  const scheduleBackup = useCallback(() => {
    debounce('backup', 3000, () => {
      writeLibraryBackup().catch(() => {});
    });
  }, [debounce, writeLibraryBackup]);

  const scheduleAnalysisBackup = useCallback(() => {
    debounce('analysisBackup', 20000, () => {
      const tracks = stateRef.current.tracks;
      Container.resolveBackupPort()
        .writeAnalysisBackup(createAnalysisBackup(tracks))
        .catch(() => {});
    });
  }, [debounce]);

  const scheduleTracksSave = useCallback(() => {
    debounce('tracks', 8000, () => {
      Container.resolveStoragePort().saveTracks(stateRef.current.tracks).catch(() => {});
    });
  }, [debounce]);

  const scheduleStatsSave = useCallback(() => {
    debounce('stats', 1500, () => {
      Container.resolveSkipStatsPort()
        .saveSkipStats(stateRef.current.queueManagerState.skipStats)
        .catch(() => {});
    });
    scheduleBackup();
  }, [debounce, scheduleBackup]);

  const refreshBackupStatus = useCallback(async () => {
    const access = await Container.resolveAnalysisPort().hasAllFilesAccess().catch(() => false);
    if (access !== stateRef.current.backupStatus.allFilesAccess) {
      commit({ type: 'SET_BACKUP_STATUS', status: { allFilesAccess: access } });
    }
  }, [commit]);

  /** Applies restored data; persists it so the next launch doesn't depend on the backup file. */
  const applyRestore = useCallback(
    async (backup: LibraryBackup, merge: boolean) => {
      const s = stateRef.current;
      const restored = restoreLibraryBackup(backup, s.tracks.length > 0 ? s.tracks : null);

      const favouriteIds = merge
        ? new Set([...s.favouriteIds, ...restored.favouriteIds])
        : restored.favouriteIds;
      const byId = new Map(s.playlists.map(p => [p.id, p]));
      const playlists = merge
        ? [...s.playlists.filter(p => !restored.playlists.some(r => r.id === p.id)), ...restored.playlists]
        : restored.playlists;
      if (merge) {
        playlists.sort((a, b) => (byId.get(a.id)?.createdAt ?? a.createdAt) - (byId.get(b.id)?.createdAt ?? b.createdAt));
      }
      const skipStats = new Map(s.queueManagerState.skipStats);
      for (const [id, record] of restored.skipStats) {
        if (!merge || !skipStats.has(id)) {
          skipStats.set(id, record);
        }
      }
      const dismissed = new Map([...(merge ? s.dismissedSuggestions : []), ...restored.dismissed]);

      commit({ type: 'SET_FAVOURITES', favouriteIds });
      commit({ type: 'SET_PLAYLISTS', playlists });
      commit({ type: 'SET_SKIP_STATS', skipStats });
      commit({ type: 'SET_DISMISSED', dismissed });
      if (restored.shuffleConfig && !merge) {
        const config = normalizeShuffleConfig(restored.shuffleConfig);
        commit({
          type: 'SET_QUEUE_STATE',
          queueState: { ...stateRef.current.queueManagerState, shuffleConfig: config },
        });
        await Container.resolveStoragePort().saveShuffleConfig(config);
      }
      commit({ type: 'SET_BACKUP_STATUS', status: { restoredAt: Date.now(), lastError: null } });

      const storage = Container.resolveStoragePort();
      await Promise.all([
        storage.setItem(FavouritesStorageKey, Array.from(favouriteIds)),
        storage.savePlaylists(playlists),
        storage.setItem(DismissedStorageKey, Array.from(dismissed.entries())),
        Container.resolveSkipStatsPort().saveSkipStats(skipStats),
      ]);
      pendingRestoreRef.current = s.tracks.length > 0 && restored.unresolved === 0 ? null : backup;
    },
    [commit],
  );

  // ---------- analysis ----------

  const flushAnalyses = useCallback(() => {
    const pending = pendingAnalysesRef.current;
    if (pending.size === 0) {
      return;
    }
    const batch = new Map(pending);
    pending.clear();
    commit({ type: 'MERGE_ANALYSIS', analyses: batch });
    commit({ type: 'SET_ANALYSIS_STATUS', status: { failed: failedAnalysisRef.current.size } });
    scheduleTracksSave();
    scheduleAnalysisBackup();
  }, [commit, scheduleTracksSave, scheduleAnalysisBackup]);

  const mergeAnalysisBackup = useCallback(async () => {
    const tracks = stateRef.current.tracks;
    if (tracks.every(t => isCurrentAnalysis(t.analysis))) {
      return;
    }
    const backup = await Container.resolveBackupPort().readAnalysisBackup();
    const found = analysesFromBackup(backup, tracks);
    if (found.size > 0) {
      commit({ type: 'MERGE_ANALYSIS', analyses: found });
      scheduleTracksSave();
    }
  }, [commit, scheduleTracksSave]);

  const startAnalysis = useCallback(async () => {
    const port = Container.resolveAnalysisPort();
    if (!port.isAvailable()) {
      commit({ type: 'SET_ANALYSIS_STATUS', status: { available: false, running: false } });
      return;
    }
    const s = stateRef.current;
    const todo = s.tracks.filter(
      t => !isCurrentAnalysis(t.analysis) && !failedAnalysisRef.current.has(t.id),
    );
    if (todo.length === 0) {
      commit({ type: 'SET_ANALYSIS_STATUS', status: { running: false } });
      return;
    }
    // Loved and frequently played songs first: they matter most to smart shuffle.
    const stats = s.queueManagerState.skipStats;
    const priority = (t: Track) =>
      (s.favouriteIds.has(t.id) ? 1000 : 0) + (stats.get(t.id)?.fullPlays ?? 0);
    todo.sort((a, b) => priority(b) - priority(a));

    commit({ type: 'SET_ANALYSIS_STATUS', status: { available: true, running: true } });
    const onResult = (event: AnalysisResultEvent) => {
      if (event.result) {
        try {
          pendingAnalysesRef.current.set(event.id, buildAnalysis(event.result));
        } catch (error) {
          failedAnalysisRef.current.add(event.id);
          logError(`analysis ${event.path}`, error);
        }
      } else {
        failedAnalysisRef.current.add(event.id);
      }
      if (pendingAnalysesRef.current.size >= AnalysisFlushSize) {
        InteractionManager.runAfterInteractions(flushAnalyses);
      } else {
        debounce('analysisFlush', 5000, flushAnalyses);
      }
    };
    try {
      await port.startBatch(
        todo.map(t => ({ id: t.id, path: t.filePath })),
        onResult,
        () => {
          flushAnalyses();
          commit({
            type: 'SET_ANALYSIS_STATUS',
            status: { running: false, failed: failedAnalysisRef.current.size },
          });
        },
      );
    } catch (error) {
      logError('startAnalysis', error);
      commit({ type: 'SET_ANALYSIS_STATUS', status: { running: false } });
    }
  }, [commit, debounce, flushAnalyses, logError]);

  const cancelAnalysis = useCallback(async () => {
    await Container.resolveAnalysisPort().cancelBatch().catch(() => {});
    flushAnalyses();
    commit({ type: 'SET_ANALYSIS_STATUS', status: { running: false } });
  }, [commit, flushAnalyses]);

  // ---------- listening / session ----------

  const scheduleReplan = useCallback(() => {
    debounce('replan', 800, async () => {
      const before = stateRef.current.queueManagerState;
      const playing = currentTrack(before);
      if (!playing) {
        return;
      }
      const replanned = replanUpcoming(before);
      if (replanned === before) {
        return;
      }
      try {
        const ok = await Container.resolveAudioPort().alignQueue(
          playing.id,
          replanned.queue.tracks,
          replanned.queue.currentIndex,
          ReplanWindow,
        );
        if (!ok) {
          return;
        }
        const latest = stateRef.current.queueManagerState;
        commit({
          type: 'SET_QUEUE_STATE',
          queueState: skipToTrack({ ...latest, queue: { ...latest.queue, tracks: replanned.queue.tracks } }, playing.id),
        });
      } catch (error) {
        logError('replan', error);
      }
    });
  }, [commit, debounce, logError]);

  const finalizeListen = useCallback(
    (position: number, intent: ListenIntent) => {
      const listen = listenRef.current;
      if (!listen) {
        return;
      }
      listenRef.current = null;
      const pos = Math.max(0, position);
      let outcome = classifyListen(pos, listen.duration, intent);
      if (outcome === 'skip' && pos < MinAutoSkipSeconds && intent !== 'next') {
        outcome = 'ignore';
      }
      if (outcome === 'ignore') {
        return;
      }
      const qs = stateRef.current.queueManagerState;
      const fraction = listen.duration > 0 ? pos / listen.duration : 0;
      commit({
        type: 'SET_SKIP_STATS',
        skipStats: recordListen(qs.skipStats, listen.trackId, outcome, fraction),
      });
      scheduleStatsSave();

      if (outcome === 'skip' || outcome === 'complete') {
        commit({
          type: 'SET_SESSION',
          session: withSessionFeedback(
            qs.session,
            listen.trackId,
            outcome === 'skip' ? 'skipped' : 'completed',
          ),
        });
        if (outcome === 'skip' && qs.shuffleConfig.mode === 'smart') {
          scheduleReplan();
        }
      }
    },
    [commit, scheduleReplan, scheduleStatsSave],
  );

  const beginListen = useCallback((track: Track) => {
    listenRef.current = { trackId: track.id, duration: track.duration, maxPosition: 0 };
    ProgressStore.reset(track.duration);
  }, []);

  /** Ends the current listen before the app itself replaces the queue (tapping a song, etc.). */
  const finalizeBeforeManualChange = useCallback(() => {
    const listen = listenRef.current;
    if (listen) {
      finalizeListen(Math.max(listen.maxPosition, ProgressStore.get().position), 'select');
    }
    intentRef.current = 'auto';
  }, [finalizeListen]);

  const handleActiveTrackChanged = useCallback(
    (trackId: string | null, previous: PreviousTrackInfo | null) => {
      const intent = intentRef.current;
      intentRef.current = 'auto';

      const listen = listenRef.current;
      if (listen && listen.trackId !== trackId) {
        const position =
          previous && previous.trackId === listen.trackId
            ? previous.position
            : listen.maxPosition;
        finalizeListen(position, intent);
      }

      if (!trackId) {
        return;
      }

      const current = stateRef.current;
      const newTrack = current.trackMap.get(trackId) ?? null;
      if (!newTrack) {
        return;
      }

      if (!listenRef.current || listenRef.current.trackId !== trackId) {
        beginListen(newTrack);
      }

      const activeTrack = current.playbackState.currentTrack;
      if (activeTrack && activeTrack.id === trackId) {
        return;
      }

      const updatedQueueState = skipToTrack(current.queueManagerState, trackId);
      const updatedPlaybackState = setPlaying(current.playbackState, newTrack);

      commit({
        type: 'BATCH_UPDATE',
        playbackState: updatedPlaybackState,
        queueState: updatedQueueState,
      });

      Container.resolveStoragePort()
        .savePlaybackState({
          lastTrackId: newTrack.id,
          lastPosition: 0,
          shuffleMode: updatedPlaybackState.shuffleMode,
          repeatMode: updatedPlaybackState.repeatMode,
          volume: updatedPlaybackState.volume,
        })
        .catch(() => {});
    },
    [beginListen, commit, finalizeListen],
  );

  /** Merges live progress (kept outside React state) into a playback state for use cases. */
  const withLiveProgress = useCallback((ps: PlaybackState): PlaybackState => {
    const live = ProgressStore.get();
    return {
      ...ps,
      position: live.position,
      duration: live.duration > 0 ? live.duration : ps.duration,
    };
  }, []);

  // ---------- init ----------

  const initializePlayer = useCallback(async () => {
    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;

    const errorUtils = (globalThis as { ErrorUtils?: { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void } }).ErrorUtils;
    if (errorUtils) {
      const previousHandler = errorUtils.getGlobalHandler();
      errorUtils.setGlobalHandler((error, isFatal) => {
        logError(isFatal ? 'FATAL' : 'error', error);
        previousHandler(error, isFatal);
      });
    }

    try {
      commit({ type: 'SET_LOADING', loading: true });

      const audioPort = Container.resolveAudioPort();
      await audioPort.initialize();

      audioPort.registerCallbacks({
        onPositionUpdate: (position: number) => {
          ProgressStore.setPosition(position);
          const listen = listenRef.current;
          if (listen && position > listen.maxPosition) {
            listen.maxPosition = position;
          }
        },
        onDurationUpdate: (duration: number) => {
          ProgressStore.setDuration(duration);
          if (listenRef.current && duration > 0) {
            listenRef.current.duration = duration;
          }
        },
        onError: (error: string) => {
          commit({ type: 'SET_ERROR', error });
        },
        onActiveTrackChanged: handleActiveTrackChanged,
      });

      const storagePort = Container.resolveStoragePort();
      const persistedTracks = await storagePort.loadTracks();
      if (persistedTracks.length > 0) {
        commit({ type: 'SET_TRACKS', tracks: persistedTracks });
      }

      const persistedConfig = await storagePort.loadShuffleConfig();
      if (persistedConfig) {
        commit({
          type: 'SET_QUEUE_STATE',
          queueState: {
            ...stateRef.current.queueManagerState,
            shuffleConfig: normalizeShuffleConfig(persistedConfig),
          },
        });
      }

      const savedFavourites = await storagePort.getItem<string[]>(FavouritesStorageKey);
      if (savedFavourites && Array.isArray(savedFavourites)) {
        commit({ type: 'SET_FAVOURITES', favouriteIds: new Set(savedFavourites) });
      }

      const savedPlaylists = await storagePort.loadPlaylists();
      if (savedPlaylists.length > 0) {
        commit({ type: 'SET_PLAYLISTS', playlists: savedPlaylists });
      }

      const savedDismissed = await storagePort.getItem<[string, number][]>(DismissedStorageKey);
      if (savedDismissed && Array.isArray(savedDismissed)) {
        commit({ type: 'SET_DISMISSED', dismissed: new Map(savedDismissed) });
      }

      const loadedSkipStats = await Container.resolveSkipStatsPort().loadSkipStats();
      if (loadedSkipStats.size > 0) {
        commit({ type: 'SET_SKIP_STATS', skipStats: loadedSkipStats });
      }

      // Nothing saved in the app's own storage (fresh install or data wiped): restore the backup.
      const s = stateRef.current;
      if (s.favouriteIds.size === 0 && s.playlists.length === 0 && s.queueManagerState.skipStats.size === 0) {
        const backup = await Container.resolveBackupPort().readLibraryBackup();
        if (backup) {
          await applyRestore(backup, false);
        }
      }

      await mergeAnalysisBackup().catch(() => {});

      commit({ type: 'SET_LOADING', loading: false });
      refreshBackupStatus().catch(() => {});

      if (stateRef.current.tracks.length > 0) {
        InteractionManager.runAfterInteractions(() => {
          startAnalysis().catch(() => {});
        });
      }
    } catch (error) {
      logError('initializePlayer', error);
      const message =
        error instanceof Error ? error.message : 'Failed to initialize player';
      commit({ type: 'SET_ERROR', error: message });
      commit({ type: 'SET_LOADING', loading: false });
    }
  }, [applyRestore, commit, handleActiveTrackChanged, logError, mergeAnalysisBackup, refreshBackupStatus, startAnalysis]);

  const scanLibrary = useCallback(async (customPath?: string) => {
    try {
      commit({ type: 'SET_SCANNING', scanning: true });
      commit({ type: 'SET_ERROR', error: null });

      const permResult = await PermissionUtils.ensureStoragePermissions();
      if (!permResult.allGranted) {
        commit({
          type: 'SET_ERROR',
          error: 'Storage permission is required to scan your music library.',
        });
        commit({ type: 'SET_SCANNING', scanning: false });
        return;
      }

      const wasAnalyzing = stateRef.current.analysisStatus.running;
      if (wasAnalyzing) {
        await cancelAnalysis();
      }

      const scanUseCase = Container.resolveScanLibraryUseCase();
      await scanUseCase.execute(customPath, (completed, total, currentFile) => {
        commit({ type: 'SET_SCAN_PROGRESS', completed, total, currentFile });
      });

      const storagePort = Container.resolveStoragePort();
      const updatedTracks = await storagePort.loadTracks();
      commit({ type: 'SET_TRACKS', tracks: updatedTracks });
      commit({ type: 'SET_SCANNING', scanning: false });

      // A backup restored before the first scan can now match moved files by title/artist.
      const pending = pendingRestoreRef.current;
      if (pending && !userEditedRef.current) {
        await applyRestore(pending, false);
      }
      pendingRestoreRef.current = null;

      await mergeAnalysisBackup().catch(() => {});
      scheduleBackup();
      startAnalysis().catch(() => {});
    } catch (error) {
      logError('scanLibrary', error);
      const message =
        error instanceof Error ? error.message : 'Failed to scan library';
      commit({ type: 'SET_ERROR', error: message });
      commit({ type: 'SET_SCANNING', scanning: false });
    }
  }, [applyRestore, cancelAnalysis, commit, logError, mergeAnalysisBackup, scheduleBackup, startAnalysis]);

  // ---------- playback ----------

  const playTrack = useCallback(async (track: Track) => {
    try {
      commit({ type: 'SET_ERROR', error: null });
      finalizeBeforeManualChange();

      const useCase = Container.resolvePlayTrackUseCase();
      const result = await useCase.execute(
        track,
        stateRef.current.tracks,
        stateRef.current.playbackState,
        stateRef.current.queueManagerState,
      );

      commit({
        type: 'BATCH_UPDATE',
        playbackState: result.playbackState,
        queueState: result.queueManagerState,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to play track';
      commit({ type: 'SET_ERROR', error: message });
    }
  }, [commit, finalizeBeforeManualChange]);

  const playTrackInQueue = useCallback(async (track: Track) => {
    try {
      commit({ type: 'SET_ERROR', error: null });
      intentRef.current = 'select';

      const useCase = Container.resolvePlayTrackUseCase();
      const result = await useCase.executeInQueue(
        track,
        stateRef.current.playbackState,
        stateRef.current.queueManagerState,
      );

      commit({
        type: 'BATCH_UPDATE',
        playbackState: result.playbackState,
        queueState: result.queueManagerState,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to play track in queue';
      commit({ type: 'SET_ERROR', error: message });
    }
  }, [commit]);

  const togglePlayback = useCallback(async () => {
    try {
      commit({ type: 'SET_ERROR', error: null });

      const useCase = Container.resolveTogglePlaybackUseCase();
      const result = await useCase.execute(
        withLiveProgress(stateRef.current.playbackState),
        stateRef.current.queueManagerState,
      );

      commit({
        type: 'SET_PLAYBACK_STATE',
        playbackState: result.playbackState,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to toggle playback';
      commit({ type: 'SET_ERROR', error: message });
    }
  }, [commit, withLiveProgress]);

  const nextTrack = useCallback(async () => {
    try {
      commit({ type: 'SET_ERROR', error: null });
      intentRef.current = 'next';

      const useCase = Container.resolveNextTrackUseCase();
      const result = await useCase.execute(
        stateRef.current.playbackState,
        stateRef.current.queueManagerState,
      );

      commit({
        type: 'BATCH_UPDATE',
        playbackState: result.playbackState,
        queueState: result.queueManagerState,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to skip to next';
      commit({ type: 'SET_ERROR', error: message });
    }
  }, [commit]);

  const previousTrack = useCallback(async () => {
    try {
      commit({ type: 'SET_ERROR', error: null });
      intentRef.current = 'previous';

      const useCase = Container.resolvePreviousTrackUseCase();
      const result = await useCase.execute(
        stateRef.current.playbackState,
        stateRef.current.queueManagerState,
      );
      if (result.restartedCurrent) {
        // No track change happened, so nothing consumed the intent.
        intentRef.current = 'auto';
      }

      commit({
        type: 'BATCH_UPDATE',
        playbackState: result.playbackState,
        queueState: result.queueManagerState,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to go to previous';
      commit({ type: 'SET_ERROR', error: message });
    }
  }, [commit]);

  const seekTo = useCallback(async (positionSeconds: number) => {
    try {
      const useCase = Container.resolveSeekUseCase();
      const result = await useCase.execute(
        positionSeconds,
        withLiveProgress(stateRef.current.playbackState),
      );
      ProgressStore.setPosition(result.playbackState.position);
      commit({
        type: 'SET_PLAYBACK_STATE',
        playbackState: result.playbackState,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to seek';
      commit({ type: 'SET_ERROR', error: message });
    }
  }, [commit, withLiveProgress]);

  const seekByFraction = useCallback(async (fraction: number) => {
    try {
      const useCase = Container.resolveSeekUseCase();
      const result = await useCase.executeByFraction(
        fraction,
        withLiveProgress(stateRef.current.playbackState),
      );
      ProgressStore.setPosition(result.playbackState.position);
      commit({
        type: 'SET_PLAYBACK_STATE',
        playbackState: result.playbackState,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to seek';
      commit({ type: 'SET_ERROR', error: message });
    }
  }, [commit, withLiveProgress]);

  /**
   * Pushes a re-ordered queue to the native player without interrupting the current song.
   * Before this, toggling shuffle only reordered the app's copy of the queue while the player
   * kept auto-advancing in the old order.
   */
  const syncNativeUpcoming = useCallback(async (qs: QueueManagerState) => {
    const playing = currentTrack(qs);
    if (!playing || stateRef.current.playbackState.currentTrack?.id !== playing.id) {
      return;
    }
    await Container.resolveAudioPort().alignQueue(playing.id, qs.queue.tracks, qs.queue.currentIndex);
  }, []);

  const toggleShuffle = useCallback(async () => {
    try {
      commit({ type: 'SET_ERROR', error: null });

      const useCase = Container.resolveToggleShuffleUseCase();
      const result = await useCase.execute(
        withLiveProgress(stateRef.current.playbackState),
        stateRef.current.queueManagerState,
      );

      commit({
        type: 'BATCH_UPDATE',
        playbackState: result.playbackState,
        queueState: result.queueManagerState,
      });
      await syncNativeUpcoming(result.queueManagerState);
      scheduleBackup();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to toggle shuffle';
      commit({ type: 'SET_ERROR', error: message });
    }
  }, [commit, scheduleBackup, syncNativeUpcoming, withLiveProgress]);

  const setShuffleMode = useCallback(async (mode: ShuffleMode) => {
    try {
      commit({ type: 'SET_ERROR', error: null });

      const useCase = Container.resolveToggleShuffleUseCase();
      const result = await useCase.setMode(
        mode,
        withLiveProgress(stateRef.current.playbackState),
        stateRef.current.queueManagerState,
      );

      commit({
        type: 'BATCH_UPDATE',
        playbackState: result.playbackState,
        queueState: result.queueManagerState,
      });
      await syncNativeUpcoming(result.queueManagerState);
      scheduleBackup();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to set shuffle mode';
      commit({ type: 'SET_ERROR', error: message });
    }
  }, [commit, scheduleBackup, syncNativeUpcoming, withLiveProgress]);

  const updateShuffleConfigAction = useCallback(
    async (config: ShuffleConfig) => {
      try {
        commit({ type: 'SET_ERROR', error: null });

        const currentQueueState = stateRef.current.queueManagerState;
        const updatedQueueState = qmUpdateShuffleConfig(
          currentQueueState,
          config,
        );

        const finalQueueState =
          config.mode !== 'off' && updatedQueueState.queue.tracks.length > 0
            ? applyShuffle(updatedQueueState, config.mode)
            : config.mode === 'off'
            ? disableShuffle(updatedQueueState)
            : updatedQueueState;

        commit({ type: 'SET_QUEUE_STATE', queueState: finalQueueState });
        await syncNativeUpcoming(finalQueueState);

        await Container.resolveStoragePort().saveShuffleConfig(config);
        scheduleBackup();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to update shuffle config';
        commit({ type: 'SET_ERROR', error: message });
      }
    },
    [commit, scheduleBackup, syncNativeUpcoming],
  );

  const clearSkipStats = useCallback(async () => {
    try {
      await Container.resolveSkipStatsPort().clearSkipStats();
      commit({ type: 'SET_SKIP_STATS', skipStats: createEmptySkipStats() });
      commit({ type: 'SET_SESSION', session: { skipped: [], completed: [] } });
      scheduleBackup();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to clear skip stats';
      commit({ type: 'SET_ERROR', error: message });
    }
  }, [commit, scheduleBackup]);

  // ---------- favourites / suggestions ----------

  const toggleFavourite = useCallback(async (trackId: string) => {
    userEditedRef.current = true;
    const updated = new Set(stateRef.current.favouriteIds);

    if (updated.has(trackId)) {
      updated.delete(trackId);
    } else {
      updated.add(trackId);
    }

    commit({ type: 'SET_FAVOURITES', favouriteIds: updated });

    await Container.resolveStoragePort().setItem(FavouritesStorageKey, Array.from(updated));
    scheduleBackup();
  }, [commit, scheduleBackup]);

  const isFavourite = useCallback((trackId: string): boolean => {
    return stateRef.current.favouriteIds.has(trackId);
  }, []);

  const getFavouriteTracks = useCallback((): Track[] => {
    const ids = stateRef.current.favouriteIds;
    return stateRef.current.tracks.filter(t => ids.has(t.id));
  }, []);

  const dismissSuggestion = useCallback(async (trackId: string) => {
    const fullPlays = stateRef.current.queueManagerState.skipStats.get(trackId)?.fullPlays ?? 0;
    const dismissed = new Map(stateRef.current.dismissedSuggestions);
    dismissed.set(trackId, fullPlays);
    commit({ type: 'SET_DISMISSED', dismissed });
    await Container.resolveStoragePort().setItem(DismissedStorageKey, Array.from(dismissed.entries()));
    scheduleBackup();
  }, [commit, scheduleBackup]);

  const playCollection = useCallback(
    async (tracks: Track[], startIndex: number = 0) => {
      if (tracks.length === 0) {
        return;
      }

      try {
        commit({ type: 'SET_ERROR', error: null });
        finalizeBeforeManualChange();

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

        commit({
          type: 'BATCH_UPDATE',
          playbackState: updatedPlaybackState,
          queueState: updatedQueueState,
        });

        await Container.resolveStoragePort().savePlaybackState({
          lastTrackId: startTrack.id,
          lastPosition: 0,
          shuffleMode: updatedPlaybackState.shuffleMode,
          repeatMode: updatedPlaybackState.repeatMode,
          volume: updatedPlaybackState.volume,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to play collection';
        commit({ type: 'SET_ERROR', error: message });
      }
    },
    [commit, finalizeBeforeManualChange],
  );

  // ---------- playlists ----------

  const savePlaylists = useCallback(
    async (updated: Playlist[]) => {
      userEditedRef.current = true;
      commit({ type: 'SET_PLAYLISTS', playlists: updated });
      await Container.resolveStoragePort().savePlaylists(updated);
      scheduleBackup();
    },
    [commit, scheduleBackup],
  );

  const createPlaylistAction = useCallback(
    async (name: string, trackIds: string[] = []) => {
      const { createPlaylist: domainCreate } = await import(
        '../../domain/models/Playlist'
      );
      await savePlaylists([...stateRef.current.playlists, domainCreate(name, trackIds)]);
    },
    [savePlaylists],
  );

  const deletePlaylist = useCallback(async (playlistId: string) => {
    await savePlaylists(stateRef.current.playlists.filter(p => p.id !== playlistId));
  }, [savePlaylists]);

  const renamePlaylist = useCallback(
    async (playlistId: string, name: string) => {
      await savePlaylists(
        stateRef.current.playlists.map(p =>
          p.id === playlistId ? { ...p, name, updatedAt: Date.now() } : p,
        ),
      );
    },
    [savePlaylists],
  );

  const addToPlaylist = useCallback(
    async (playlistId: string, trackId: string) => {
      const { addTrackToPlaylist } = await import(
        '../../domain/models/Playlist'
      );
      await savePlaylists(
        stateRef.current.playlists.map(p =>
          p.id === playlistId ? addTrackToPlaylist(p, trackId) : p,
        ),
      );
    },
    [savePlaylists],
  );

  const removeFromPlaylist = useCallback(
    async (playlistId: string, trackId: string) => {
      const { removeTrackFromPlaylist } = await import(
        '../../domain/models/Playlist'
      );
      await savePlaylists(
        stateRef.current.playlists.map(p =>
          p.id === playlistId ? removeTrackFromPlaylist(p, trackId) : p,
        ),
      );
    },
    [savePlaylists],
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

  // ---------- backup actions ----------

  const backupNow = useCallback(async () => {
    await writeLibraryBackup();
    await Container.resolveBackupPort()
      .writeAnalysisBackup(createAnalysisBackup(stateRef.current.tracks))
      .catch(() => {});
  }, [writeLibraryBackup]);

  const restoreFromBackup = useCallback(async (): Promise<boolean> => {
    const backup = await Container.resolveBackupPort().readLibraryBackup();
    if (!backup) {
      commit({
        type: 'SET_BACKUP_STATUS',
        status: {
          lastError: stateRef.current.backupStatus.allFilesAccess
            ? 'No backup found.'
            : 'No readable backup. Allow "All files access" and try again.',
        },
      });
      return false;
    }
    await applyRestore(backup, true);
    await mergeAnalysisBackup().catch(() => {});
    return true;
  }, [applyRestore, commit, mergeAnalysisBackup]);

  const requestAllFilesAccess = useCallback(async () => {
    await Container.resolveAnalysisPort().requestAllFilesAccess().catch(() => {});
  }, []);

  // Coming back from system settings (e.g. after granting all-files access) or from the lock screen.
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', next => {
      if (next !== 'active') {
        return;
      }
      const hadAccess = stateRef.current.backupStatus.allFilesAccess;
      refreshBackupStatus()
        .then(async () => {
          const s = stateRef.current;
          const gotAccess = !hadAccess && s.backupStatus.allFilesAccess;
          const empty =
            s.favouriteIds.size === 0 && s.playlists.length === 0 && s.queueManagerState.skipStats.size === 0;
          if (gotAccess && empty) {
            await restoreFromBackup();
          }
        })
        .catch(() => {});
    });
    return () => sub.remove();
  }, [refreshBackupStatus, restoreFromBackup]);

  // ---------- queue getters ----------

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

  const actions: AppActions = useMemo(
    () => ({
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
      updateShuffleConfig: updateShuffleConfigAction,
      clearSkipStats,
      dismissSuggestion,
      startAnalysis,
      cancelAnalysis,
      backupNow,
      restoreFromBackup,
      requestAllFilesAccess,
    }),
    [
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
      getCurrentTrackAction,
      getUpcoming,
      getTotalTracks,
      getCurrentIndex,
      toggleFavourite,
      isFavourite,
      getFavouriteTracks,
      playCollection,
      createPlaylistAction,
      deletePlaylist,
      renamePlaylist,
      addToPlaylist,
      removeFromPlaylist,
      getPlaylistTracks,
      updateShuffleConfigAction,
      clearSkipStats,
      dismissSuggestion,
      startAnalysis,
      cancelAnalysis,
      backupNow,
      restoreFromBackup,
      requestAllFilesAccess,
    ],
  );

  const contextValue: AppContextValue = useMemo(() => ({ state, actions }), [state, actions]);

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
