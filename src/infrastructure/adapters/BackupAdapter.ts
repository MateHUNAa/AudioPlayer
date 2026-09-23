import RNFS from 'react-native-fs';
import { IBackupPort } from '../../domain/ports/IBackupPort';
import {
  AnalysisBackup,
  LibraryBackup,
  isLibraryBackup,
} from '../../domain/models/Backup';

// Shared storage is not wiped when the app is uninstalled or reinstalled with a different
// signature, unlike AsyncStorage, which lives in the app's private data.
const BackupDir = `${RNFS.ExternalStorageDirectoryPath}/Documents/AudioPlayer`;
const LibraryFile = `${BackupDir}/library-backup.json`;
const AnalysisFile = `${BackupDir}/analysis-cache.json`;
const ErrorLogFile = `${BackupDir}/error-log.txt`;
const MaxErrorLogBytes = 64 * 1024;

async function ensureDir(): Promise<void> {
  if (!(await RNFS.exists(BackupDir))) {
    await RNFS.mkdir(BackupDir);
  }
}

/** Writes to a temp file first so a crash mid-write never leaves a truncated backup. */
async function writeAtomic(path: string, contents: string): Promise<void> {
  await ensureDir();
  const tmp = `${path}.tmp`;
  await RNFS.writeFile(tmp, contents, 'utf8');
  if (await RNFS.exists(path)) {
    await RNFS.unlink(path);
  }
  await RNFS.moveFile(tmp, path);
}

async function readJson(path: string): Promise<unknown> {
  try {
    if (!(await RNFS.exists(path))) {
      return null;
    }
    return JSON.parse(await RNFS.readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

export class BackupAdapter implements IBackupPort {
  getBackupLocation(): string {
    return 'Internal storage/Documents/AudioPlayer';
  }

  async writeLibraryBackup(backup: LibraryBackup): Promise<void> {
    await writeAtomic(LibraryFile, JSON.stringify(backup));
  }

  async readLibraryBackup(): Promise<LibraryBackup | null> {
    const data = await readJson(LibraryFile);
    return isLibraryBackup(data) ? data : null;
  }

  async writeAnalysisBackup(backup: AnalysisBackup): Promise<void> {
    await writeAtomic(AnalysisFile, JSON.stringify(backup));
  }

  async readAnalysisBackup(): Promise<AnalysisBackup | null> {
    const data = (await readJson(AnalysisFile)) as AnalysisBackup | null;
    return data && data.version === 1 && data.entries ? data : null;
  }

  async appendErrorLog(line: string): Promise<void> {
    try {
      await ensureDir();
      if (await RNFS.exists(ErrorLogFile)) {
        const stat = await RNFS.stat(ErrorLogFile);
        if (Number(stat.size) > MaxErrorLogBytes) {
          await RNFS.unlink(ErrorLogFile);
        }
      }
      await RNFS.appendFile(ErrorLogFile, `${line}\n`, 'utf8');
    } catch {
      /* logging must never throw */
    }
  }
}
