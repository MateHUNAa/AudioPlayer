import { Track, generateTrackId } from './Track';
import { Playlist } from './Playlist';
import { ShuffleConfig } from './ShuffleConfig';
import { SkipRecord, SkipStatsMap, normalizeSkipRecord } from './SkipStats';
import { TrackAnalysis, isCurrentAnalysis } from './TrackAnalysis';
import { DismissedSuggestions } from './Suggestions';

/** @field Enough to find the track again: path first, title + artist if the file moved */
export interface BackupTrackRef {
  readonly path: string;
  readonly title: string;
  readonly artist: string;
}

export interface BackupPlaylist {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly tracks: readonly BackupTrackRef[];
}

/** @field Everything the user would be upset to lose, keyed by file rather than internal ID */
export interface LibraryBackup {
  readonly version: 1;
  readonly savedAt: number;
  readonly favourites: readonly BackupTrackRef[];
  readonly playlists: readonly BackupPlaylist[];
  readonly listenStats: readonly (Omit<SkipRecord, 'trackId'> & { readonly path: string })[];
  readonly dismissedSuggestions: readonly { readonly path: string; readonly fullPlays: number }[];
  readonly shuffleConfig: ShuffleConfig | null;
}

/** @field Analysis results keyed by path; fileSize guards against a different file at the same path */
export interface AnalysisBackup {
  readonly version: 1;
  readonly entries: Readonly<Record<string, { readonly fileSize: number; readonly analysis: TrackAnalysis }>>;
}

export interface BackupSource {
  readonly tracks: readonly Track[];
  readonly trackMap: ReadonlyMap<string, Track>;
  readonly favouriteIds: ReadonlySet<string>;
  readonly playlists: readonly Playlist[];
  readonly skipStats: SkipStatsMap;
  readonly dismissed: DismissedSuggestions;
  readonly shuffleConfig: ShuffleConfig;
}

/** @field What a backup restores into app state */
export interface RestoredData {
  readonly favouriteIds: Set<string>;
  readonly playlists: Playlist[];
  readonly skipStats: Map<string, SkipRecord>;
  readonly dismissed: Map<string, number>;
  readonly shuffleConfig: ShuffleConfig | null;
  /** References that could not be matched to a library track yet (library not scanned) */
  readonly unresolved: number;
}

function refOf(track: Track): BackupTrackRef {
  return { path: track.filePath, title: track.title, artist: track.artist };
}

export function createLibraryBackup(source: BackupSource, now: number = Date.now()): LibraryBackup {
  const refFor = (id: string): BackupTrackRef | null => {
    const t = source.trackMap.get(id);
    return t ? refOf(t) : null;
  };
  const refs = (ids: Iterable<string>) => {
    const out: BackupTrackRef[] = [];
    for (const id of ids) {
      const r = refFor(id);
      if (r) {
        out.push(r);
      }
    }
    return out;
  };

  const listenStats: (Omit<SkipRecord, 'trackId'> & { path: string })[] = [];
  for (const record of source.skipStats.values()) {
    const t = source.trackMap.get(record.trackId);
    if (t) {
      listenStats.push({
        path: t.filePath,
        skipCount: record.skipCount,
        playCount: record.playCount,
        lastSkippedAt: record.lastSkippedAt,
        totalListenPercent: record.totalListenPercent,
        fullPlays: record.fullPlays,
        lastPlayedAt: record.lastPlayedAt,
      });
    }
  }

  const dismissedSuggestions: { path: string; fullPlays: number }[] = [];
  for (const [id, fullPlays] of source.dismissed) {
    const t = source.trackMap.get(id);
    if (t) {
      dismissedSuggestions.push({ path: t.filePath, fullPlays });
    }
  }

  return {
    version: 1,
    savedAt: now,
    favourites: refs(source.favouriteIds),
    playlists: source.playlists.map(p => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      tracks: refs(p.trackIds),
    })),
    listenStats,
    dismissedSuggestions,
    shuffleConfig: source.shuffleConfig,
  };
}

function normalizeName(value: string): string {
  const normalized = typeof value.normalize === 'function' ? value.normalize('NFC') : value;
  return normalized.trim().toLowerCase();
}

