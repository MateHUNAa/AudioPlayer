import { PlaybackState, seekTo, setError } from '../../domain/models/PlaybackState';
import { IAudioPort } from '../../domain/ports/IAudioPort';
import { IStoragePort } from '../../domain/ports/IStoragePort';

/** @field Updated playback state after seeking to the new position */
export interface SeekResult {
  readonly playbackState: PlaybackState;
}

export class SeekUseCase {
  private readonly audioPort: IAudioPort;
  private readonly storage: IStoragePort;

  /** @param audioPort - Audio port adapter for controlling playback */
  /** @param storage - Storage port for persisting playback state */
  constructor(audioPort: IAudioPort, storage: IStoragePort) {
    this.audioPort = audioPort;
    this.storage = storage;
  }

  /** @param positionSeconds - Target position in seconds to seek to */
  /** @param currentPlaybackState - The current playback state before seeking */
  /** @returns Updated playback state with the new seek position applied */
  async execute(
    positionSeconds: number,
    currentPlaybackState: PlaybackState,
  ): Promise<SeekResult> {
    try {
      if (!currentPlaybackState.currentTrack) {
        return { playbackState: currentPlaybackState };
      }

      const clampedPosition = Math.max(
        0,
        Math.min(positionSeconds, currentPlaybackState.duration),
      );

      await this.audioPort.seekTo(clampedPosition);

      const updatedState = seekTo(currentPlaybackState, clampedPosition);

      await this.storage.savePlaybackState({
        lastTrackId: updatedState.currentTrack?.id ?? null,
        lastPosition: clampedPosition,
        shuffleMode: updatedState.shuffleMode,
        repeatMode: updatedState.repeatMode,
        volume: updatedState.volume,
      });

      return { playbackState: updatedState };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to seek';
      return {
        playbackState: setError(currentPlaybackState, errorMessage),
      };
    }
  }

  /** @param fraction - Seek position as a fraction between 0.0 and 1.0 */
  /** @param currentPlaybackState - The current playback state before seeking */
  /** @returns Updated playback state with the fractional position applied */
  async executeByFraction(
    fraction: number,
    currentPlaybackState: PlaybackState,
  ): Promise<SeekResult> {
    const clampedFraction = Math.max(0, Math.min(1, fraction));
    const positionSeconds = clampedFraction * currentPlaybackState.duration;
    return this.execute(positionSeconds, currentPlaybackState);
  }

  /** @param deltaSeconds - Relative offset in seconds (positive = forward, negative = backward) */
  /** @param currentPlaybackState - The current playback state before seeking */
  /** @returns Updated playback state after applying the relative seek offset */
  async executeRelative(
    deltaSeconds: number,
    currentPlaybackState: PlaybackState,
  ): Promise<SeekResult> {
    const targetPosition = currentPlaybackState.position + deltaSeconds;
    return this.execute(targetPosition, currentPlaybackState);
  }
}
