import { IBpmPort } from '../../domain/ports/IBpmPort';

/** @field Whether the analysis was served from cache */
/** @field The detected BPM value (0 if undetectable) */
/** @field The file path that was analyzed */
export interface AnalyzeBpmResult {
  readonly bpm: number;
  readonly filePath: string;
  readonly fromCache: boolean;
}

export class AnalyzeBpmUseCase {
  private readonly bpmPort: IBpmPort;

  /** @param bpmPort - Port implementation for BPM analysis operations */
  constructor(bpmPort: IBpmPort) {
    this.bpmPort = bpmPort;
  }

  /** @param filePath - Absolute path to the audio file to analyze */
  /** @returns BPM analysis result with cache status */
  async execute(filePath: string): Promise<AnalyzeBpmResult> {
    if (!filePath || filePath.trim().length === 0) {
      throw new Error('File path must not be empty');
    }

    const cached = await this.bpmPort.getCachedBpm(filePath);
    if (cached !== null) {
      return { bpm: cached, filePath, fromCache: true };
    }

    const bpm = await this.bpmPort.analyzeBpm(filePath);
    return { bpm, filePath, fromCache: false };
  }

  /** @param filePaths - Array of absolute paths to analyze in batch */
  /** @returns Array of results in the same order as input paths */
  async executeBatch(
    filePaths: readonly string[],
  ): Promise<AnalyzeBpmResult[]> {
    const results: AnalyzeBpmResult[] = [];

    for (const filePath of filePaths) {
      try {
        const result = await this.execute(filePath);
        results.push(result);
      } catch {
        results.push({ bpm: 0, filePath, fromCache: false });
      }
    }

    return results;
  }
}
