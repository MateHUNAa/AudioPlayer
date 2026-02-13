import { IMetadataPort, TrackMetadata, MetadataParseResult } from '../../domain/ports/IMetadataPort';
import { TrackFormat, isSupportedFormat } from '../../domain/models/Track';

const FormatMap: ReadonlyMap<string, TrackFormat> = new Map([
  ['mp3', 'mp3'],
  ['flac', 'flac'],
  ['wav', 'wav'],
  ['aac', 'aac'],
  ['ogg', 'ogg'],
  ['wma', 'wma'],
  ['m4a', 'm4a'],
]);

const BatchChunkSize = 10;

function extractExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filePath.length - 1) {
    return '';
  }
  return filePath.substring(lastDot + 1).toLowerCase();
}

function resolveFormat(filePath: string): TrackFormat | null {
  const ext = extractExtension(filePath);
  return FormatMap.get(ext) ?? null;
}

function sanitizeString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

function sanitizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return null;
}

function sanitizeYear(value: unknown): number | null {
  const num = sanitizeNumber(value);
  if (num !== null && num >= 1000 && num <= 9999) {
    return Math.floor(num);
  }
  return null;
}

function sanitizeTrackNumber(value: unknown): number | null {
  if (typeof value === 'string') {
    const parts = value.split('/');
    const parsed = parseInt(parts[0], 10);
    if (isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return null;
  }
  const num = sanitizeNumber(value);
  if (num !== null && num > 0) {
    return Math.floor(num);
  }
  return null;
}

function extractFolderName(filePath: string): string | null {
  const separatorIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (separatorIndex <= 0) {
    return null;
  }
  const dirPath = filePath.substring(0, separatorIndex);
  const parentSepIndex = Math.max(dirPath.lastIndexOf('/'), dirPath.lastIndexOf('\\'));
  const folderName = parentSepIndex >= 0 ? dirPath.substring(parentSepIndex + 1) : dirPath;
  if (folderName.length === 0 || folderName.toLowerCase() === 'music') {
    return null;
  }
  return folderName;
}

/** @param raw - Raw metadata object returned by the native metadata reader */
/** @param filePath - Original file path used as fallback for album from folder name */
/** @returns Sanitized TrackMetadata with validated fields */
function mapRawToTrackMetadata(raw: Record<string, unknown>, filePath: string): TrackMetadata {
  const album = sanitizeString(raw.albumName)
    ?? sanitizeString(raw.album)
    ?? extractFolderName(filePath);

  return {
    title: sanitizeString(raw.title),
    artist: sanitizeString(raw.artist) ?? sanitizeString(raw.albumArtist),
    album,
    duration: sanitizeNumber(raw.duration) ?? 0,
    artwork: sanitizeString(raw.artwork) ?? sanitizeString(raw.albumArt) ?? sanitizeString(raw.picture),
    genre: sanitizeString(raw.genre),
    trackNumber: sanitizeTrackNumber(raw.trackNumber) ?? sanitizeTrackNumber(raw.track),
    year: sanitizeYear(raw.year) ?? sanitizeYear(raw.date),
    bpm: sanitizeNumber(raw.bpm) ?? sanitizeNumber(raw.tempo),
    bitrate: sanitizeNumber(raw.bitrate),
    sampleRate: sanitizeNumber(raw.sampleRate),
    channels: sanitizeNumber(raw.channels),
  };
}

interface NativeMetadataModule {
  getMetadata: (uris: string[]) => Promise<Array<Record<string, unknown>>>;
}

export class MetadataParser implements IMetadataPort {
  private nativeParser: NativeMetadataModule | null = null;

  /** @param nativeModule - Optional native metadata module injection for testing */
  constructor(nativeModule?: NativeMetadataModule) {
    this.nativeParser = nativeModule ?? null;
  }

  /** @returns The native parser module, lazily loaded on first access */
  private getNativeParser(): NativeMetadataModule {
    if (this.nativeParser) {
      return this.nativeParser;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const musicMetadata = require('react-native-music-metadata');
      this.nativeParser = {
        getMetadata: async (uris: string[]): Promise<Array<Record<string, unknown>>> => {
          const result = await musicMetadata.default.getMetadata(uris);
          if (Array.isArray(result)) {
            return result as Array<Record<string, unknown>>;
          }
          return [result as Record<string, unknown>];
        },
      };
    } catch {
      this.nativeParser = {
        getMetadata: async (uris: string[]): Promise<Array<Record<string, unknown>>> => {
          return uris.map(() => ({}));
        },
      };
    }

    return this.nativeParser;
  }

  /** @param filePath - Absolute path to the audio file to parse */
  /** @returns Parsed metadata result including title, artist, album, duration, etc. */
  async parseFile(filePath: string): Promise<MetadataParseResult> {
    const format = resolveFormat(filePath);

    if (!format) {
      const ext = extractExtension(filePath);
      return {
        filePath,
        format: 'mp3',
        metadata: null,
        error: `Unsupported format: ${ext}`,
      };
    }

    try {
      const parser = this.getNativeParser();
      const results = await parser.getMetadata([filePath]);
      const raw = results[0] ?? {};
      const metadata = mapRawToTrackMetadata(raw, filePath);

      return {
        filePath,
        format,
        metadata,
        error: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to parse metadata for ${filePath}`;
      return {
        filePath,
        format,
        metadata: null,
        error: message,
      };
    }
  }

  /** @param filePaths - List of absolute file paths to parse in batch */
  /** @param onProgress - Optional callback invoked with completed count and total */
  /** @returns Array of metadata results in the same order as the input paths */
  async parseBatch(
    filePaths: readonly string[],
    onProgress?: (completed: number, total: number) => void,
  ): Promise<MetadataParseResult[]> {
    if (filePaths.length === 0) {
      return [];
    }

    const results: MetadataParseResult[] = [];
    const total = filePaths.length;
    let completed = 0;

    for (let i = 0; i < total; i += BatchChunkSize) {
      const chunkPaths = filePaths.slice(i, i + BatchChunkSize);

      try {
        const parser = this.getNativeParser();
        const rawResults = await parser.getMetadata(chunkPaths as string[]);

        for (let j = 0; j < chunkPaths.length; j++) {
          const path = chunkPaths[j];
          const format = resolveFormat(path);

          if (!format) {
            const ext = extractExtension(path);
            results.push({
              filePath: path,
              format: 'mp3',
              metadata: null,
              error: `Unsupported format: ${ext}`,
            });
            continue;
          }

          const raw = rawResults[j] ?? {};
          const metadata = mapRawToTrackMetadata(raw, path);

          results.push({
            filePath: path,
            format,
            metadata,
            error: null,
          });
        }
      } catch (chunkError) {
        for (const path of chunkPaths) {
          const format = resolveFormat(path);
          const message = chunkError instanceof Error ? chunkError.message : `Failed to parse metadata for ${path}`;
          results.push({
            filePath: path,
            format: format ?? 'mp3',
            metadata: null,
            error: message,
          });
        }
      }

      completed += chunkPaths.length;
      onProgress?.(completed, total);
    }

    return results;
  }

  /** @param filePath - Absolute path to the audio file */
  /** @returns Album artwork as a file URI or base64 data URI, or null if none found */
  async extractArtwork(filePath: string): Promise<string | null> {
    try {
      const result = await this.parseFile(filePath);
      if (result.metadata?.artwork) {
        return result.metadata.artwork;
      }
      return null;
    } catch {
      return null;
    }
  }

  /** @param filePath - Absolute path to the audio file */
  /** @returns Whether the file can be parsed by this metadata port */
  canParse(filePath: string): boolean {
    const ext = extractExtension(filePath);
    return isSupportedFormat(ext);
  }
}
