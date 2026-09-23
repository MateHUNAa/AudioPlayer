import TrackPlayer, {
  Event,
  State,
  Capability,
  AppKilledPlaybackBehavior,
  TrackType,
} from 'react-native-track-player';
import { Track } from '../../domain/models/Track';
import {
  IAudioPort,
  AudioEventCallbacks,
  AudioPortState,
} from '../../domain/ports/IAudioPort';
import { getMimeTypeForFormat } from '../utils/AudioMimeTypes';

const LoneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function encodeSegment(segment: string): string {
  try {
    return encodeURIComponent(segment);
  } catch {
    // encodeURIComponent throws URIError on malformed UTF-16; never let a file name crash playback.
    return encodeURIComponent(segment.replace(LoneSurrogate, '�'));
  }
}

function encodeFileUri(filePath: string): string {
  return 'file://' + filePath.split('/').map(encodeSegment).join('/');
}

function mapTrackToPlayerTrack(track: Track): {
  id: string;
  url: string;
  type: TrackType;
  contentType: string;
  title: string;
  artist: string;
  album: string;
  artwork: string | undefined;
  duration: number;
} {
  return {
    id: track.id,
    url: encodeFileUri(track.filePath),
    type: TrackType.Default,
    contentType: getMimeTypeForFormat(track.format),
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

/** Native progress events per second; replaces the old JS setInterval polling. */
const ProgressIntervalSeconds = 1;

export class TrackPlayerAdapter implements IAudioPort {
  private callbacks: Partial<AudioEventCallbacks> = {};
  private initialized = false;
  private eventSubscriptions: Array<{ remove: () => void }> = [];
  private lastReportedDuration = 0;
  /** Mirror of the native queue order, so skips don't fetch the whole queue over the bridge. */
  private nativeOrder: string[] = [];
  private nativeIndex = new Map<string, number>();

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
      progressUpdateEventInterval: ProgressIntervalSeconds,
    });

    this.registerNativeEventListeners();
    this.initialized = true;
  }

  async destroy(): Promise<void> {
    this.removeNativeEventListeners();
    await TrackPlayer.reset();
    this.initialized = false;
    this.callbacks = {};
  }

  async play(track: Track): Promise<void> {
    const existingIndex = this.nativeIndex.get(track.id);

    if (existingIndex !== undefined) {
      await TrackPlayer.skip(existingIndex);
      await TrackPlayer.play();
      return;
    }

    await TrackPlayer.reset();
    await TrackPlayer.add(mapTrackToPlayerTrack(track));
    this.setNativeOrder([track.id]);
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
    this.setNativeOrder([]);
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
    this.setNativeOrder([]);
    const mapped = tracks.map(mapTrackToPlayerTrack);
    if (mapped.length > 0) {
      await TrackPlayer.add(mapped);
    }
    this.setNativeOrder(tracks.map(t => t.id));
  }

  async skipToTrack(trackId: string): Promise<void> {
    let targetIndex = this.nativeIndex.get(trackId);

    if (targetIndex === undefined) {
      const queue = await TrackPlayer.getQueue();
      this.setNativeOrder(queue.map(t => String(t.id)));
      targetIndex = this.nativeIndex.get(trackId);
    }

    if (targetIndex === undefined) {
      throw new Error(`Track ${trackId} not found in native queue`);
    }

    await TrackPlayer.skip(targetIndex);
    await TrackPlayer.play();
  }

  async alignQueue(
    currentTrackId: string,
    tracks: readonly Track[],
    currentIndex: number,
    frontCount?: number,
  ): Promise<boolean> {
    const activeIndex = await TrackPlayer.getActiveTrackIndex();
    if (
      activeIndex === undefined ||
      this.nativeOrder[activeIndex] !== currentTrackId ||
      tracks[currentIndex]?.id !== currentTrackId
    ) {
      return false;
    }
    const before = tracks.slice(0, currentIndex);
    const upcoming = tracks.slice(currentIndex + 1);
    const nativeBefore = this.nativeOrder.slice(0, activeIndex);
    const sameBefore =
      nativeBefore.length === before.length && nativeBefore.every((id, i) => id === before[i].id);

    if (sameBefore && frontCount != null && frontCount > 0 && frontCount < upcoming.length) {
      // Only the first frontCount songs moved: pull them out and re-insert them after the
      // current one, instead of re-sending the whole queue (TrackPlayer.add runs on the UI thread).
      const front = upcoming.slice(0, frontCount);
      const frontIds = new Set(front.map(t => t.id));
      const nativeUpcoming = this.nativeOrder.slice(activeIndex + 1);
      const nativeRest = nativeUpcoming.filter(id => !frontIds.has(id));
      const targetRest = upcoming.slice(frontCount);
      const cheapPathValid =
        nativeUpcoming.length === upcoming.length &&
        nativeRest.length === targetRest.length &&
        nativeRest.every((id, i) => id === targetRest[i].id);
      if (cheapPathValid) {
        const indices: number[] = [];
        nativeUpcoming.forEach((id, i) => {
          if (frontIds.has(id)) {
            indices.push(activeIndex + 1 + i);
          }
        });
        await TrackPlayer.remove(indices);
        await TrackPlayer.add(front.map(mapTrackToPlayerTrack), activeIndex + 1);
        this.setNativeOrder(tracks.map(t => t.id));
        return true;
      }
    }

    await TrackPlayer.removeUpcomingTracks();
    if (upcoming.length > 0) {
      await TrackPlayer.add(upcoming.map(mapTrackToPlayerTrack));
    }

    if (!sameBefore) {
      // Rebuild the already-played part around the current song, which keeps playing.
      if (activeIndex > 0) {
        await TrackPlayer.remove(Array.from({ length: activeIndex }, (_, i) => i));
      }
      if (before.length > 0) {
        await TrackPlayer.add(before.map(mapTrackToPlayerTrack), 0);
      }
    }
    this.setNativeOrder(tracks.map(t => t.id));
    return true;
  }

  private setNativeOrder(ids: string[]): void {
    this.nativeOrder = ids;
    this.nativeIndex = new Map();
    ids.forEach((id, i) => {
      if (!this.nativeIndex.has(id)) {
        this.nativeIndex.set(id, i);
      }
    });
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
        const trackId = event.track?.id != null ? String(event.track.id) : null;
        const previous = event.lastTrack
          ? {
              trackId: event.lastTrack.id != null ? String(event.lastTrack.id) : null,
              position: event.lastPosition ?? 0,
            }
          : null;
        this.callbacks.onActiveTrackChanged?.(trackId, previous);
      },
    );
    this.eventSubscriptions.push(activeTrackChangedSubscription);

    const progressSubscription = TrackPlayer.addEventListener(
      Event.PlaybackProgressUpdated,
      event => {
        this.callbacks.onPositionUpdate?.(event.position);
        if (
          event.duration > 0 &&
          Math.abs(event.duration - this.lastReportedDuration) > 0.5
        ) {
          this.lastReportedDuration = event.duration;
          this.callbacks.onDurationUpdate?.(event.duration);
        }
      },
    );
    this.eventSubscriptions.push(progressSubscription);
  }

  private removeNativeEventListeners(): void {
    for (const subscription of this.eventSubscriptions) {
      subscription.remove();
    }
    this.eventSubscriptions = [];
  }
}
