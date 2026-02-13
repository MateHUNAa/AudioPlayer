import { Track } from '../../domain/models/Track';
import { PlaybackState, setShuffleMode, setError, ShuffleMode } from '../../domain/models/PlaybackState';
import {
  QueueManagerState,
  loadQueue,
  applyShuffle,
  replaceQueue,
  currentTrack,
  totalTracks,
} from '../../domain/engine/QueueManager';
import { IAudioPort } from '../../domain/ports/IAudioPort';
import { IStoragePort } from '../../domain/ports/IStoragePort';

/** @field Updated playback state after the queue is built */
/** @field Updated queue manager state with the constructed queue */
/** @field Total number of tracks loaded into the queue */
export interface BuildQueueResult {
  readonly playbackState: PlaybackState;
  readonly queueManagerState: QueueManagerState;
  readonly totalTracksLoaded: number;
}

/** @field Tracks to build the queue from */
/** @field Index of the track to start playback from */
/** @field Shuffle mode to apply when building the queue */
/** @field Whether to begin playback immediately after building */
export interface BuildQueueOptions {
  readonly tracks: Track[];
  readonly startIndex: number;
  readonly shuffleMode: ShuffleMode;
  readonly autoPlay: boolean;
}

const DefaultBuildQueueOptions: Omit<BuildQueueOptions, 'tracks'> = {
  startIndex: 0,
  shuffleMode: 'off',
  autoPlay: false,
};

export class BuildQueueUseCase {
  private readonly audioPort: IAudioPort;
  private readonly storage: IStoragePort;

  /** @param audioPort - Audio port adapter for controlling playback */
  /** @param storage - Storage port for persisting playback state */
  constructor(audioPort: IAudioPort, storage: IStoragePort) {
    this.audioPort = audioPort;
    this.storage = storage;
  }

  /** @param options - Configuration for how to build the queue */
  /** @param currentPlaybackState - The current playback state before building */
  /** @param currentQueueState - The current queue manager state before building */
  /** @returns Updated playback and queue state after the queue is built */
  async execute(
    options: BuildQueueOptions,
    currentPlaybackState: PlaybackState,
    currentQueueState: QueueManagerState,
  ): Promise<BuildQueueResult> {
    try {
      const { tracks, startIndex, shuffleMode, autoPlay } = options;

      if (tracks.length === 0) {
        return {
          playbackState: currentPlaybackState,
          queueManagerState: currentQueueState,
          totalTracksLoaded: 0,
        };
      }

      const clampedIndex = Math.max(0, Math.min(startIndex, tracks.length - 1));

      const updatedQueueState = loadQueue(
        tracks,
        clampedIndex,
        shuffleMode,
        currentQueueState,
      );

      const updatedPlaybackState = setShuffleMode(currentPlaybackState, shuffleMode);

      await this.audioPort.setQueue(updatedQueueState.queue.tracks);

      if (autoPlay) {
        const trackToPlay = currentTrack(updatedQueueState);
        if (trackToPlay) {
          await this.audioPort.play(trackToPlay);
        }
      }

      await this.persistState(updatedPlaybackState, updatedQueueState);

      return {
        playbackState: updatedPlaybackState,
        queueManagerState: updatedQueueState,
        totalTracksLoaded: totalTracks(updatedQueueState),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to build queue';
      return {
        playbackState: setError(currentPlaybackState, errorMessage),
        queueManagerState: currentQueueState,
        totalTracksLoaded: 0,
      };
    }
  }

  /** @param tracks - Tracks to build the queue from using default options */
  /** @param currentPlaybackState - The current playback state before building */
  /** @param currentQueueState - The current queue manager state before building */
  /** @returns Updated playback and queue state after the queue is built with defaults */
  async executeWithDefaults(
    tracks: Track[],
    currentPlaybackState: PlaybackState,
    currentQueueState: QueueManagerState,
  ): Promise<BuildQueueResult> {
    return this.execute(
      { ...DefaultBuildQueueOptions, tracks },
      currentPlaybackState,
      currentQueueState,
    );
  }

  /** @param tracks - Tracks to replace the current queue with */
  /** @param shuffleMode - Shuffle mode to apply to the replacement queue */
  /** @param currentPlaybackState - The current playback state before replacing */
  /** @param currentQueueState - The current queue manager state before replacing */
  /** @returns Updated playback and queue state after the queue is replaced */
  async replaceCurrentQueue(
    tracks: Track[],
    shuffleMode: ShuffleMode,
    currentPlaybackState: PlaybackState,
    currentQueueState: QueueManagerState,
  ): Promise<BuildQueueResult> {
    try {
      if (tracks.length === 0) {
        return {
          playbackState: currentPlaybackState,
          queueManagerState: currentQueueState,
          totalTracksLoaded: 0,
        };
      }

      const updatedQueueState = replaceQueue(currentQueueState, tracks, shuffleMode);
      const updatedPlaybackState = setShuffleMode(currentPlaybackState, shuffleMode);

      await this.audioPort.setQueue(updatedQueueState.queue.tracks);

      await this.persistState(updatedPlaybackState, updatedQueueState);

      return {
        playbackState: updatedPlaybackState,
        queueManagerState: updatedQueueState,
        totalTracksLoaded: totalTracks(updatedQueueState),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to replace queue';
      return {
        playbackState: setError(currentPlaybackState, errorMessage),
        queueManagerState: currentQueueState,
        totalTracksLoaded: 0,
      };
    }
  }

  /** @param tracks - Tracks to build a shuffled queue from */
  /** @param shuffleMode - The specific shuffle algorithm to use */
  /** @param currentPlaybackState - The current playback state before building */
  /** @param currentQueueState - The current queue manager state before building */
  /** @returns Updated playback and queue state after the shuffled queue is built */
  async buildShuffled(
    tracks: Track[],
    shuffleMode: Exclude<ShuffleMode, 'off'>,
    currentPlaybackState: PlaybackState,
    currentQueueState: QueueManagerState,
  ): Promise<BuildQueueResult> {
    try {
      if (tracks.length === 0) {
        return {
          playbackState: currentPlaybackState,
          queueManagerState: currentQueueState,
          totalTracksLoaded: 0,
        };
      }

      const baseQueueState = loadQueue(tracks, 0, 'off', currentQueueState);
      const shuffledQueueState = applyShuffle(baseQueueState, shuffleMode, tracks[0]);
      const updatedPlaybackState = setShuffleMode(currentPlaybackState, shuffleMode);

      await this.audioPort.setQueue(shuffledQueueState.queue.tracks);

      await this.persistState(updatedPlaybackState, shuffledQueueState);

      return {
        playbackState: updatedPlaybackState,
        queueManagerState: shuffledQueueState,
        totalTracksLoaded: totalTracks(shuffledQueueState),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to build shuffled queue';
      return {
        playbackState: setError(currentPlaybackState, errorMessage),
        queueManagerState: currentQueueState,
        totalTracksLoaded: 0,
      };
    }
  }

  /** @param state - The playback state to persist */
  /** @param queueState - The queue manager state to derive persistence data from */
  private async persistState(
    state: PlaybackState,
    queueState: QueueManagerState,
  ): Promise<void> {
    const track = currentTrack(queueState);
    await Promise.all([
      this.storage.savePlaybackState({
        lastTrackId: track?.id ?? null,
        lastPosition: 0,
        shuffleMode: state.shuffleMode,
        repeatMode: state.repeatMode,
        volume: state.volume,
      }),
      this.storage.saveShuffleConfig(queueState.shuffleConfig),
    ]);
  }
}
