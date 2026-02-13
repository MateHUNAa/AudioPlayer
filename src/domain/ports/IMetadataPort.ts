import { TrackFormat } from '../models/Track';

/** @field Track title from metadata tags */
/** @field Artist name from metadata tags */
/** @field Album name from metadata tags */
/** @field Duration in seconds */
/** @field Album artwork as a base64 string or file URI */
/** @field Genre from metadata tags */
/** @field Track number within the album */
/** @field Release year */
/** @field Beats per minute if encoded in metadata */
/** @field Audio bitrate in kbps */
/** @field Sample rate in Hz */
/** @field Number of audio channels */
export interface TrackMetadata {
  readonly title: string | null;
  readonly artist: string | null;
  readonly album: string | null;
  readonly duration: number;
  readonly artwork: string | null;
  readonly genre: string | null;
  readonly trackNumber: number | null;
  readonly year: number | null;
  readonly bpm: number | null;
  readonly bitrate: number | null;
  readonly sampleRate: number | null;
  readonly channels: number | null;
}

/** @field The file path that was parsed */
/** @field The detected audio format */
/** @field The extracted metadata or null if parsing failed */
/** @field Error message if parsing failed */
export interface MetadataParseResult {
  readonly filePath: string;
  readonly format: TrackFormat;
  readonly metadata: TrackMetadata | null;
  readonly error: string | null;
}

/** @interface Contract for extracting metadata from audio files */
export interface IMetadataPort {
  /** @param filePath - Absolute path to the audio file to parse */
  /** @returns Parsed metadata result including title, artist, album, duration, etc. */
  parseFile(filePath: string): Promise<MetadataParseResult>;

  /** @param filePaths - List of absolute file paths to parse in batch */
  /** @param onProgress - Optional callback invoked with completed count and total */
  /** @returns Array of metadata results in the same order as the input paths */
  parseBatch(
    filePaths: readonly string[],
    onProgress?: (completed: number, total: number) => void,
  ): Promise<MetadataParseResult[]>;

  /** @param filePath - Absolute path to the audio file */
  /** @returns Album artwork as a file URI or base64 data URI, or null if none found */
  extractArtwork(filePath: string): Promise<string | null>;

  /** @param filePath - Absolute path to the audio file */
  /** @returns Whether the file can be parsed by this metadata port */
  canParse(filePath: string): boolean;
}
