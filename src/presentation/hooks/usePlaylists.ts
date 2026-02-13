import { useCallback, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { Track } from '../../domain/models/Track';
import { Playlist } from '../../domain/models/Playlist';

interface PlaylistControls {
  readonly create: (name: string, trackIds?: string[]) => Promise<void>;
  readonly remove: (playlistId: string) => Promise<void>;
  readonly rename: (playlistId: string, name: string) => Promise<void>;
  readonly addTrack: (playlistId: string, trackId: string) => Promise<void>;
  readonly removeTrack: (playlistId: string, trackId: string) => Promise<void>;
  readonly getPlaylistById: (playlistId: string) => Playlist | undefined;
  readonly getPlaylistTracks: (playlistId: string) => Track[];
  readonly playPlaylist: (playlistId: string, startIndex?: number) => Promise<void>;
}

interface PlaylistState {
  readonly playlists: Playlist[];
  readonly totalPlaylists: number;
  readonly isEmpty: boolean;
}

interface UsePlaylistsResult {
  readonly controls: PlaylistControls;
  readonly playlistState: PlaylistState;
}

export function usePlaylists(): UsePlaylistsResult {
  const { state, actions } = useAppContext();

  const create = useCallback(async (name: string, trackIds: string[] = []) => {
    await actions.createPlaylist(name, trackIds);
  }, [actions]);

  const remove = useCallback(async (playlistId: string) => {
    await actions.deletePlaylist(playlistId);
  }, [actions]);

  const rename = useCallback(async (playlistId: string, name: string) => {
    await actions.renamePlaylist(playlistId, name);
  }, [actions]);

  const addTrack = useCallback(async (playlistId: string, trackId: string) => {
    await actions.addToPlaylist(playlistId, trackId);
  }, [actions]);

  const removeTrack = useCallback(async (playlistId: string, trackId: string) => {
    await actions.removeFromPlaylist(playlistId, trackId);
  }, [actions]);

  const getPlaylistById = useCallback((playlistId: string): Playlist | undefined => {
    return state.playlists.find(p => p.id === playlistId);
  }, [state.playlists]);

  const getPlaylistTracks = useCallback((playlistId: string): Track[] => {
    return actions.getPlaylistTracks(playlistId);
  }, [actions]);

  const playPlaylist = useCallback(async (playlistId: string, startIndex: number = 0) => {
    const tracks = actions.getPlaylistTracks(playlistId);
    if (tracks.length === 0) {
      return;
    }
    await actions.playCollection(tracks, startIndex);
  }, [actions]);

  const controls: PlaylistControls = useMemo(() => ({
    create,
    remove,
    rename,
    addTrack,
    removeTrack,
    getPlaylistById,
    getPlaylistTracks,
    playPlaylist,
  }), [create, remove, rename, addTrack, removeTrack, getPlaylistById, getPlaylistTracks, playPlaylist]);

  const playlistState: PlaylistState = useMemo(() => ({
    playlists: state.playlists,
    totalPlaylists: state.playlists.length,
    isEmpty: state.playlists.length === 0,
  }), [state.playlists]);

  return { controls, playlistState };
}
