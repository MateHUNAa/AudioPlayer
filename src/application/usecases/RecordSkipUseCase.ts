import { ISkipStatsPort } from '../../domain/ports/ISkipStatsPort';
import {
  SkipStatsMap,
  recordSkip,
  recordPlay,
} from '../../domain/models/SkipStats';

export interface RecordSkipResult {
  readonly trackId: string;
  readonly listenPercent: number;
  readonly wasSkip: boolean;
  readonly updatedStats: SkipStatsMap;
}

export class RecordSkipUseCase {
  private readonly skipStatsPort: ISkipStatsPort;

  /** @param skipStatsPort - Port for persisting skip statistics */
  constructor(skipStatsPort: ISkipStatsPort) {
    this.skipStatsPort = skipStatsPort;
  }

  /** @param trackId - ID of the track that was skipped */
  /** @param listenPercent - Fraction of the track listened before skipping (0.0 to 1.0) */
  /** @param currentStats - Current in-memory skip stats map */
  /** @returns Updated skip stats after recording the skip */
  async executeSkip(
    trackId: string,
    listenPercent: number,
    currentStats: SkipStatsMap,
  ): Promise<RecordSkipResult> {
    if (!trackId || trackId.trim().length === 0) {
      return {
        trackId: '',
        listenPercent: 0,
        wasSkip: false,
        updatedStats: currentStats,
      };
    }

    const clampedPercent = Math.max(0, Math.min(1, listenPercent));
    const updatedStats = recordSkip(currentStats, trackId, clampedPercent);

    await this.skipStatsPort.saveSkipStats(updatedStats);

    return {
      trackId,
      listenPercent: clampedPercent,
      wasSkip: true,
      updatedStats,
    };
  }

  /** @param trackId - ID of the track that completed naturally */
  /** @param currentStats - Current in-memory skip stats map */
  /** @returns Updated skip stats after recording the full play */
  async executeFullPlay(
    trackId: string,
    currentStats: SkipStatsMap,
  ): Promise<RecordSkipResult> {
    if (!trackId || trackId.trim().length === 0) {
      return {
        trackId: '',
        listenPercent: 1.0,
        wasSkip: false,
        updatedStats: currentStats,
      };
    }

    const updatedStats = recordPlay(currentStats, trackId);

    await this.skipStatsPort.saveSkipStats(updatedStats);

    return {
      trackId,
      listenPercent: 1.0,
      wasSkip: false,
      updatedStats,
    };
  }
}
