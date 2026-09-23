import { Track, createTrack, TrackFormat } from '../../domain/models/Track';
import { IFileSystemPort } from '../../domain/ports/IFileSystemPort';
import { IMetadataPort } from '../../domain/ports/IMetadataPort';
import { IStoragePort, LibraryScanMeta } from '../../domain/ports/IStoragePort';

/** @field Total tracks discovered during scan */
/** @field Tracks that were newly added to the library */
/** @field Tracks that failed metadata parsing */
/** @field Directories scanned */
/** @field Duration of the scan in milliseconds */
export interface ScanResult {
  readonly totalFound: number;
  readonly newTracks: number;
  readonly failedTracks: number;
  readonly directoriesScanned: number;
  readonly durationMs: number;
}

/** @field Callback invoked with scan progress updates */
export type ScanProgressCallback = (
  completed: number,
  total: number,
  currentFile: string,
) => void;

const SupportedExtensions = [
  'mp3',
  'flac',
  'wav',
  'aac',
  'ogg',
  'wma',
  'm4a',
] as const;
const SupportedExtensionSet = new Set<string>(SupportedExtensions);
const BatchSize = 50;

function folderAlbumFallback(filePath: string): string | undefined {
  const separatorIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (separatorIndex <= 0) {
    return undefined;
  }
  const dirPath = filePath.substring(0, separatorIndex);
  const parentSepIndex = Math.max(dirPath.lastIndexOf('/'), dirPath.lastIndexOf('\\'));
  const folderName = parentSepIndex >= 0 ? dirPath.substring(parentSepIndex + 1) : dirPath;
  if (folderName.length === 0 || folderName.toLowerCase() === 'music') {
    return undefined;
  }
  return folderName;
}

function titleFromFileName(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  const base = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
  return (
    base
      .replace(/^\d+[\.\-\s_]+/, '')
      .replace(/[_]/g, ' ')
      .trim() || base
  );
}

export class ScanLibraryUseCase {
  private readonly fileSystem: IFileSystemPort;
  private readonly metadata: IMetadataPort;
  private readonly storage: IStoragePort;

  /** @param fileSystem - File system port for directory scanning */
  /** @param metadata - Metadata port for parsing audio file tags */
  /** @param storage - Storage port for persisting the track index */
  constructor(
    fileSystem: IFileSystemPort,
    metadata: IMetadataPort,
    storage: IStoragePort,
  ) {
    this.fileSystem = fileSystem;
    this.metadata = metadata;
    this.storage = storage;
  }