/**
 * Maps backup references to track IDs. IDs are derived from the file path, so they resolve
 * even before the library is scanned; when `tracks` is given, references whose file moved are
 * matched by title + artist instead.
 */
export function createRefResolver(tracks: readonly Track[] | null) {
  const byId = new Set<string>();
  const byName = new Map<string, string>();
  for (const t of tracks ?? []) {
    byId.add(t.id);
    const key = `${normalizeName(t.title)}\u0000${normalizeName(t.artist)}`;
    if (!byName.has(key)) {
      byName.set(key, t.id);
    }
  }
  let unresolved = 0;
  const resolve = (ref: { path: string; title?: string; artist?: string }): string => {
    const id = generateTrackId(ref.path);
    if (!tracks || byId.has(id)) {
      return id;
    }
    if (ref.title != null && ref.artist != null) {
      const match = byName.get(`${normalizeName(ref.title)}\u0000${normalizeName(ref.artist)}`);
      if (match) {
        return match;
      }
    }
    unresolved++;
    return id;
  };
  return { resolve, unresolvedCount: () => unresolved };
}

/** @returns Whether the value looks like a backup this version can read */
export function isLibraryBackup(value: unknown): value is LibraryBackup {
  if (value == null || typeof value !== 'object') {
    return false;
  }
  const v = value as Record<string, unknown>;
  return v.version === 1 && Array.isArray(v.favourites) && Array.isArray(v.playlists);
}

export function restoreLibraryBackup(
  backup: LibraryBackup,
  tracks: readonly Track[] | null,
): RestoredData {
  const { resolve, unresolvedCount } = createRefResolver(tracks);
  // Stats and dismissals only store the path; borrow title/artist from other refs to follow moved files.
  const refByPath = new Map<string, BackupTrackRef>();
  for (const ref of [...backup.favourites, ...backup.playlists.flatMap(p => p.tracks)]) {
    refByPath.set(ref.path, ref);
  }
  const resolvePath = (path: string) => resolve(refByPath.get(path) ?? { path });

  const favouriteIds = new Set(backup.favourites.map(resolve));
  const playlists: Playlist[] = backup.playlists.map(p => ({
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    trackIds: Array.from(new Set(p.tracks.map(resolve))),
  }));

  const skipStats = new Map<string, SkipRecord>();
  for (const entry of backup.listenStats ?? []) {
    const { path, ...rest } = entry;
    const trackId = resolvePath(path);
    const record = normalizeSkipRecord({ ...rest, trackId }, false);
    if (record) {
      skipStats.set(trackId, record);
    }
  }

  const dismissed = new Map<string, number>();
  for (const d of backup.dismissedSuggestions ?? []) {
    dismissed.set(resolvePath(d.path), d.fullPlays);
  }

  return {
    favouriteIds,
    playlists,
    skipStats,
    dismissed,
    shuffleConfig: backup.shuffleConfig ?? null,
    unresolved: unresolvedCount(),
  };
}

export function createAnalysisBackup(tracks: readonly Track[]): AnalysisBackup {
  const entries: Record<string, { fileSize: number; analysis: TrackAnalysis }> = {};
  for (const t of tracks) {
    if (isCurrentAnalysis(t.analysis)) {
      entries[t.filePath] = { fileSize: t.fileSize, analysis: t.analysis };
    }
  }
  return { version: 1, entries };
}

/** @returns Analysis results from the backup for tracks that don't have one, keyed by track ID */
export function analysesFromBackup(
  backup: AnalysisBackup | null,
  tracks: readonly Track[],
): Map<string, TrackAnalysis> {
  const found = new Map<string, TrackAnalysis>();
  if (!backup || backup.version !== 1 || !backup.entries) {
    return found;
  }
  for (const t of tracks) {
    if (isCurrentAnalysis(t.analysis)) {
      continue;
    }
    const entry = backup.entries[t.filePath];
    if (entry && entry.fileSize === t.fileSize && isCurrentAnalysis(entry.analysis)) {
      found.set(t.id, entry.analysis);
    }
  }
  return found;
}
