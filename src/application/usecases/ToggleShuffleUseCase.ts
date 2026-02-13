import { PlaybackState, ShuffleMode, setShuffleMode, setError } from '../../domain/models/PlaybackState';
import { QueueManagerState, applyShuffle, disableShuffle } from '../../domain/engine/QueueManager';
import { ShuffleConfig } from '../../domain/models/ShuffleConfig';
import { IStoragePort } from '../../domain/ports/IStoragePort';

/** @field Updated playback state with the new shuffle mode applied */
/** @field Updated queue manager state with the queue reordered for the new mode */
export interface ToggleShuffleResult {
  readonly playbackState: PlaybackState;
  readonly queueManagerState: QueueManagerState;
}

const ShuffleCycle: Record<ShuffleMode, ShuffleMode> = {
  off: 'smart',
  smart: 'random',
  random: 'off',
};

export class ToggleShuffleUseCase {
  private readonly storage: IStoragePort;

  /** @param storage - Storage port for persisting shuffle configuration and playback state */
  constructor(storage: IStoragePort) {
    this.storage = storage;
  }

  /** @param currentPlaybackState - The current playback state before toggling */
  /** @param currentQueueState - The current queue manager state before toggling */
  /** @returns Updated playback and queue state after cycling to the next shuffle mode */
  async execute(
    currentPlaybackState: PlaybackState,
    currentQueueState: QueueManagerState,
  ): Promise<ToggleShuffleResult> {
    try {
      const nextMode = ShuffleCycle[currentPlaybackState.shuffleMode];
      return await this.applyMode(nextMode, currentPlaybackState, currentQueueState);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to toggle shuffle';
      return {
        playbackState: setError(currentPlaybackState, errorMessage),
        queueManagerState: currentQueueState,
      };
    }
  }

  /** @param mode - The specific shuffle mode to activate */
  /** @param currentPlaybackState - The current playback state before applying the mode */
  /** @param currentQueueState - The current queue manager state before applying the mode */
  /** @returns Updated playback and queue state after applying the specified shuffle mode */
  async setMode(
    mode: ShuffleMode,
    currentPlaybackState: PlaybackState,
    currentQueueState: QueueManagerState,
  ): Promise<ToggleShuffleResult> {
    try {
      return await this.applyMode(mode, currentPlaybackState, currentQueueState);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to set shuffle mode';
      return {
        playbackState: setError(currentPlaybackState, errorMessage),
        queueManagerState: currentQueueState,
      };
    }
  }

  /** @param config - Custom shuffle configuration to apply along with the mode change */
  /** @param currentPlaybackState - The current playback state before applying */
  /** @param currentQueueState - The current queue manager state before applying */
  /** @returns Updated playback and queue state with the custom config and mode applied */
  async setModeWithConfig(
    config: ShuffleConfig,
    currentPlaybackState: PlaybackState,
    currentQueueState: QueueManagerState,
  ): Promise<ToggleShuffleResult> {
    try {
      const updatedQueueState: QueueManagerState = {
        ...currentQueueState,
        shuffleConfig: config,
      };

      const mode = config.mode;
      const finalQueueState = mode === 'off'
        ? disableShuffle(updatedQueueState)
        : applyShuffle(updatedQueueState, mode);

      const updatedPlaybackState = setShuffleMode(currentPlaybackState, mode);

      await this.persistState(updatedPlaybackState, config);

      return {
        playbackState: updatedPlaybackState,
        queueManagerState: finalQueueState,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to apply shuffle config';
      return {
        playbackState: setError(currentPlaybackState, errorMessage),
        queueManagerState: currentQueueState,
      };
    }
  }

  /** @param mode - The shuffle mode to apply to the queue and playback state */
  /** @param currentPlaybackState - The current playback state */
  /** @param currentQueueState - The current queue manager state */
  /** @returns Updated states after the mode is applied */
  private async applyMode(
    mode: ShuffleMode,
    currentPlaybackState: PlaybackState,
    currentQueueState: QueueManagerState,
  ): Promise<ToggleShuffleResult> {
    const updatedQueueState = mode === 'off'
      ? disableShuffle(currentQueueState)
      : applyShuffle(currentQueueState, mode);

    const updatedPlaybackState = setShuffleMode(currentPlaybackState, mode);

    await this.persistState(updatedPlaybackState, updatedQueueState.shuffleConfig);

    return {
      playbackState: updatedPlaybackState,
      queueManagerState: updatedQueueState,
    };
  }

  /** @param state - The playback state to persist */
  /** @param config - The shuffle configuration to persist */
  private async persistState(state: PlaybackState, config: ShuffleConfig): Promise<void> {
    await Promise.all([
      this.storage.savePlaybackState({
        lastTrackId: state.currentTrack?.id ?? null,
        lastPosition: state.position,
        shuffleMode: state.shuffleMode,
        repeatMode: state.repeatMode,
        volume: state.volume,
      }),
      this.storage.saveShuffleConfig(config),
    ]);
  }
}
