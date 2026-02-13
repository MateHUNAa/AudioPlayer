import { Track } from '../../domain/models/Track';
import { PlaybackState, setPlaying, setError } from '../../domain/models/PlaybackState';
import { QueueManagerState, loadQueue, skipToTrack } from '../../domain/engine/QueueManager';
import { IAudioPort } from '../../domain/ports/IAudioPort';
import { IStoragePort } from '../../domain/ports/IStoragePort';

/** @field Updated playback state after the track begins playing */
/** @field Updated queue manager state reflecting the loaded track */
export interface PlayTrackResult {
  readonly playbackState: PlaybackState;
  readonly queueManagerState: QueueManagerState;
}

export class PlayTrackUseCase {
  private readonly audioPort: IAudioPort;
  private readonly storage: IStoragePort;

  /** @param audioPort - Audio port adapter for controlling playback */
  /** @param storage - Storage port for persisting playback state */
  constructor(audioPort: IAudioPort, storage: IStoragePort) {
    this.audioPort = audioPort;
    this.storage = storage;
  }

  /** @param track - The track to play */
  /** @param allTracks - Full list of available tracks for queue context */
  /** @param currentPlaybackState - The current playback state before this action */
  /** @param currentQueueState - The current queue manager state before this action */
  /** @returns Updated playback and queue state after the track begins playing */
  async execute(
    track: Track,
    allTracks: Track[],
    currentPlaybackState: PlaybackState,
    currentQueueState: QueueManagerState,
  ): Promise<PlayTrackResult> {
    try {
      const trackIndex = allTracks.findIndex(t => t.id === track.id);
      const startIndex = trackIndex >= 0 ? trackIndex : 0;

      const tracksForQueue = trackIndex >= 0 ? allTracks : [track, ...allTracks];

      const updatedQueueState = loadQueue(
        tracksForQueue,
        startIndex,
        currentQueueState.shuffleConfig.mode,
        currentQueueState,
      );

      const finalQueueState = updatedQueueState.queue.tracks[updatedQueueState.queue.currentIndex]?.id !== track.id
        ? skipToTrack(updatedQueueState, track.id)
        : updatedQueueState;

      await this.audioPort.setQueue(finalQueueState.queue.tracks);
      await this.audioPort.play(track);

      const updatedPlaybackState = setPlaying(currentPlaybackState, track);

      await this.storage.savePlaybackState({
        lastTrackId: track.id,
        lastPosition: 0,
        shuffleMode: updatedPlaybackState.shuffleMode,
        repeatMode: updatedPlaybackState.repeatMode,
        volume: updatedPlaybackState.volume,
      });

      return {
        playbackState: updatedPlaybackState,
        queueManagerState: finalQueueState,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to play track';
      return {
        playbackState: setError(currentPlaybackState, errorMessage),
        queueManagerState: currentQueueState,
      };
    }
  }

  /** @param track - The track to play within the existing queue without rebuilding it */
  /** @param currentPlaybackState - The current playback state before this action */
  /** @param currentQueueState - The current queue manager state before this action */
  /** @returns Updated playback and queue state after jumping to the track */
  async executeInQueue(
    track: Track,
    currentPlaybackState: PlaybackState,
    currentQueueState: QueueManagerState,
  ): Promise<PlayTrackResult> {
    try {
      const updatedQueueState = skipToTrack(currentQueueState, track.id);

      await this.audioPort.skipToTrack(track.id);

      const updatedPlaybackState = setPlaying(currentPlaybackState, track);

      await this.storage.savePlaybackState({
        lastTrackId: track.id,
        lastPosition: 0,
        shuffleMode: updatedPlaybackState.shuffleMode,
        repeatMode: updatedPlaybackState.repeatMode,
        volume: updatedPlaybackState.volume,
      });

      return {
        playbackState: updatedPlaybackState,
        queueManagerState: updatedQueueState,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to skip to track';
      return {
        playbackState: setError(currentPlaybackState, errorMessage),
        queueManagerState: currentQueueState,
      };
    }
  }
}
