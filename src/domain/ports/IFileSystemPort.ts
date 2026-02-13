export interface FileEntry {
  readonly path: string;
  readonly name: string;
  readonly extension: string;
  readonly size: number;
  readonly lastModified: number;
}

export interface DirectoryScanResult {
  readonly files: readonly FileEntry[];
  readonly scannedDirectories: number;
  readonly totalFiles: number;
  readonly errors: readonly string[];
}

/** @interface Contract for file system access operations */
export interface IFileSystemPort {
  /** @param directoryPath - Absolute path to the directory to scan */
  /** @param extensions - List of file extensions to filter by (without dot) */
  /** @returns All matching files found recursively within the directory */
  scanDirectory(directoryPath: string, extensions: readonly string[]): Promise<DirectoryScanResult>;

  /** @param filePath - Absolute path to the file to check */
  /** @returns Whether the file exists on the file system */
  fileExists(filePath: string): Promise<boolean>;

  /** @param directoryPath - Absolute path to the directory to check */
  /** @returns Whether the directory exists on the file system */
  directoryExists(directoryPath: string): Promise<boolean>;

  /** @param filePath - Absolute path to the file */
  /** @returns File size in bytes */
  getFileSize(filePath: string): Promise<number>;

  /** @returns Absolute path to the device music directory */
  getMusicDirectoryPath(): Promise<string>;

  /** @param filePath - Absolute path to the file to read */
  /** @returns Raw file content as a base64-encoded string */
  readFileBase64(filePath: string): Promise<string>;

  /** @param filePath - Absolute path to the file */
  /** @returns MIME type string for the given file */
  getFileMimeType(filePath: string): Promise<string>;
}
