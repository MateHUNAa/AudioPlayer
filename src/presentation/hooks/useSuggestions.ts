import { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { Suggestion, computeSuggestions } from '../../domain/models/Suggestions';

/** @returns Songs you keep playing to the end but haven't loved yet, best first */
export function useSuggestions(): Suggestion[] {
  const { state } = useAppContext();
  const { tracks, favouriteIds, dismissedSuggestions } = state;
  const skipStats = state.queueManagerState.skipStats;

  return useMemo(
    () => computeSuggestions(tracks, skipStats, favouriteIds, dismissedSuggestions),
    [tracks, skipStats, favouriteIds, dismissedSuggestions],
  );
}
