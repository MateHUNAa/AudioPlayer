import { TrackPlayerAdapter } from '../infrastructure/adapters/TrackPlayerAdapter';
import { FileSystemAdapter } from '../infrastructure/adapters/FileSystemAdapter';
import { MetadataParser } from '../infrastructure/adapters/MetadataParser';
import { StorageAdapter } from '../infrastructure/adapters/StorageAdapter';
import { BpmAdapter } from '../infrastructure/adapters/BpmAdapter';
import { SkipStatsAdapter } from '../infrastructure/adapters/SkipStatsAdapter';
import { AudioAnalyzerAdapter } from '../infrastructure/adapters/AudioAnalyzerAdapter';
import { BackupAdapter } from '../infrastructure/adapters/BackupAdapter';
import { IAudioPort } from '../domain/ports/IAudioPort';
import { IFileSystemPort } from '../domain/ports/IFileSystemPort';
import { IMetadataPort } from '../domain/ports/IMetadataPort';
import { IStoragePort } from '../domain/ports/IStoragePort';
import { IBpmPort } from '../domain/ports/IBpmPort';
import { ISkipStatsPort } from '../domain/ports/ISkipStatsPort';
import { IAnalysisPort } from '../domain/ports/IAnalysisPort';
import { IBackupPort } from '../domain/ports/IBackupPort';
import { ScanLibraryUseCase } from '../application/usecases/ScanLibraryUseCase';
import { PlayTrackUseCase } from '../application/usecases/PlayTrackUseCase';
import { TogglePlaybackUseCase } from '../application/usecases/TogglePlaybackUseCase';
import { NextTrackUseCase } from '../application/usecases/NextTrackUseCase';
import { PreviousTrackUseCase } from '../application/usecases/PreviousTrackUseCase';
import { SeekUseCase } from '../application/usecases/SeekUseCase';
import { ToggleShuffleUseCase } from '../application/usecases/ToggleShuffleUseCase';
import { BuildQueueUseCase } from '../application/usecases/BuildQueueUseCase';
import { AnalyzeBpmUseCase } from '../application/usecases/AnalyzeBpmUseCase';
import { RecordSkipUseCase } from '../application/usecases/RecordSkipUseCase';

/** @field Singleton flag tracking whether the container has been initialized */
/** @field Lazily created adapter and use case instances */
interface ContainerRegistry {
  audioPort: IAudioPort | null;
  fileSystemPort: IFileSystemPort | null;
  metadataPort: IMetadataPort | null;
  storagePort: IStoragePort | null;
  bpmPort: IBpmPort | null;
  skipStatsPort: ISkipStatsPort | null;
  analysisPort: IAnalysisPort | null;
  backupPort: IBackupPort | null;
  scanLibraryUseCase: ScanLibraryUseCase | null;
  playTrackUseCase: PlayTrackUseCase | null;
  togglePlaybackUseCase: TogglePlaybackUseCase | null;
  nextTrackUseCase: NextTrackUseCase | null;
  previousTrackUseCase: PreviousTrackUseCase | null;
  seekUseCase: SeekUseCase | null;
  toggleShuffleUseCase: ToggleShuffleUseCase | null;
  buildQueueUseCase: BuildQueueUseCase | null;
  analyzeBpmUseCase: AnalyzeBpmUseCase | null;
  recordSkipUseCase: RecordSkipUseCase | null;
}

const registry: ContainerRegistry = {
  audioPort: null,
  fileSystemPort: null,
  metadataPort: null,
  storagePort: null,
  bpmPort: null,
  skipStatsPort: null,
  analysisPort: null,
  backupPort: null,
  scanLibraryUseCase: null,
  playTrackUseCase: null,
  togglePlaybackUseCase: null,
  nextTrackUseCase: null,
  previousTrackUseCase: null,
  seekUseCase: null,
  toggleShuffleUseCase: null,
  buildQueueUseCase: null,
  analyzeBpmUseCase: null,
  recordSkipUseCase: null,
};

/** @returns Singleton IAudioPort backed by TrackPlayerAdapter */
function resolveAudioPort(): IAudioPort {
  if (!registry.audioPort) {
    registry.audioPort = new TrackPlayerAdapter();
  }
  return registry.audioPort;
}

/** @returns Singleton IFileSystemPort backed by FileSystemAdapter */
function resolveFileSystemPort(): IFileSystemPort {
  if (!registry.fileSystemPort) {
    registry.fileSystemPort = new FileSystemAdapter();
  }
  return registry.fileSystemPort;
}

