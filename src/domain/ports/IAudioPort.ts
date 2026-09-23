import { Track } from '../models/Track';

/** @field Callback invoked when a track finishes playing naturally */
/** @field Callback invoked when playback position updates */
/** @field Callback invoked when playback state changes */
/** @field Callback invoked when an error occurs during playback */
/** @field Callback invoked when the native player auto-advances to a different track */
/** @field Callback invoked when the native player reports an updated duration */
/** @field Where the previously active track was left when the active track changed */
export interface PreviousTrackInfo {
  readonly trackId: string | null;
  readonly position: number;
}

export interface AudioEventCallbacks {
  readonly onTrackEnd: () => void;
  readonly onPositionUpdate: (positionSeconds: number) => void;
  readonly onDurationUpdate: (durationSeconds: number) => void;
  readonly onStateChange: (state: AudioPortState) => void;
  readonly onError: (error: string) => void;
  readonly onActiveTrackChanged: (
    trackId: string | null,
    previous: PreviousTrackInfo | null,
  ) => void;
}

/** @enum Possible states reported by the audio port */
export type AudioPortState =
  | 'idle'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'stopped'
  | 'buffering'
  | 'error';

/** @interface Contract for any audio playback implementation */
export interface IAudioPort {
  /** @param track - The track to load and begin playing */
  play(track: Track): Promise<void>;

  /** @returns Resolves when playback is paused */
  pause(): Promise<void>;

  /** @returns Resolves when playback is resumed from paused state */
  resume(): Promise<void>;

  /** @returns Resolves when playback is fully stopped and resources released */
  stop(): Promise<void>;

  /** @param positionSeconds - Target position in seconds to seek to */
  seekTo(positionSeconds: number): Promise<void>;

  /** @param volume - Volume level between 0.0 and 1.0 */
  setVolume(volume: number): Promise<void>;

  /** @param rate - Playback speed multiplier between 0.25 and 4.0 */
  setPlaybackRate(rate: number): Promise<void>;

  /** @returns Current playback position in seconds */
  getPosition(): Promise<number>;

  /** @returns Duration of the currently loaded track in seconds */
  getDuration(): Promise<number>;

  /** @returns Current state of the audio port */
  getState(): Promise<AudioPortState>;

  /** @param callbacks - Event callbacks to register for playback events */
  registerCallbacks(callbacks: Partial<AudioEventCallbacks>): void;

  /** @returns Resolves when the audio engine is fully initialized */
  initialize(): Promise<void>;

  /** @returns Resolves when the audio engine is torn down and all resources freed */
  destroy(): Promise<void>;

  /** @param tracks - Ordered track list to load into the native queue */
  setQueue(tracks: readonly Track[]): Promise<void>;

  /** @param trackId - ID of the track to skip to within the native queue */
  skipToTrack(trackId: string): Promise<void>;

  /** @param currentTrackId - Track expected to be playing; nothing changes if another track is active */
  /** @param tracks - Full queue order to mirror natively, containing the current track */
  /** @param currentIndex - Index of the current track within tracks */
  /** @param frontCount - If only this many upcoming tracks were moved to the front, a cheap update is used */
  /** @returns Whether the native queue now matches, without interrupting the current song */
  alignQueue(
    currentTrackId: string,
    tracks: readonly Track[],
    currentIndex: number,
    frontCount?: number,
  ): Promise<boolean>;
}
