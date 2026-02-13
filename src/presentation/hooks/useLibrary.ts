import { useCallback, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { Track } from '../../domain/models/Track';

type SortField = 'title' | 'artist' | 'album' | 'duration' | 'addedAt' | 'year' | 'trackNumber';
type SortDirection = 'asc' | 'desc';

interface LibraryControls {
  readonly scan: (customPath?: string) => Promise<void>;
  readonly getTrackById: (id: string) => Track | undefined;
  readonly getTracksByArtist: (artist: string) => Track[];
  readonly getTracksByAlbum: (album: string) => Track[];
  readonly getTracksByGenre: (genre: string) => Track[];
  readonly searchTracks: (query: string) => Track[];
  readonly getSortedTracks: (field: SortField, direction?: SortDirection) => Track[];
  readonly getArtists: () => string[];
  readonly getAlbums: () => string[];
  readonly getGenres: () => string[];
}

interface LibraryState {
  readonly tracks: Track[];
  readonly totalTracks: number;
  readonly isScanning: boolean;
  readonly scanProgress: { completed: number; total: number; currentFile: string };
  readonly isLoading: boolean;
  readonly isEmpty: boolean;
  readonly error: string | null;
}

interface UseLibraryResult {
  readonly controls: LibraryControls;
  readonly libraryState: LibraryState;
}

function compareValues<T>(a: T, b: T, direction: SortDirection): number {
  if (a == null && b == null) {
    return 0;
  }
  if (a == null) {
    return direction === 'asc' ? 1 : -1;
  }
  if (b == null) {
    return direction === 'asc' ? -1 : 1;
  }

  if (typeof a === 'string' && typeof b === 'string') {
    const result = a.localeCompare(b, undefined, { sensitivity: 'base' });
    return direction === 'asc' ? result : -result;
  }

  if (typeof a === 'number' && typeof b === 'number') {
    return direction === 'asc' ? a - b : b - a;
  }

  return 0;
}

function matchesQuery(track: Track, lowerQuery: string): boolean {
  if (track.title.toLowerCase().includes(lowerQuery)) {
    return true;
  }
  if (track.artist.toLowerCase().includes(lowerQuery)) {
    return true;
  }
  if (track.album.toLowerCase().includes(lowerQuery)) {
    return true;
  }
  if (track.genre && track.genre.toLowerCase().includes(lowerQuery)) {
    return true;
  }
  return false;
}

export function useLibrary(): UseLibraryResult {
  const { state, actions } = useAppContext();
  const { tracks, trackMap, isScanning, scanProgress, isLoading, error } = state;

  const scan = useCallback(async (customPath?: string) => {
    await actions.scanLibrary(customPath);
  }, [actions]);

  const getTrackById = useCallback((id: string): Track | undefined => {
    return trackMap.get(id);
  }, [trackMap]);

  const getTracksByArtist = useCallback((artist: string): Track[] => {
    const lowerArtist = artist.toLowerCase();
    return tracks.filter(t => t.artist.toLowerCase() === lowerArtist);
  }, [tracks]);

  const getTracksByAlbum = useCallback((album: string): Track[] => {
    const lowerAlbum = album.toLowerCase();
    return tracks.filter(t => t.album.toLowerCase() === lowerAlbum);
  }, [tracks]);

  const getTracksByGenre = useCallback((genre: string): Track[] => {
    const lowerGenre = genre.toLowerCase();
    return tracks.filter(t => t.genre !== null && t.genre.toLowerCase() === lowerGenre);
  }, [tracks]);

  const searchTracks = useCallback((query: string): Track[] => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return tracks;
    }
    const lowerQuery = trimmed.toLowerCase();
    return tracks.filter(t => matchesQuery(t, lowerQuery));
  }, [tracks]);

  const getSortedTracks = useCallback((field: SortField, direction: SortDirection = 'asc'): Track[] => {
    const sorted = [...tracks];
    sorted.sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];
      return compareValues(aVal, bVal, direction);
    });
    return sorted;
  }, [tracks]);

  const getArtists = useCallback((): string[] => {
    const artistSet = new Set<string>();
    for (const track of tracks) {
      artistSet.add(track.artist);
    }
    const result = Array.from(artistSet);
    result.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return result;
  }, [tracks]);

  const getAlbums = useCallback((): string[] => {
    const albumSet = new Set<string>();
    for (const track of tracks) {
      albumSet.add(track.album);
    }
    const result = Array.from(albumSet);
    result.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return result;
  }, [tracks]);

  const getGenres = useCallback((): string[] => {
    const genreSet = new Set<string>();
    for (const track of tracks) {
      if (track.genre !== null) {
        genreSet.add(track.genre);
      }
    }
    const result = Array.from(genreSet);
    result.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return result;
  }, [tracks]);

  const controls: LibraryControls = useMemo(() => ({
    scan,
    getTrackById,
    getTracksByArtist,
    getTracksByAlbum,
    getTracksByGenre,
    searchTracks,
    getSortedTracks,
    getArtists,
    getAlbums,
    getGenres,
  }), [scan, getTrackById, getTracksByArtist, getTracksByAlbum, getTracksByGenre, searchTracks, getSortedTracks, getArtists, getAlbums, getGenres]);

  const libraryState: LibraryState = useMemo(() => ({
    tracks,
    totalTracks: tracks.length,
    isScanning,
    scanProgress,
    isLoading,
    isEmpty: tracks.length === 0 && !isLoading && !isScanning,
    error,
  }), [tracks, isScanning, scanProgress, isLoading, error]);

  return { controls, libraryState };
}
