export interface IBpmPort {
  analyzeBpm(filePath: string): Promise<number>;

  getCachedBpm(filePath: string): Promise<number | null>;

  removeCachedBpm(filePath: string): Promise<void>;

  clearBpmCache(): Promise<void>;

  getCacheSize(): Promise<number>;
}
