import { useCallback, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { Track } from '../../domain/models/Track';
import { PlaybackStatus, ShuffleMode, RepeatMode } from '../../domain/models/PlaybackState';

interface PlayerControls {
  readonly play: (track: Track) => Promise<void>;
  readonly playInQueue: (track: Track) => Promise<void>;
  readonly togglePlayback: () => Promise<void>;
  readonly next: () => Promise<void>;
  readonly previous: () => Promise<void>;
  readonly seekTo: (positionSeconds: number) => Promise<void>;
  readonly seekByFraction: (fraction: number) => Promise<void>;
  readonly toggleShuffle: () => Promise<void>;
  readonly setShuffleMode: (mode: ShuffleMode) => Promise<void>;
}

interface PlayerState {
  readonly status: PlaybackStatus;
  readonly currentTrack: Track | null;
  readonly position: number;
  readonly duration: number;
  readonly volume: number;
  readonly isMuted: boolean;
  readonly repeatMode: RepeatMode;
  readonly shuffleMode: ShuffleMode;
  readonly playbackRate: number;
  readonly error: string | null;
  readonly isPlaying: boolean;
  readonly isPaused: boolean;
  readonly isStopped: boolean;
  readonly isBuffering: boolean;
  readonly hasTrack: boolean;
  readonly progress: number;
  readonly upcoming: Track[];
  readonly queueLength: number;
  readonly queueIndex: number;
}

interface UsePlayerResult {
  readonly controls: PlayerControls;
  readonly playerState: PlayerState;
}

export function usePlayer(): UsePlayerResult {
  const { state, actions } = useAppContext();
  const { playbackState } = state;

  const play = useCallback(async (track: Track) => {
    await actions.playTrack(track);
  }, [actions]);

  const playInQueue = useCallback(async (track: Track) => {
    await actions.playTrackInQueue(track);
  }, [actions]);

  const togglePlayback = useCallback(async () => {
    await actions.togglePlayback();
  }, [actions]);

  const next = useCallback(async () => {
    await actions.nextTrack();
  }, [actions]);

  const previous = useCallback(async () => {
    await actions.previousTrack();
  }, [actions]);

  const seekTo = useCallback(async (positionSeconds: number) => {
    await actions.seekTo(positionSeconds);
  }, [actions]);

  const seekByFraction = useCallback(async (fraction: number) => {
    await actions.seekByFraction(fraction);
  }, [actions]);

  const toggleShuffle = useCallback(async () => {
    await actions.toggleShuffle();
  }, [actions]);

  const setShuffleMode = useCallback(async (mode: ShuffleMode) => {
    await actions.setShuffleMode(mode);
  }, [actions]);

  const controls: PlayerControls = useMemo(() => ({
    play,
    playInQueue,
    togglePlayback,
    next,
    previous,
    seekTo,
    seekByFraction,
    toggleShuffle,
    setShuffleMode,
  }), [play, playInQueue, togglePlayback, next, previous, seekTo, seekByFraction, toggleShuffle, setShuffleMode]);

  const progress = playbackState.duration > 0
    ? playbackState.position / playbackState.duration
    : 0;

  const playerState: PlayerState = useMemo(() => ({
    status: playbackState.status,
    currentTrack: playbackState.currentTrack,
    position: playbackState.position,
    duration: playbackState.duration,
    volume: playbackState.volume,
    isMuted: playbackState.isMuted,
    repeatMode: playbackState.repeatMode,
    shuffleMode: playbackState.shuffleMode,
    playbackRate: playbackState.playbackRate,
    error: playbackState.error,
    isPlaying: playbackState.status === 'playing',
    isPaused: playbackState.status === 'paused',
    isStopped: playbackState.status === 'stopped' || playbackState.status === 'idle',
    isBuffering: playbackState.status === 'buffering',
    hasTrack: playbackState.currentTrack !== null,
    progress,
    upcoming: actions.getUpcoming(),
    queueLength: actions.getTotalTracks(),
    queueIndex: actions.getCurrentIndex(),
  }), [
    playbackState.status,
    playbackState.currentTrack,
    playbackState.position,
    playbackState.duration,
    playbackState.volume,
    playbackState.isMuted,
    playbackState.repeatMode,
    playbackState.shuffleMode,
    playbackState.playbackRate,
    playbackState.error,
    progress,
    actions,
  ]);

  return { controls, playerState };
}
