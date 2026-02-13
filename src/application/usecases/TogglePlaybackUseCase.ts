import {
  PlaybackState,
  setPaused,
  setResumed,
  setPlaying,
  setError,
} from '../../domain/models/PlaybackState';
import {
  QueueManagerState,
  currentTrack,
} from '../../domain/engine/QueueManager';
import { IAudioPort } from '../../domain/ports/IAudioPort';
import { IStoragePort } from '../../domain/ports/IStoragePort';

/** @field Updated playback state after the toggle action */
export interface TogglePlaybackResult {
  readonly playbackState: PlaybackState;
}

export class TogglePlaybackUseCase {
  private readonly audioPort: IAudioPort;
  private readonly storage: IStoragePort;

  /** @param audioPort - Audio port adapter for controlling playback */
  /** @param storage - Storage port for persisting playback state */
  constructor(audioPort: IAudioPort, storage: IStoragePort) {
    this.audioPort = audioPort;
    this.storage = storage;
  }

  /** @param currentPlaybackState - The current playback state before toggling */
  /** @param currentQueueState - The current queue manager state for track context */
  /** @returns Updated playback state after toggling play/pause */
  async execute(
    currentPlaybackState: PlaybackState,
    currentQueueState: QueueManagerState,
  ): Promise<TogglePlaybackResult> {
    try {
      const status = currentPlaybackState.status;

      if (status === 'playing' || status === 'buffering') {
        return await this.pause(currentPlaybackState);
      }

      if (status === 'paused') {
        return await this.resume(currentPlaybackState);
      }

      if (status === 'stopped' || status === 'idle') {
        return await this.playFromQueue(
          currentPlaybackState,
          currentQueueState,
        );
      }

      return { playbackState: currentPlaybackState };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to toggle playback';
      return {
        playbackState: setError(currentPlaybackState, errorMessage),
      };
    }
  }

  /** @param currentPlaybackState - The current playing state to pause */
  /** @returns Updated playback state in paused status */
  private async pause(
    currentPlaybackState: PlaybackState,
  ): Promise<TogglePlaybackResult> {
    await this.audioPort.pause();

    const position = await this.audioPort.getPosition();
    const updatedState = setPaused(currentPlaybackState);

    await this.persistState(updatedState, position);

    return { playbackState: updatedState };
  }

  /** @param currentPlaybackState - The current paused state to resume */
  /** @returns Updated playback state in playing status */
  private async resume(
    currentPlaybackState: PlaybackState,
  ): Promise<TogglePlaybackResult> {
    await this.audioPort.resume();

    const updatedState = setResumed(currentPlaybackState);

    await this.persistState(updatedState, currentPlaybackState.position);

    return { playbackState: updatedState };
  }

  /** @param currentPlaybackState - The current idle/stopped state */
  /** @param currentQueueState - Queue state to pull the current track from */
  /** @returns Updated playback state after starting playback from the queue */
  private async playFromQueue(
    currentPlaybackState: PlaybackState,
    currentQueueState: QueueManagerState,
  ): Promise<TogglePlaybackResult> {
    const track = currentTrack(currentQueueState);

    if (!track) {
      return { playbackState: currentPlaybackState };
    }

    await this.audioPort.play(track);

    const updatedState = setPlaying(currentPlaybackState, track);

    await this.persistState(updatedState, 0);

    return { playbackState: updatedState };
  }

  /** @param state - The playback state to persist */
  /** @param position - Current playback position in seconds */
  private async persistState(
    state: PlaybackState,
    position: number,
  ): Promise<void> {
    await this.storage.savePlaybackState({
      lastTrackId: state.currentTrack?.id ?? null,
      lastPosition: position,
      shuffleMode: state.shuffleMode,
      repeatMode: state.repeatMode,
      volume: state.volume,
    });
  }
}
