import { Track } from '../../domain/models/Track';
import { PlaybackState, setPlaying, setError } from '../../domain/models/PlaybackState';
import { QueueManagerState, previous, currentTrack, canGoBack } from '../../domain/engine/QueueManager';
import { IAudioPort } from '../../domain/ports/IAudioPort';
import { IStoragePort } from '../../domain/ports/IStoragePort';

/** @field Updated playback state after going to the previous track */
/** @field Updated queue manager state with the new current index */
/** @field Whether the player restarted the current track instead of going back */
export interface PreviousTrackResult {
  readonly playbackState: PlaybackState;
  readonly queueManagerState: QueueManagerState;
  readonly restartedCurrent: boolean;
}

const RestartThresholdSeconds = 3;

export class PreviousTrackUseCase {
  private readonly audioPort: IAudioPort;
  private readonly storage: IStoragePort;

  /** @param audioPort - Audio port adapter for controlling playback */
  /** @param storage - Storage port for persisting playback state */
  constructor(audioPort: IAudioPort, storage: IStoragePort) {
    this.audioPort = audioPort;
    this.storage = storage;
  }

  /** @param currentPlaybackState - The current playback state before going back */
  /** @param currentQueueState - The current queue manager state before going back */
  /** @returns Updated playback and queue state after going to the previous track */
  async execute(
    currentPlaybackState: PlaybackState,
    currentQueueState: QueueManagerState,
  ): Promise<PreviousTrackResult> {
    try {
      const position = await this.audioPort.getPosition();

      if (position >= RestartThresholdSeconds) {
        return await this.restartCurrentTrack(currentPlaybackState, currentQueueState);
      }

      if (currentQueueState.repeatMode === 'one') {
        return await this.restartCurrentTrack(currentPlaybackState, currentQueueState);
      }

      if (!canGoBack(currentQueueState)) {
        return await this.restartCurrentTrack(currentPlaybackState, currentQueueState);
      }

      const rewindedQueueState = previous(currentQueueState);
      const previousTrack = currentTrack(rewindedQueueState);

      if (!previousTrack) {
        return await this.restartCurrentTrack(currentPlaybackState, currentQueueState);
      }

      await this.audioPort.skipToTrack(previousTrack.id);

      const updatedPlaybackState = setPlaying(currentPlaybackState, previousTrack);

      await this.persistState(updatedPlaybackState, previousTrack);

      return {
        playbackState: updatedPlaybackState,
        queueManagerState: rewindedQueueState,
        restartedCurrent: false,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to go to previous track';
      return {
        playbackState: setError(currentPlaybackState, errorMessage),
        queueManagerState: currentQueueState,
        restartedCurrent: false,
      };
    }
  }

  /** @param currentPlaybackState - The current playback state to restart from */
  /** @param currentQueueState - The queue state unchanged when restarting */
  /** @returns Result after seeking back to the start of the current track */
  private async restartCurrentTrack(
    currentPlaybackState: PlaybackState,
    currentQueueState: QueueManagerState,
  ): Promise<PreviousTrackResult> {
    const track = currentTrack(currentQueueState);

    if (!track) {
      return {
        playbackState: currentPlaybackState,
        queueManagerState: currentQueueState,
        restartedCurrent: true,
      };
    }

    await this.audioPort.seekTo(0);

    const updatedPlaybackState = setPlaying(currentPlaybackState, track);

    await this.persistState(updatedPlaybackState, track);

    return {
      playbackState: updatedPlaybackState,
      queueManagerState: currentQueueState,
      restartedCurrent: true,
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
