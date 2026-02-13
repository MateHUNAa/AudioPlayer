import RNFS from 'react-native-fs';
import {
  IFileSystemPort,
  FileEntry,
  DirectoryScanResult,
} from '../../domain/ports/IFileSystemPort';
import { getMimeTypeForExtension } from '../utils/AudioMimeTypes';

function extractExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1 || lastDot === fileName.length - 1) {
    return '';
  }
  return fileName.substring(lastDot + 1).toLowerCase();
}
const DefaultMusicPath = `${RNFS.ExternalStorageDirectoryPath}/Music`;

export class FileSystemAdapter implements IFileSystemPort {
  /** @param directoryPath - Absolute path to the directory to scan */
  /** @param extensions - List of file extensions to filter by (without dot) */
  /** @returns All matching files found recursively within the directory */
  async scanDirectory(
    directoryPath: string,
    extensions: readonly string[],
  ): Promise<DirectoryScanResult> {
    const extensionSet = new Set(extensions.map(e => e.toLowerCase()));
    const collectedFiles: FileEntry[] = [];
    const errors: string[] = [];
    let scannedDirectories = 0;
    let totalFiles = 0;

    await this.scanRecursive(
      directoryPath,
      extensionSet,
      collectedFiles,
      errors,
      {
        scannedDirectories: 0,
        totalFiles: 0,
      },
    ).then(counts => {
      scannedDirectories = counts.scannedDirectories;
      totalFiles = counts.totalFiles;
    });

    return {
      files: collectedFiles,
      scannedDirectories,
      totalFiles,
      errors,
    };
  }

  /** @param filePath - Absolute path to the file to check */
  /** @returns Whether the file exists on the file system */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      return await RNFS.exists(filePath);
    } catch {
      return false;
    }
  }

  /** @param directoryPath - Absolute path to the directory to check */
  /** @returns Whether the directory exists on the file system */
  async directoryExists(directoryPath: string): Promise<boolean> {
    try {
      const exists = await RNFS.exists(directoryPath);
      if (!exists) {
        return false;
      }
      const stat = await RNFS.stat(directoryPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /** @param filePath - Absolute path to the file */
  /** @returns File size in bytes */
  async getFileSize(filePath: string): Promise<number> {
    const stat = await RNFS.stat(filePath);
    return Number(stat.size);
  }

  /** @returns Absolute path to the device music directory */
  async getMusicDirectoryPath(): Promise<string> {
    return DefaultMusicPath;
  }

  /** @param filePath - Absolute path to the file to read */
  /** @returns Raw file content as a base64-encoded string */
  async readFileBase64(filePath: string): Promise<string> {
    return await RNFS.readFile(filePath, 'base64');
  }

  /** @param filePath - Absolute path to the file */
  /** @returns MIME type string for the given file */
  async getFileMimeType(filePath: string): Promise<string> {
    const extension = extractExtension(filePath.split('/').pop() ?? '');
    return getMimeTypeForExtension(extension);
  }

  /** @param dirPath - Current directory being scanned */
  /** @param extensionSet - Set of allowed extensions for filtering */
  /** @param results - Accumulator array for discovered files */
  /** @param errors - Accumulator array for scan errors */
  /** @param counts - Mutable counters for directories and files scanned */
  /** @returns Updated directory and file counts after recursive scan */
  private async scanRecursive(
    dirPath: string,
    extensionSet: ReadonlySet<string>,
    results: FileEntry[],
    errors: string[],
    counts: { scannedDirectories: number; totalFiles: number },
  ): Promise<{ scannedDirectories: number; totalFiles: number }> {
    try {
      const items = await RNFS.readDir(dirPath);
      counts.scannedDirectories++;

      for (const item of items) {
        if (item.isDirectory()) {
          if (item.name.startsWith('.')) {
            continue;
          }
          await this.scanRecursive(
            item.path,
            extensionSet,
            results,
            errors,
            counts,
          );
          continue;
        }

        if (!item.isFile()) {
          continue;
        }

        counts.totalFiles++;

        const extension = extractExtension(item.name);
        if (extension === '' || !extensionSet.has(extension)) {
          continue;
        }

        const entry: FileEntry = {
          path: item.path,
          name: item.name,
          extension,
          size: Number(item.size),
          lastModified: item.mtime ? item.mtime.getTime() : 0,
        };

        results.push(entry);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Failed to scan ${dirPath}`;
      errors.push(message);
    }

    return counts;
  }
}
