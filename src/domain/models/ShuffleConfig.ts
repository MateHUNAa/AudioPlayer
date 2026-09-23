import { ShuffleMode } from './PlaybackState';

export type BpmMode = 'off' | 'similar' | 'gradual';

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
/** @field BPM matching strategy used during shuffle scoring */
/** @field Allowed BPM deviation before penalties apply in similar mode */
/** @field Weight penalty applied when candidate BPM deviates from anchor */
/** @field Weight penalty applied to tracks the user frequently skips */
/** @field How strongly each pick should match the current vibe (analysis-based), 0 disables */
/** @field How strongly this session's skips/full listens steer upcoming picks, 0 disables */
/** @field Score bonus for loved tracks */
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
  readonly bpmMode: BpmMode;
  readonly bpmTolerance: number;
  readonly bpmPenalty: number;
  readonly skipPenalty: number;
  readonly vibeWeight: number;
  readonly sessionWeight: number;
  readonly favouriteBoost: number;
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
  bpmMode: 'off',
  bpmTolerance: 10,
  bpmPenalty: 35,
  skipPenalty: 40,
  vibeWeight: 45,
  sessionWeight: 50,
  favouriteBoost: 15,
};

/** @returns A ShuffleConfig with default smart shuffle settings */
export function createDefaultShuffleConfig(): ShuffleConfig {
  return { ...DefaultShuffleConfig };
}

/** @param overrides - Partial config fields to override defaults */
/** @returns A ShuffleConfig merged with the provided overrides */
export function createShuffleConfig(
  overrides: Partial<ShuffleConfig>,
): ShuffleConfig {
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
    config.minAlbumGap >= 0 &&
    config.bpmTolerance >= 1 &&
    config.bpmTolerance <= 60 &&
    config.bpmPenalty >= 0 &&
    config.skipPenalty >= 0 &&
    config.vibeWeight >= 0 &&
    config.sessionWeight >= 0 &&
    config.favouriteBoost >= 0
  );
}

/** @param config - Current shuffle config */
/** @param mode - New shuffle mode to apply */
/** @returns Updated ShuffleConfig with the new mode */
export function withShuffleMode(
  config: ShuffleConfig,
  mode: ShuffleMode,
): ShuffleConfig {
  return {
    ...config,
    mode,
  };
}

/** @param config - Current shuffle config */
/** @param seed - Deterministic seed value for reproducible shuffles */
/** @returns Updated ShuffleConfig with the seed applied */
export function withSeed(
  config: ShuffleConfig,
  seed: number | null,
): ShuffleConfig {
  return {
    ...config,
    seed,
  };
}

/** @param config - Current shuffle config */
/** @param windowSize - New history window size */
/** @returns Updated ShuffleConfig with adjusted history window */
export function withHistoryWindow(
  config: ShuffleConfig,
  windowSize: number,
): ShuffleConfig {
  return {
    ...config,
    historyWindowSize: Math.max(1, Math.min(200, windowSize)),
  };
}

/** @param config - Current shuffle config */
/** @param factor - New randomness factor value */
/** @returns Updated ShuffleConfig with adjusted randomness */
export function withRandomnessFactor(
  config: ShuffleConfig,
  factor: number,
): ShuffleConfig {
  return {
    ...config,
    randomnessFactor: Math.max(0, factor),
  };
}

/** @param config - Current shuffle config */
/** @param bpmMode - New BPM matching strategy */
/** @returns Updated ShuffleConfig with new BPM mode */
export function withBpmMode(
  config: ShuffleConfig,
  bpmMode: BpmMode,
): ShuffleConfig {
  return {
    ...config,
    bpmMode,
  };
}

/** @param config - Current shuffle config */
/** @param tolerance - New BPM tolerance value clamped between 1 and 60 */
/** @returns Updated ShuffleConfig with adjusted BPM tolerance */
export function withBpmTolerance(
  config: ShuffleConfig,
  tolerance: number,
): ShuffleConfig {
  return {
    ...config,
    bpmTolerance: Math.max(1, Math.min(60, tolerance)),
  };
}

/** @param config - Current shuffle config */
/** @param penalty - New BPM penalty weight */
/** @returns Updated ShuffleConfig with adjusted BPM penalty */
export function withBpmPenalty(
  config: ShuffleConfig,
  penalty: number,
): ShuffleConfig {
  return {
    ...config,
    bpmPenalty: Math.max(0, penalty),
  };
}

/** @param config - Current shuffle config */
/** @param penalty - New skip penalty weight */
/** @returns Updated ShuffleConfig with adjusted skip penalty */
export function withSkipPenalty(
  config: ShuffleConfig,
  penalty: number,
): ShuffleConfig {
  return {
    ...config,
    skipPenalty: Math.max(0, penalty),
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
    bpmMode: 'off',
    bpmPenalty: 0,
    skipPenalty: 0,
    vibeWeight: 0,
    sessionWeight: 0,
    favouriteBoost: 0,
  };
}

/** @param raw - A config loaded from storage, possibly saved by an older app version */
/** @returns A complete config: missing or invalid fields fall back to defaults */
export function normalizeShuffleConfig(raw: unknown): ShuffleConfig {
  if (raw == null || typeof raw !== 'object') {
    return createDefaultShuffleConfig();
  }
  const source = raw as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...DefaultShuffleConfig };
  for (const key of Object.keys(DefaultShuffleConfig) as (keyof ShuffleConfig)[]) {
    const value = source[key];
    const fallback = DefaultShuffleConfig[key];
    if (typeof fallback === 'number' || fallback === null) {
      if (typeof value === 'number' && isFinite(value)) {
        merged[key] = value;
      }
    } else if (typeof value === typeof fallback) {
      merged[key] = value;
    }
  }
  const config = merged as unknown as ShuffleConfig;
  return isValidShuffleConfig(config) ? config : { ...createDefaultShuffleConfig(), mode: config.mode };
}
