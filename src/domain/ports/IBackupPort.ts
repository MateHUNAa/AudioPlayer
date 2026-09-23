import { AnalysisBackup, LibraryBackup } from '../models/Backup';

/** @interface Backup files kept outside the app's private storage so they survive reinstalls */
export interface IBackupPort {
  /** @returns Human-readable folder where backups are written */
  getBackupLocation(): string;

  writeLibraryBackup(backup: LibraryBackup): Promise<void>;

  /** @returns The saved backup, or null if none exists or it cannot be read */
  readLibraryBackup(): Promise<LibraryBackup | null>;

  writeAnalysisBackup(backup: AnalysisBackup): Promise<void>;

  readAnalysisBackup(): Promise<AnalysisBackup | null>;

  /** @param line - Text appended to the error log (for diagnosing crashes) */
  appendErrorLog(line: string): Promise<void>;
}
