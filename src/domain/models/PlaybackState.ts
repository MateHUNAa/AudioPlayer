import { Track } from './Track';

/** @enum Possible playback status values */
export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'stopped' | 'buffering' | 'error';

/** @enum Repeat mode options */
export type RepeatMode = 'off' | 'one' | 'all';

/** @enum Shuffle mode options */
export type ShuffleMode = 'off' | 'smart' | 'random';

/** @field Current playback status */
/** @field Currently loaded track or null if nothing loaded */
/** @field Current playback position in seconds */
/** @field Duration of the current track in seconds */
/** @field Current volume level from 0.0 to 1.0 */
/** @field Whether audio is muted */
/** @field Current repeat mode setting */
/** @field Current shuffle mode setting */
/** @field Playback speed multiplier */
/** @field Error message if status is error */
export interface PlaybackState {
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
}

const InitialPlaybackState: PlaybackState = {
  status: 'idle',
  currentTrack: null,
  position: 0,
  duration: 0,
  volume: 1.0,
  isMuted: false,
  repeatMode: 'off',
  shuffleMode: 'off',
  playbackRate: 1.0,
  error: null,
};

/** @returns A fresh PlaybackState with default values */
export function createInitialPlaybackState(): PlaybackState {
  return { ...InitialPlaybackState };
}

/** @param state - Current playback state */
/** @param track - The track that is now playing */
/** @returns Updated PlaybackState reflecting the playing track */
export function setPlaying(state: PlaybackState, track: Track): PlaybackState {
  return {
    ...state,
    status: 'playing',
    currentTrack: track,
    position: 0,
    duration: track.duration,
    error: null,
  };
}

/** @param state - Current playback state */
/** @returns Updated PlaybackState in paused status */
export function setPaused(state: PlaybackState): PlaybackState {
  if (state.status !== 'playing' && state.status !== 'buffering') {
    return state;
  }
  return {
    ...state,
    status: 'paused',
  };
}

/** @param state - Current playback state */
/** @returns Updated PlaybackState resumed from paused */
export function setResumed(state: PlaybackState): PlaybackState {
  if (state.status !== 'paused') {
    return state;
  }
  return {
    ...state,
    status: 'playing',
  };
}

/** @param state - Current playback state */
/** @returns Updated PlaybackState in stopped status with position reset */
export function setStopped(state: PlaybackState): PlaybackState {
  return {
    ...state,
    status: 'stopped',
    position: 0,
  };
}

/** @param state - Current playback state */
/** @param position - New playback position in seconds */
/** @returns Updated PlaybackState with new seek position */
export function seekTo(state: PlaybackState, position: number): PlaybackState {
  const clampedPosition = Math.max(0, Math.min(position, state.duration));
  return {
    ...state,
    position: clampedPosition,
  };
}

/** @param state - Current playback state */
/** @param position - Updated position from playback progress */
/** @returns Updated PlaybackState with current position */
export function updatePosition(state: PlaybackState, position: number): PlaybackState {
  return {
    ...state,
    position,
  };
}

/** @param state - Current playback state */
/** @param volume - New volume level clamped between 0.0 and 1.0 */
/** @returns Updated PlaybackState with new volume */
export function setVolume(state: PlaybackState, volume: number): PlaybackState {
  return {
    ...state,
    volume: Math.max(0, Math.min(1, volume)),
    isMuted: false,
  };
}

/** @param state - Current playback state */
/** @returns Updated PlaybackState with mute toggled */
export function toggleMute(state: PlaybackState): PlaybackState {
  return {
    ...state,
    isMuted: !state.isMuted,
  };
}

/** @param state - Current playback state */
/** @returns Updated PlaybackState with repeat mode cycled to next value */
export function cycleRepeatMode(state: PlaybackState): PlaybackState {
  const RepeatCycle: Record<RepeatMode, RepeatMode> = {
    off: 'all',
    all: 'one',
    one: 'off',
  };
  return {
    ...state,
    repeatMode: RepeatCycle[state.repeatMode],
  };
}

/** @param state - Current playback state */
/** @param mode - The shuffle mode to apply */
/** @returns Updated PlaybackState with new shuffle mode */
export function setShuffleMode(state: PlaybackState, mode: ShuffleMode): PlaybackState {
  return {
    ...state,
    shuffleMode: mode,
  };
}

/** @param state - Current playback state */
/** @param rate - Playback speed multiplier */
/** @returns Updated PlaybackState with new playback rate */
export function setPlaybackRate(state: PlaybackState, rate: number): PlaybackState {
  const clampedRate = Math.max(0.25, Math.min(4.0, rate));
  return {
    ...state,
    playbackRate: clampedRate,
  };
}

/** @param state - Current playback state */
/** @param message - Error description */
/** @returns Updated PlaybackState in error status */
export function setError(state: PlaybackState, message: string): PlaybackState {
  return {
    ...state,
    status: 'error',
    error: message,
  };
}

/** @param state - Current playback state to check */
/** @returns Whether the player is actively producing audio */
export function isActive(state: PlaybackState): boolean {
  return state.status === 'playing' || state.status === 'buffering';
}

/** @param state - Current playback state to check */
/** @returns Whether a track is loaded regardless of play status */
export function hasTrackLoaded(state: PlaybackState): boolean {
  return state.currentTrack !== null && state.status !== 'idle';
}
