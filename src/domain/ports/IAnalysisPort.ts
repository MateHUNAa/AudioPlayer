import { RawAnalysis } from '../models/TrackAnalysis';

/** @field Caller-chosen ID (the track ID) */
/** @field Absolute path of the audio file */
export interface AnalysisJob {
  readonly id: string;
  readonly path: string;
}

/** @field Result for one job: either raw features or an error message */
export interface AnalysisResultEvent {
  readonly id: string;
  readonly path: string;
  readonly result?: RawAnalysis;
  readonly error?: string;
}

export interface AnalysisBatchSummary {
  readonly processed: number;
  readonly failed: number;
  readonly cancelled: boolean;
}

/** @interface On-device audio analysis (tempo, key, loudness, timbre, danceability) */
export interface IAnalysisPort {
  /** @returns Whether the native analyzer is present in this build */
  isAvailable(): boolean;

  /** @param jobs - Files to analyze in the background; replaces any running batch */
  /** @param onResult - Called once per finished file */
  /** @param onDone - Called when the batch finishes or is cancelled */
  startBatch(
    jobs: readonly AnalysisJob[],
    onResult: (event: AnalysisResultEvent) => void,
    onDone: (summary: AnalysisBatchSummary) => void,
  ): Promise<void>;

  cancelBatch(): Promise<void>;

  /** @param paths - Files to read tags from; never rejects for individual bad files */
  readMetadata(paths: readonly string[]): Promise<Array<Record<string, unknown>>>;

  /** @returns Whether the app may read/write shared storage outside its own files (needed to restore backups after a reinstall) */
  hasAllFilesAccess(): Promise<boolean>;

  /** Opens the system settings page to grant all-files access. */
  requestAllFilesAccess(): Promise<void>;
}
