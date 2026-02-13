import { useCallback, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { Track } from '../../domain/models/Track';

interface FavouriteControls {
  readonly toggle: (trackId: string) => Promise<void>;
  readonly isFavourite: (trackId: string) => boolean;
  readonly playFavourites: (startIndex?: number) => Promise<void>;
}

interface FavouriteState {
  readonly favouriteTracks: Track[];
  readonly favouriteIds: ReadonlySet<string>;
  readonly totalFavourites: number;
  readonly isEmpty: boolean;
}

interface UseFavouritesResult {
  readonly controls: FavouriteControls;
  readonly favouriteState: FavouriteState;
}

export function useFavourites(): UseFavouritesResult {
  const { state, actions } = useAppContext();

  const favouriteTracks = useMemo(() => {
    return state.tracks.filter(t => state.favouriteIds.has(t.id));
  }, [state.tracks, state.favouriteIds]);

  const toggle = useCallback(async (trackId: string) => {
    await actions.toggleFavourite(trackId);
  }, [actions]);

  const isFavourite = useCallback((trackId: string): boolean => {
    return state.favouriteIds.has(trackId);
  }, [state.favouriteIds]);

  const playFavourites = useCallback(async (startIndex: number = 0) => {
    const tracks = state.tracks.filter(t => state.favouriteIds.has(t.id));
    if (tracks.length === 0) {
      return;
    }
    await actions.playCollection(tracks, startIndex);
  }, [state.tracks, state.favouriteIds, actions]);

  const controls: FavouriteControls = useMemo(() => ({
    toggle,
    isFavourite,
    playFavourites,
  }), [toggle, isFavourite, playFavourites]);

  const favouriteState: FavouriteState = useMemo(() => ({
    favouriteTracks,
    favouriteIds: state.favouriteIds,
    totalFavourites: favouriteTracks.length,
    isEmpty: favouriteTracks.length === 0,
  }), [favouriteTracks, state.favouriteIds]);

  return { controls, favouriteState };
}
