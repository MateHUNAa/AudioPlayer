import { ShuffleMode } from './PlaybackState';

/** @field Number of recent tracks to consider for penalty scoring */
/** @field Weight penalty applied when the same artist was recently played */
/** @field Weight penalty applied when the same album was recently played */
/** @field Weight penalty applied to recently played tracks */
/** @field Base weight assigned to every candidate track before penalties */
/** @field Random factor range added to each candidate score */
/** @field Optional deterministic seed for reproducible shuffle sequences */
/** @field Active shuffle mode controlling algorithm behavior */
/** @field Minimum gap enforced between tracks by the same artist */
/** @field Minimum gap enforced between tracks from the same album */
export interface ShuffleConfig {
  readonly historyWindowSize: number;
  readonly artistPenalty: number;
  readonly albumPenalty: number;
  readonly recentPlayPenalty: number;
  readonly baseWeight: number;
  readonly randomnessFactor: number;
  readonly seed: number | null;
  readonly mode: ShuffleMode;
  readonly minArtistGap: number;
  readonly minAlbumGap: number;
}

const DefaultShuffleConfig: ShuffleConfig = {
  historyWindowSize: 20,
  artistPenalty: 30,
  albumPenalty: 20,
  recentPlayPenalty: 50,
  baseWeight: 100,
  randomnessFactor: 15,
  seed: null,
  mode: 'smart',
  minArtistGap: 3,
  minAlbumGap: 2,
};

/** @returns A ShuffleConfig with default smart shuffle settings */
export function createDefaultShuffleConfig(): ShuffleConfig {
  return { ...DefaultShuffleConfig };
}

/** @param overrides - Partial config fields to override defaults */
/** @returns A ShuffleConfig merged with the provided overrides */
export function createShuffleConfig(overrides: Partial<ShuffleConfig>): ShuffleConfig {
  return {
    ...DefaultShuffleConfig,
    ...overrides,
  };
}

/** @param config - The shuffle config to validate */
/** @returns Whether all config values are within acceptable ranges */
export function isValidShuffleConfig(config: ShuffleConfig): boolean {
  return (
    config.historyWindowSize >= 1 &&
    config.historyWindowSize <= 200 &&
    config.artistPenalty >= 0 &&
    config.albumPenalty >= 0 &&
    config.recentPlayPenalty >= 0 &&
    config.baseWeight > 0 &&
    config.randomnessFactor >= 0 &&
    config.minArtistGap >= 0 &&
    config.minAlbumGap >= 0
  );
}

/** @param config - Current shuffle config */
/** @param mode - New shuffle mode to apply */
/** @returns Updated ShuffleConfig with the new mode */
export function withShuffleMode(config: ShuffleConfig, mode: ShuffleMode): ShuffleConfig {
  return {
    ...config,
    mode,
  };
}

/** @param config - Current shuffle config */
/** @param seed - Deterministic seed value for reproducible shuffles */
/** @returns Updated ShuffleConfig with the seed applied */
export function withSeed(config: ShuffleConfig, seed: number | null): ShuffleConfig {
  return {
    ...config,
    seed,
  };
}

/** @param config - Current shuffle config */
/** @param windowSize - New history window size */
/** @returns Updated ShuffleConfig with adjusted history window */
export function withHistoryWindow(config: ShuffleConfig, windowSize: number): ShuffleConfig {
  return {
    ...config,
    historyWindowSize: Math.max(1, Math.min(200, windowSize)),
  };
}

/** @param config - Current shuffle config */
/** @param factor - New randomness factor value */
/** @returns Updated ShuffleConfig with adjusted randomness */
export function withRandomnessFactor(config: ShuffleConfig, factor: number): ShuffleConfig {
  return {
    ...config,
    randomnessFactor: Math.max(0, factor),
  };
}

/** @returns A ShuffleConfig tuned for pure random selection with no smart penalties */
export function createRandomShuffleConfig(): ShuffleConfig {
  return {
    ...DefaultShuffleConfig,
    mode: 'random',
    artistPenalty: 0,
    albumPenalty: 0,
    recentPlayPenalty: 0,
    randomnessFactor: 100,
    minArtistGap: 0,
    minAlbumGap: 0,
  };
}
