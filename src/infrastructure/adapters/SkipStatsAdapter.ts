import AsyncStorage from '@react-native-async-storage/async-storage';
import { ISkipStatsPort } from '../../domain/ports/ISkipStatsPort';
import {
  SkipStatsMap,
  SkipRecord,
  createEmptySkipStats,
  serializeSkipStats,
  deserializeSkipStats,
  normalizeSkipRecord,
  pruneStaleRecords,
} from '../../domain/models/SkipStats';

const StorageKey = '@audioplayer/skip_stats' as const;
/** v1 stored a bare array and never recorded songs that played to the end. */
const StorageVersion = 2;

export class SkipStatsAdapter implements ISkipStatsPort {

  async saveSkipStats(stats: SkipStatsMap): Promise<void> {
    const pruned = pruneStaleRecords(stats);
    const serialized = serializeSkipStats(pruned);
    await AsyncStorage.setItem(
      StorageKey,
      JSON.stringify({ version: StorageVersion, records: serialized }),
    );
  }

  async loadSkipStats(): Promise<SkipStatsMap> {
    const raw = await AsyncStorage.getItem(StorageKey);
    if (!raw) {
      return createEmptySkipStats();
    }

    try {
      const parsed = JSON.parse(raw);
      const legacy = Array.isArray(parsed);
      const records: unknown[] = legacy
        ? parsed
        : parsed && Array.isArray(parsed.records)
        ? parsed.records
        : [];

      const validated = records
        .map(r => normalizeSkipRecord(r, legacy))
        .filter((r): r is SkipRecord => r !== null);

      const stats = deserializeSkipStats(validated);
      if (legacy) {
        await this.saveSkipStats(stats);
      }
      return stats;
    } catch {
      return createEmptySkipStats();
    }
  }

  async clearSkipStats(): Promise<void> {
    await AsyncStorage.removeItem(StorageKey);
  }
}