/** @returns Singleton IMetadataPort backed by MetadataParser */
function resolveMetadataPort(): IMetadataPort {
  if (!registry.metadataPort) {
    registry.metadataPort = new MetadataParser();
  }
  return registry.metadataPort;
}

/** @returns Singleton IStoragePort backed by StorageAdapter */
function resolveStoragePort(): IStoragePort {
  if (!registry.storagePort) {
    registry.storagePort = new StorageAdapter();
  }
  return registry.storagePort;
}

/** @returns Singleton IBpmPort backed by BpmAdapter */
function resolveBpmPort(): IBpmPort {
  if (!registry.bpmPort) {
    registry.bpmPort = new BpmAdapter();
  }
  return registry.bpmPort;
}

/** @returns Singleton ISkipStatsPort backed by SkipStatsAdapter */
function resolveSkipStatsPort(): ISkipStatsPort {
  if (!registry.skipStatsPort) {
    registry.skipStatsPort = new SkipStatsAdapter();
  }
  return registry.skipStatsPort;
}

/** @returns Singleton IAnalysisPort backed by the native AudioAnalyzerModule */
function resolveAnalysisPort(): IAnalysisPort {
  if (!registry.analysisPort) {
    registry.analysisPort = new AudioAnalyzerAdapter();
  }
  return registry.analysisPort;
}

/** @returns Singleton IBackupPort writing to shared storage */
function resolveBackupPort(): IBackupPort {
  if (!registry.backupPort) {
    registry.backupPort = new BackupAdapter();
  }
  return registry.backupPort;
}

/** @returns Singleton ScanLibraryUseCase wired with file system, metadata, and storage ports */
function resolveScanLibraryUseCase(): ScanLibraryUseCase {
  if (!registry.scanLibraryUseCase) {
    registry.scanLibraryUseCase = new ScanLibraryUseCase(
      resolveFileSystemPort(),
      resolveMetadataPort(),
      resolveStoragePort(),
    );
  }
  return registry.scanLibraryUseCase;
}

/** @returns Singleton PlayTrackUseCase wired with audio and storage ports */
function resolvePlayTrackUseCase(): PlayTrackUseCase {
  if (!registry.playTrackUseCase) {
    registry.playTrackUseCase = new PlayTrackUseCase(
      resolveAudioPort(),
      resolveStoragePort(),
    );
  }
  return registry.playTrackUseCase;
}

/** @returns Singleton TogglePlaybackUseCase wired with audio and storage ports */
function resolveTogglePlaybackUseCase(): TogglePlaybackUseCase {
  if (!registry.togglePlaybackUseCase) {
    registry.togglePlaybackUseCase = new TogglePlaybackUseCase(
      resolveAudioPort(),
      resolveStoragePort(),
    );
  }
  return registry.togglePlaybackUseCase;
}

/** @returns Singleton NextTrackUseCase wired with audio and storage ports */
function resolveNextTrackUseCase(): NextTrackUseCase {
  if (!registry.nextTrackUseCase) {
    registry.nextTrackUseCase = new NextTrackUseCase(
      resolveAudioPort(),
      resolveStoragePort(),
    );
  }
  return registry.nextTrackUseCase;
}

/** @returns Singleton PreviousTrackUseCase wired with audio and storage ports */
function resolvePreviousTrackUseCase(): PreviousTrackUseCase {
  if (!registry.previousTrackUseCase) {
    registry.previousTrackUseCase = new PreviousTrackUseCase(
      resolveAudioPort(),
      resolveStoragePort(),
    );
  }
  return registry.previousTrackUseCase;
}

/** @returns Singleton SeekUseCase wired with audio and storage ports */
function resolveSeekUseCase(): SeekUseCase {
  if (!registry.seekUseCase) {
    registry.seekUseCase = new SeekUseCase(
      resolveAudioPort(),
      resolveStoragePort(),
    );
  }
  return registry.seekUseCase;
}

/** @returns Singleton ToggleShuffleUseCase wired with storage port */
function resolveToggleShuffleUseCase(): ToggleShuffleUseCase {
  if (!registry.toggleShuffleUseCase) {
    registry.toggleShuffleUseCase = new ToggleShuffleUseCase(
      resolveStoragePort(),
    );
  }
  return registry.toggleShuffleUseCase;
}

