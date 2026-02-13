import { Track } from '../../domain/models/Track';
import { PlaybackState, setPlaying, setStopped, setError } from '../../domain/models/PlaybackState';
import { QueueManagerState, next, currentTrack, canAdvance } from '../../domain/engine/QueueManager';
import { IAudioPort } from '../../domain/ports/IAudioPort';
import { IStoragePort } from '../../domain/ports/IStoragePort';

/** @field Updated playback state after advancing to the next track */
/** @field Updated queue manager state with the new current index */
/** @field Whether the queue reached its end without looping */
export interface NextTrackResult {
  readonly playbackState: PlaybackState;
  readonly queueManagerState: QueueManagerState;
  readonly reachedEnd: boolean;
}

export class NextTrackUseCase {
  private readonly audioPort: IAudioPort;
  private readonly storage: IStoragePort;

  /** @param audioPort - Audio port adapter for controlling playback */
  /** @param storage - Storage port for persisting playback state */
  constructor(audioPort: IAudioPort, storage: IStoragePort) {
    this.audioPort = audioPort;
    this.storage = storage;
  }

  /** @param currentPlaybackState - The current playback state before advancing */
  /** @param currentQueueState - The current queue manager state before advancing */
  /** @returns Updated playback and queue state after advancing to the next track */
  async execute(
    currentPlaybackState: PlaybackState,
    currentQueueState: QueueManagerState,
  ): Promise<NextTrackResult> {
    try {
      if (!canAdvance(currentQueueState)) {
        return await this.handleQueueEnd(currentPlaybackState, currentQueueState);
      }

      const advancedQueueState = next(currentQueueState);
      const nextTrack = currentTrack(advancedQueueState);

      if (!nextTrack) {
        return await this.handleQueueEnd(currentPlaybackState, currentQueueState);
      }

      if (currentQueueState.repeatMode === 'one') {
        return await this.replayCurrentTrack(currentPlaybackState, currentQueueState);
      }

      await this.audioPort.skipToTrack(nextTrack.id);

      const updatedPlaybackState = setPlaying(currentPlaybackState, nextTrack);

      await this.persistState(updatedPlaybackState, nextTrack);

      return {
        playbackState: updatedPlaybackState,
        queueManagerState: advancedQueueState,
        reachedEnd: false,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to advance to next track';
      return {
        playbackState: setError(currentPlaybackState, errorMessage),
        queueManagerState: currentQueueState,
        reachedEnd: false,
      };
    }
  }

  /** @param currentPlaybackState - The current playback state when the queue ends */
  /** @param currentQueueState - The queue state at the end of the queue */
  /** @returns Result indicating the queue has reached its end */
  private async handleQueueEnd(
    currentPlaybackState: PlaybackState,
    currentQueueState: QueueManagerState,
  ): Promise<NextTrackResult> {
    await this.audioPort.stop();

    const stoppedState = setStopped(currentPlaybackState);

    await this.storage.savePlaybackState({
      lastTrackId: stoppedState.currentTrack?.id ?? null,
      lastPosition: 0,
      shuffleMode: stoppedState.shuffleMode,
      repeatMode: stoppedState.repeatMode,
      volume: stoppedState.volume,
    });

    return {
      playbackState: stoppedState,
      queueManagerState: currentQueueState,
      reachedEnd: true,
    };
  }

  /** @param currentPlaybackState - The current playback state for repeat-one mode */
  /** @param currentQueueState - The queue state unchanged for repeat-one mode */
  /** @returns Result after seeking back to the start of the current track */
  private async replayCurrentTrack(
    currentPlaybackState: PlaybackState,
    currentQueueState: QueueManagerState,
  ): Promise<NextTrackResult> {
    const track = currentTrack(currentQueueState);

    if (!track) {
      return await this.handleQueueEnd(currentPlaybackState, currentQueueState);
    }

    await this.audioPort.seekTo(0);

    const updatedPlaybackState = setPlaying(currentPlaybackState, track);

    await this.persistState(updatedPlaybackState, track);

    return {
      playbackState: updatedPlaybackState,
      queueManagerState: currentQueueState,
      reachedEnd: false,
    };
  }

  /** @param state - The playback state to persist */
  /** @param track - The track that is now playing */
  private async persistState(state: PlaybackState, track: Track): Promise<void> {
    await this.storage.savePlaybackState({
      lastTrackId: track.id,
      lastPosition: 0,
      shuffleMode: state.shuffleMode,
      repeatMode: state.repeatMode,
      volume: state.volume,
    });
  }
}
