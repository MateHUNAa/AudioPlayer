import TrackPlayer, { Event } from 'react-native-track-player';

async function PlaybackService(): Promise<void> {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    TrackPlayer.stop();
  });

  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    TrackPlayer.skipToNext();
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    TrackPlayer.skipToPrevious();
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, (event) => {
    TrackPlayer.seekTo(event.position);
  });

  TrackPlayer.addEventListener(Event.RemoteDuck, (event) => {
    if (event.paused) {
      TrackPlayer.pause();
      return;
    }

    if (event.permanent) {
      TrackPlayer.stop();
      return;
    }

    TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemoteJumpForward, async (event) => {
    const { position } = await TrackPlayer.getProgress();
    const { duration } = await TrackPlayer.getProgress();
    const target = Math.min(position + event.interval, duration);
    await TrackPlayer.seekTo(target);
  });

  TrackPlayer.addEventListener(Event.RemoteJumpBackward, async (event) => {
    const { position } = await TrackPlayer.getProgress();
    const target = Math.max(position - event.interval, 0);
    await TrackPlayer.seekTo(target);
  });

  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (event) => {
    if (event.track == null) {
      return;
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackPlayWhenReadyChanged, (_event) => {
    /* reserved for future analytics or state sync */
  });
}

export default PlaybackService;