/** @returns Singleton BuildQueueUseCase wired with audio and storage ports */
function resolveBuildQueueUseCase(): BuildQueueUseCase {
  if (!registry.buildQueueUseCase) {
    registry.buildQueueUseCase = new BuildQueueUseCase(
      resolveAudioPort(),
      resolveStoragePort(),
    );
  }
  return registry.buildQueueUseCase;
}

/** @returns Singleton AnalyzeBpmUseCase wired with BPM port */
function resolveAnalyzeBpmUseCase(): AnalyzeBpmUseCase {
  if (!registry.analyzeBpmUseCase) {
    registry.analyzeBpmUseCase = new AnalyzeBpmUseCase(resolveBpmPort());
  }
  return registry.analyzeBpmUseCase;
}

/** @returns Singleton RecordSkipUseCase wired with skip stats port */
function resolveRecordSkipUseCase(): RecordSkipUseCase {
  if (!registry.recordSkipUseCase) {
    registry.recordSkipUseCase = new RecordSkipUseCase(resolveSkipStatsPort());
  }
  return registry.recordSkipUseCase;
}

/** @param port - Custom IAudioPort implementation to swap in */
function overrideAudioPort(port: IAudioPort): void {
  registry.audioPort = port;
  registry.playTrackUseCase = null;
  registry.togglePlaybackUseCase = null;
  registry.nextTrackUseCase = null;
  registry.previousTrackUseCase = null;
  registry.seekUseCase = null;
  registry.buildQueueUseCase = null;
}

/** @param port - Custom IBpmPort implementation to swap in */
function overrideBpmPort(port: IBpmPort): void {
  registry.bpmPort = port;
  registry.analyzeBpmUseCase = null;
  registry.recordSkipUseCase = null;
}

/** @param port - Custom ISkipStatsPort implementation to swap in */
function overrideSkipStatsPort(port: ISkipStatsPort): void {
  registry.skipStatsPort = port;
  registry.recordSkipUseCase = null;
}

/** @param port - Custom IFileSystemPort implementation to swap in */
function overrideFileSystemPort(port: IFileSystemPort): void {
  registry.fileSystemPort = port;
  registry.scanLibraryUseCase = null;
}

/** @param port - Custom IMetadataPort implementation to swap in */
function overrideMetadataPort(port: IMetadataPort): void {
  registry.metadataPort = port;
  registry.scanLibraryUseCase = null;
}

/** @param port - Custom IStoragePort implementation to swap in */
function overrideStoragePort(port: IStoragePort): void {
  registry.storagePort = port;
  registry.scanLibraryUseCase = null;
  registry.playTrackUseCase = null;
  registry.togglePlaybackUseCase = null;
  registry.nextTrackUseCase = null;
  registry.previousTrackUseCase = null;
  registry.seekUseCase = null;
  registry.toggleShuffleUseCase = null;
  registry.buildQueueUseCase = null;
}

function resetAll(): void {
  registry.audioPort = null;
  registry.fileSystemPort = null;
  registry.metadataPort = null;
  registry.storagePort = null;
  registry.bpmPort = null;
  registry.skipStatsPort = null;
  registry.analysisPort = null;
  registry.backupPort = null;
  registry.scanLibraryUseCase = null;
  registry.playTrackUseCase = null;
  registry.togglePlaybackUseCase = null;
  registry.nextTrackUseCase = null;
  registry.previousTrackUseCase = null;
  registry.seekUseCase = null;
  registry.toggleShuffleUseCase = null;
  registry.buildQueueUseCase = null;
  registry.analyzeBpmUseCase = null;
}

export const Container = {
  resolveAudioPort,
  resolveFileSystemPort,
  resolveMetadataPort,
  resolveStoragePort,
  resolveBpmPort,
  resolveSkipStatsPort,
  resolveAnalysisPort,
  resolveBackupPort,
  resolveScanLibraryUseCase,
  resolvePlayTrackUseCase,
  resolveTogglePlaybackUseCase,
  resolveNextTrackUseCase,
  resolvePreviousTrackUseCase,
  resolveSeekUseCase,
  resolveToggleShuffleUseCase,
  resolveBuildQueueUseCase,
  resolveAnalyzeBpmUseCase,
  resolveRecordSkipUseCase,
  overrideAudioPort,
  overrideFileSystemPort,
  overrideMetadataPort,
  overrideStoragePort,
  overrideBpmPort,
  overrideSkipStatsPort,
  resetAll,
} as const;