  /** @param customPath - Optional custom directory path to scan instead of default music folder */
  /** @param onProgress - Optional callback for scan progress updates */
  /** @returns ScanResult summarizing what was found, added, and failed */
  async execute(
    customPath?: string,
    onProgress?: ScanProgressCallback,
  ): Promise<ScanResult> {
    const startTime = Date.now();

    const musicPath =
      customPath ?? (await this.fileSystem.getMusicDirectoryPath());
    console.log('[ScanLibrary] Music path:', musicPath);
    const dirExists = await this.fileSystem.directoryExists(musicPath);
    console.log('[ScanLibrary] Directory exists:', dirExists);
    if (!dirExists) {
      console.log('[ScanLibrary] Directory does not exist, aborting scan.');
      return {
        totalFound: 0,
        newTracks: 0,
        failedTracks: 0,
        directoriesScanned: 0,
        durationMs: Date.now() - startTime,
      };
    }

    const scanResult = await this.fileSystem.scanDirectory(
      musicPath,
      SupportedExtensions,
    );
    console.log(
      '[ScanLibrary] Scan result - files:',
      scanResult.files.length,
      'dirs:',
      scanResult.scannedDirectories,
      'total:',
      scanResult.totalFiles,
      'errors:',
      scanResult.errors,
    );
    if (scanResult.errors.length > 0) {
      console.log(
        '[ScanLibrary] Scan errors:',
        JSON.stringify(scanResult.errors),
      );
    }
    if (scanResult.files.length > 0) {
      console.log(
        '[ScanLibrary] First 5 files:',
        scanResult.files.slice(0, 5).map(f => f.path),
      );
    }
    const existingTracks = await this.storage.loadTracks();
    const existingPathMap = new Map(existingTracks.map(t => [t.filePath, t]));

    const brokenPaths = new Set<string>();
    for (const track of existingTracks) {
      if (track.duration === 0 || track.album === 'Unknown Album') {
        brokenPaths.add(track.filePath);
      }
    }

    const newFiles = scanResult.files.filter(
      f => !existingPathMap.has(f.path) || brokenPaths.has(f.path),
    );
    const scannedSizes = new Map(scanResult.files.map(f => [f.path, f.size]));
    const healthyTracks = existingTracks
      .filter(t => !brokenPaths.has(t.filePath))
      .map(t => {
        // A replaced file at the same path needs a fresh analysis.
        const size = scannedSizes.get(t.filePath);
        return size !== undefined && size !== t.fileSize && t.analysis
          ? { ...t, fileSize: size, analysis: null }
          : t;
      });
    console.log(
      '[ScanLibrary] Existing tracks:',
      existingTracks.length,
      'Broken (re-processing):',
      brokenPaths.size,
      'New files to process:',
      newFiles.length,
    );
    const allTracks = [...healthyTracks];
    let failedCount = 0;
    let processedCount = 0;

    for (let i = 0; i < newFiles.length; i += BatchSize) {
      const batch = newFiles.slice(i, i + BatchSize);
      const filePaths = batch.map(f => f.path);

      console.log(
        '[ScanLibrary] Processing batch',
        Math.floor(i / BatchSize) + 1,
        'of',
        Math.ceil(newFiles.length / BatchSize),
        '- files:',
        batch.length,
      );
      let metadataResults;
      try {
        metadataResults = await this.metadata.parseBatch(
          filePaths,
          (completed, _total) => {
            if (onProgress) {
              const overallCompleted = processedCount + completed;
              const currentFile =
                batch[Math.min(completed, batch.length - 1)]?.name ?? '';
              onProgress(overallCompleted, newFiles.length, currentFile);
            }
          },
        );
        console.log(
          '[ScanLibrary] Batch metadata results count:',
          metadataResults.length,
        );
      } catch (batchError) {
        console.log('[ScanLibrary] Batch metadata parse FAILED:', batchError);
        failedCount += batch.length;
        processedCount += batch.length;
        continue;
      }

      for (let j = 0; j < batch.length; j++) {
        const file = batch[j];
        const result = metadataResults[j];
        const extension = file.extension.toLowerCase();

        if (!SupportedExtensionSet.has(extension)) {
          failedCount++;
          continue;
        }

        const hasMetadata = !result.error && result.metadata;

        const track = createTrack(file.path, {
          title: hasMetadata
            ? result.metadata!.title ?? titleFromFileName(file.name)
            : titleFromFileName(file.name),
          artist: hasMetadata
            ? result.metadata!.artist ?? undefined
            : undefined,
          album: hasMetadata
            ? result.metadata!.album ?? folderAlbumFallback(file.path)
            : folderAlbumFallback(file.path),
          duration: hasMetadata ? result.metadata!.duration : 0,
          artwork: hasMetadata
            ? result.metadata!.artwork ?? undefined
            : undefined,
          genre: hasMetadata ? result.metadata!.genre ?? undefined : undefined,
          trackNumber: hasMetadata
            ? result.metadata!.trackNumber ?? undefined
            : undefined,
          year: hasMetadata ? result.metadata!.year ?? undefined : undefined,
          bpm: hasMetadata ? result.metadata!.bpm ?? undefined : undefined,
          format: extension as TrackFormat,
          fileSize: file.size,
        });

        const previous = existingPathMap.get(file.path);
        allTracks.push(
          previous && previous.fileSize === file.size
            ? { ...track, addedAt: previous.addedAt, analysis: previous.analysis ?? null }
            : track,
        );
      }

      processedCount += batch.length;
    }

    console.log(
      '[ScanLibrary] All tracks after processing:',
      allTracks.length,
      'failed:',
      failedCount,
    );
    const removedTracks = await this.pruneDeletedTracks(allTracks);
    console.log(
      '[ScanLibrary] Pruned (deleted from disk):',
      removedTracks.size,
    );
    const finalTracks = allTracks.filter(t => !removedTracks.has(t.id));
    console.log('[ScanLibrary] Final tracks to save:', finalTracks.length);

    await this.storage.saveTracks(finalTracks);
    console.log('[ScanLibrary] Tracks saved to storage.');

    const scanMeta: LibraryScanMeta = {
      lastScanTimestamp: Date.now(),
      totalTracksFound: finalTracks.length,
      scannedDirectories: [musicPath],
    };
    await this.storage.saveScanMeta(scanMeta);

    return {
      totalFound: scanResult.totalFiles,
      newTracks: newFiles.length - failedCount,
      failedTracks: failedCount,
      directoriesScanned: scanResult.scannedDirectories,
      durationMs: Date.now() - startTime,
    };
  }

  /** @param tracks - Current track list to validate against the file system */
  /** @returns Set of track IDs that no longer exist on disk */
  private async pruneDeletedTracks(tracks: Track[]): Promise<Set<string>> {
    const removed = new Set<string>();

    for (const track of tracks) {
      const exists = await this.fileSystem.fileExists(track.filePath);
      if (!exists) {
        removed.add(track.id);
      }
    }

    return removed;
  }
}
