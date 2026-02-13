import { Track } from './Track';

/** @field Unique identifier for the playlist */
/** @field Display name of the playlist */
/** @field Ordered list of track IDs in this playlist */
/** @field Timestamp when playlist was created */
/** @field Timestamp when playlist was last modified */
export interface Playlist {
  readonly id: string;
  readonly name: string;
  readonly trackIds: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** @param name - Display name for the new playlist */
/** @param trackIds - Optional initial list of track IDs */
/** @returns A new Playlist domain model */
export function createPlaylist(name: string, trackIds: string[] = []): Playlist {
  const now = Date.now();
  return {
    id: generatePlaylistId(name, now),
    name,
    trackIds: [...trackIds],
    createdAt: now,
    updatedAt: now,
  };
}

/** @param playlist - The playlist to modify */
/** @param trackId - The track ID to append */
/** @returns A new Playlist with the track appended */
export function addTrackToPlaylist(playlist: Playlist, trackId: string): Playlist {
  if (playlist.trackIds.includes(trackId)) {
    return playlist;
  }
  return {
    ...playlist,
    trackIds: [...playlist.trackIds, trackId],
    updatedAt: Date.now(),
  };
}

/** @param playlist - The playlist to modify */
/** @param trackId - The track ID to remove */
/** @returns A new Playlist with the track removed */
export function removeTrackFromPlaylist(playlist: Playlist, trackId: string): Playlist {
  const filtered = playlist.trackIds.filter(id => id !== trackId);
  if (filtered.length === playlist.trackIds.length) {
    return playlist;
  }
  return {
    ...playlist,
    trackIds: filtered,
    updatedAt: Date.now(),
  };
}

/** @param playlist - The playlist to modify */
/** @param fromIndex - Current index of the track to move */
/** @param toIndex - Target index to move the track to */
/** @returns A new Playlist with the track reordered */
export function reorderPlaylistTrack(
  playlist: Playlist,
  fromIndex: number,
  toIndex: number,
): Playlist {
  if (
    fromIndex < 0 ||
    fromIndex >= playlist.trackIds.length ||
    toIndex < 0 ||
    toIndex >= playlist.trackIds.length ||
    fromIndex === toIndex
  ) {
    return playlist;
  }

  const trackIds = [...playlist.trackIds];
  const [moved] = trackIds.splice(fromIndex, 1);
  trackIds.splice(toIndex, 0, moved);

  return {
    ...playlist,
    trackIds,
    updatedAt: Date.now(),
  };
}

/** @param playlist - The playlist to query */
/** @param tracks - Map of all available tracks keyed by ID */
/** @returns Resolved Track objects in playlist order */
export function resolvePlaylistTracks(
  playlist: Playlist,
  tracks: ReadonlyMap<string, Track>,
): Track[] {
  const resolved: Track[] = [];
  for (const trackId of playlist.trackIds) {
    const track = tracks.get(trackId);
    if (track) {
      resolved.push(track);
    }
  }
  return resolved;
}

/** @param name - Playlist name used for ID generation */
/** @param timestamp - Creation timestamp for uniqueness */
/** @returns A deterministic playlist identifier */
function generatePlaylistId(name: string, timestamp: number): string {
  let hash = 0;
  const seed = `${name}_${timestamp}`;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `pl_${Math.abs(hash).toString(36)}`;
}
