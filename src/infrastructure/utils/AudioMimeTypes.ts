import { TrackFormat } from '../../domain/models/Track';

const MimeTypeMap: ReadonlyMap<TrackFormat, string> = new Map<
  TrackFormat,
  string
>([
  ['mp3', 'audio/mpeg'],
  ['flac', 'audio/flac'],
  ['wav', 'audio/wav'],
  ['aac', 'audio/aac'],
  ['ogg', 'audio/ogg'],
  ['wma', 'audio/x-ms-wma'],
  ['m4a', 'audio/mp4'],
]);

const DefaultMimeType = 'application/octet-stream' as const;

/** @param format - Audio track format enum value */
/** @returns MIME type string for the given format */
function getMimeTypeForFormat(format: TrackFormat): string {
  return MimeTypeMap.get(format) ?? DefaultMimeType;
}

/** @param extension - File extension without dot (e.g. "mp3") */
/** @returns MIME type string for the given extension or fallback */
function getMimeTypeForExtension(extension: string): string {
  const normalized = extension.toLowerCase() as TrackFormat;
  return MimeTypeMap.get(normalized) ?? DefaultMimeType;
}

/** @param filePath - Absolute or relative file path */
/** @returns MIME type string derived from the file extension */
function getMimeTypeForPath(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filePath.length - 1) {
    return DefaultMimeType;
  }
  const extension = filePath.substring(lastDot + 1).toLowerCase();
  return getMimeTypeForExtension(extension);
}

export {
  MimeTypeMap,
  DefaultMimeType,
  getMimeTypeForFormat,
  getMimeTypeForExtension,
  getMimeTypeForPath,
};
