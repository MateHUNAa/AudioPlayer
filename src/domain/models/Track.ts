/** @field Unique identifier for the track */
/** @field Absolute file path on device */
/** @field Track title parsed from metadata */
/** @field Artist name parsed from metadata */
/** @field Album name parsed from metadata */
/** @field Track duration in seconds */
/** @field Album art URI if available */
/** @field Audio file format extension */
/** @field Genre parsed from metadata */
/** @field Track number within album */
/** @field Year of release */
/** @field Beats per minute if available */
/** @field File size in bytes */
/** @field Timestamp when track was added to library */
import { TrackAnalysis } from './TrackAnalysis';

/** @field Audio analysis used for vibe-aware shuffle, null until analyzed */
export interface Track {
  readonly id: string;
  readonly filePath: string;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  readonly duration: number;
  readonly artwork: string | null;
  readonly format: TrackFormat;
  readonly genre: string | null;
  readonly trackNumber: number | null;
  readonly year: number | null;
  readonly bpm: number | null;
  readonly fileSize: number;
  readonly addedAt: number;
  readonly analysis?: TrackAnalysis | null;
}

/** @enum Supported audio file formats */
export type TrackFormat = 'mp3' | 'flac' | 'wav' | 'aac' | 'ogg' | 'wma' | 'm4a';

const SupportedFormats = ['mp3', 'flac', 'wav', 'aac', 'ogg', 'wma', 'm4a'] as const;

/** @param extension - File extension without dot */
/** @returns Whether the extension is a supported audio format */
export function isSupportedFormat(extension: string): extension is TrackFormat {
  return SupportedFormats.includes(extension.toLowerCase() as TrackFormat);
}

/** @param filePath - Absolute path to the audio file */
/** @param metadata - Partial metadata fields parsed from file */
/** @returns A fully constructed Track domain model */
export function createTrack(
  filePath: string,
  metadata: Partial<Omit<Track, 'id' | 'filePath' | 'addedAt'>> & {
    fileSize: number;
    format: TrackFormat;
  },
): Track {
  const fileName = filePath.split('/').pop() ?? filePath;
  const titleFallback = fileName.replace(/\.[^.]+$/, '');

  return {
    id: generateTrackId(filePath),
    filePath,
    title: metadata.title ?? titleFallback,
    artist: metadata.artist ?? 'Unknown Artist',
    album: metadata.album ?? 'Unknown Album',
    duration: metadata.duration ?? 0,
    artwork: metadata.artwork ?? null,
    format: metadata.format,
    genre: metadata.genre ?? null,
    trackNumber: metadata.trackNumber ?? null,
    year: metadata.year ?? null,
    bpm: metadata.bpm ?? null,
    fileSize: metadata.fileSize,
    addedAt: Date.now(),
  };
}

/** @param filePath - Absolute file path used to derive a deterministic ID */
/** @returns A stable hash string identifier */
export function generateTrackId(filePath: string): string {
  let hash = 0;
  for (let i = 0; i < filePath.length; i++) {
    const char = filePath.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `trk_${Math.abs(hash).toString(36)}`;
}
