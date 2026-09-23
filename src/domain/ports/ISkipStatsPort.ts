import { SkipStatsMap } from '../models/SkipStats';

export interface ISkipStatsPort {
  saveSkipStats(stats: SkipStatsMap): Promise<void>;

  loadSkipStats(): Promise<SkipStatsMap>;

  clearSkipStats(): Promise<void>;
}
