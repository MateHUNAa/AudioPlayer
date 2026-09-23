import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

/** @field Current playback position in seconds */
/** @field Current track duration in seconds */
export interface ProgressSnapshot {
  readonly position: number;
  readonly duration: number;
}

type Listener = () => void;

/*
 * Playback position lives outside the main app context on purpose: it changes every second,
 * and routing it through the context re-rendered every screen (including the full song list)
 * on each tick. Only components that show progress subscribe here. While the app is in the
 * background nothing is re-rendered; the latest value is delivered once on return.
 */
let snapshot: ProgressSnapshot = { position: 0, duration: 0 };
const listeners = new Set<Listener>();
let appActive = AppState.currentState === 'active' || AppState.currentState == null;
let pendingNotify = false;

function notify(): void {
  if (!appActive) {
    pendingNotify = true;
    return;
  }
  pendingNotify = false;
  listeners.forEach(l => l());
}

AppState.addEventListener('change', next => {
  appActive = next === 'active';
  if (appActive && pendingNotify) {
    notify();
  }
});

export const ProgressStore = {
  get(): ProgressSnapshot {
    return snapshot;
  },

  setPosition(position: number): void {
    if (Math.abs(position - snapshot.position) < 0.05) {
      return;
    }
    snapshot = { ...snapshot, position };
    notify();
  },

  setDuration(duration: number): void {
    if (duration === snapshot.duration) {
      return;
    }
    snapshot = { ...snapshot, duration };
    notify();
  },

  reset(duration: number): void {
    snapshot = { position: 0, duration };
    notify();
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** @returns Live playback progress; re-renders only the calling component */
export function usePlaybackProgress(): ProgressSnapshot & { readonly fraction: number } {
  const current = useSyncExternalStore(ProgressStore.subscribe, ProgressStore.get);
  const fraction = current.duration > 0 ? Math.min(1, current.position / current.duration) : 0;
  return { ...current, fraction };
}
