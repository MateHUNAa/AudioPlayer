import TrackPlayer, {
  Event,
  State,
  Capability,
  AppKilledPlaybackBehavior,
} from 'react-native-track-player';
import { Track } from '../../domain/models/Track';
import {
  IAudioPort,
  AudioEventCallbacks,
  AudioPortState,
} from '../../domain/ports/IAudioPort';

function mapTrackToPlayerTrack(track: Track): {
  id: string;
  url: string;
  title: string;
  artist: string;
  album: string;
  artwork: string | undefined;
  duration: number;
} {
  return {
    id: track.id,
    url: `file://${track.filePath}`,
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.artwork ?? undefined,
    duration: track.duration,
  };
}

function mapNativeStateToPortState(nativeState: State): AudioPortState {
  switch (nativeState) {
    case State.Playing:
      return 'playing';
    case State.Paused:
      return 'paused';
    case State.Stopped:
      return 'stopped';
    case State.Buffering:
    case State.Loading:
      return 'buffering';
    case State.Ready:
      return 'ready';
    case State.Error:
      return 'error';
    default:
      return 'idle';
  }
}

export class TrackPlayerAdapter implements IAudioPort {
  private callbacks: Partial<AudioEventCallbacks> = {};
  private initialized = false;
  private positionInterval: ReturnType<typeof setInterval> | null = null;
  private eventSubscriptions: Array<{ remove: () => void }> = [];
  private lastReportedDuration = 0;

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await TrackPlayer.setupPlayer({
      autoHandleInterruptions: true,
    });

    await TrackPlayer.updateOptions({
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.Stop,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
      ],
      compactCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
      ],
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
      },
    });

    this.registerNativeEventListeners();
    this.startPositionPolling();
    this.initialized = true;
  }

  async destroy(): Promise<void> {
    this.stopPositionPolling();
    this.removeNativeEventListeners();
    await TrackPlayer.reset();
    this.initialized = false;
    this.callbacks = {};
  }

  async play(track: Track): Promise<void> {
    const queue = await TrackPlayer.getQueue();
    const existingIndex = queue.findIndex(t => t.id === track.id);

    if (existingIndex >= 0) {
      await TrackPlayer.skip(existingIndex);
      await TrackPlayer.play();
      return;
    }

    await TrackPlayer.reset();
    await TrackPlayer.add(mapTrackToPlayerTrack(track));
    await TrackPlayer.play();
  }

  async pause(): Promise<void> {
    await TrackPlayer.pause();
  }

  async resume(): Promise<void> {
    await TrackPlayer.play();
  }

  async stop(): Promise<void> {
    await TrackPlayer.stop();
    await TrackPlayer.reset();
  }

  async seekTo(positionSeconds: number): Promise<void> {
    await TrackPlayer.seekTo(positionSeconds);
  }

  async setVolume(volume: number): Promise<void> {
    const clamped = Math.max(0, Math.min(1, volume));
    await TrackPlayer.setVolume(clamped);
  }

  async setPlaybackRate(rate: number): Promise<void> {
    const clamped = Math.max(0.25, Math.min(4.0, rate));
    await TrackPlayer.setRate(clamped);
  }

  async getPosition(): Promise<number> {
    const { position } = await TrackPlayer.getProgress();
    return position;
  }

  async getDuration(): Promise<number> {
    const { duration } = await TrackPlayer.getProgress();
    return duration;
  }

  async getState(): Promise<AudioPortState> {
    const playbackState = await TrackPlayer.getPlaybackState();
    return mapNativeStateToPortState(playbackState.state);
  }

  registerCallbacks(callbacks: Partial<AudioEventCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  async setQueue(tracks: readonly Track[]): Promise<void> {
    await TrackPlayer.reset();
    const mapped = tracks.map(mapTrackToPlayerTrack);
    if (mapped.length > 0) {
      await TrackPlayer.add(mapped);
    }
  }

  async skipToTrack(trackId: string): Promise<void> {
    const queue = await TrackPlayer.getQueue();
    const targetIndex = queue.findIndex(t => t.id === trackId);

    if (targetIndex < 0) {
      throw new Error(`Track ${trackId} not found in native queue`);
    }

    await TrackPlayer.skip(targetIndex);
    await TrackPlayer.play();
  }

  private registerNativeEventListeners(): void {
    const playbackStateSubscription = TrackPlayer.addEventListener(
      Event.PlaybackState,
      event => {
        const mappedState = mapNativeStateToPortState(event.state);
        this.callbacks.onStateChange?.(mappedState);
      },
    );
    this.eventSubscriptions.push(playbackStateSubscription);

    const playbackErrorSubscription = TrackPlayer.addEventListener(
      Event.PlaybackError,
      event => {
        const message = event.message ?? 'Unknown playback error';
        this.callbacks.onError?.(message);
      },
    );
    this.eventSubscriptions.push(playbackErrorSubscription);

    const trackEndSubscription = TrackPlayer.addEventListener(
      Event.PlaybackQueueEnded,
      () => {
        this.callbacks.onTrackEnd?.();
      },
    );
    this.eventSubscriptions.push(trackEndSubscription);

    const activeTrackChangedSubscription = TrackPlayer.addEventListener(
      Event.PlaybackActiveTrackChanged,
      event => {
        const trackId = event.track?.id ?? null;
        this.callbacks.onActiveTrackChanged?.(trackId as string | null);
      },
    );
    this.eventSubscriptions.push(activeTrackChangedSubscription);
  }

  private removeNativeEventListeners(): void {
    for (const subscription of this.eventSubscriptions) {
      subscription.remove();
    }
    this.eventSubscriptions = [];
  }

  private startPositionPolling(): void {
    const PollingIntervalMs = 500 as const;

    this.stopPositionPolling();

    this.positionInterval = setInterval(async () => {
      try {
        const playbackState = await TrackPlayer.getPlaybackState();
        if (playbackState.state === State.Playing) {
          const { position, duration } = await TrackPlayer.getProgress();
          this.callbacks.onPositionUpdate?.(position);

          if (duration > 0 && Math.abs(duration - this.lastReportedDuration) > 0.5) {
            this.lastReportedDuration = duration;
            this.callbacks.onDurationUpdate?.(duration);
          }
        }
      } catch {
        /* swallow polling errors silently */
      }
    }, PollingIntervalMs);
  }

  private stopPositionPolling(): void {
    if (this.positionInterval !== null) {
      clearInterval(this.positionInterval);
      this.positionInterval = null;
    }
  }
}
