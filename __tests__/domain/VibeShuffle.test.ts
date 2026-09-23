import {
  buildShuffledQueue,
  createEmptySession,
  withSessionFeedback,
} from '../../src/domain/engine/ShuffleEngine';
import {
  createInitialQueueManagerState,
  loadQueue,
  replanUpcoming,
  skipToIndex,
  updateSession,
} from '../../src/domain/engine/QueueManager';
import { Track, generateTrackId } from '../../src/domain/models/Track';
import {
  RawAnalysis,
  buildAnalysis,
  camelotOf,
  keyDistance,
  tempoDistance,
  toVibePoint,
  vibeDistance,
} from '../../src/domain/models/TrackAnalysis';
import {
  createShuffleConfig,
  normalizeShuffleConfig,
} from '../../src/domain/models/ShuffleConfig';
import {
  ChronicSkipMinCount,
  classifyListen,
  computeSkipPenalty,
  normalizeSkipRecord,
  recordListen,
  recordPlay,
  recordSkip,
  SkipStatsMap,
} from '../../src/domain/models/SkipStats';
import { computeSuggestions } from '../../src/domain/models/Suggestions';
import {
  analysesFromBackup,
  createAnalysisBackup,
  createLibraryBackup,
  restoreLibraryBackup,
} from '../../src/domain/models/Backup';

const Calm: RawAnalysis = {
  bpm: 82, key: 'A', scale: 'minor', rmsDb: -12, peakDb: -1, drDb: 14,
  centroid: 1800, bandLow: 0.7, bandMid: 0.28, bandHigh: 0.02, danceability: 0.95,
};
const Hype: RawAnalysis = {
  bpm: 150, key: 'E', scale: 'major', rmsDb: -5, peakDb: -0.1, drDb: 6,
  centroid: 4200, bandLow: 0.6, bandMid: 0.3, bandHigh: 0.1, danceability: 1.45,
};

function track(id: string, raw: RawAnalysis | null, artist = `Artist ${id}`): Track {
  const filePath = `/storage/emulated/0/Music/${id}.mp3`;
  return {
    id: generateTrackId(filePath),
    filePath,
    title: `Song ${id}`,
    artist,
    album: `Album ${id}`,
    duration: 200,
    artwork: null,
    format: 'mp3',
    genre: null,
    trackNumber: null,
    year: null,
    bpm: null,
    fileSize: 1000,
    addedAt: 0,
    analysis: raw ? buildAnalysis(raw, 0) : null,
  };
}

/** Small per-track jitter so clusters aren't identical points. */
function jitter(raw: RawAnalysis, i: number): RawAnalysis {
  return { ...raw, bpm: raw.bpm + (i % 5), centroid: raw.centroid + (i % 7) * 20 };
}

function library(perCluster: number) {
  const calm = Array.from({ length: perCluster }, (_, i) => track(`calm${i}`, jitter(Calm, i)));
  const hype = Array.from({ length: perCluster }, (_, i) => track(`hype${i}`, jitter(Hype, i)));
  return { calm, hype, all: [...calm, ...hype] };
}

describe('TrackAnalysis', () => {
  it('classifies mood exactly like the desktop analyzer', () => {
    expect(buildAnalysis(Calm).mood).toBe('melancholic / chill');
    expect(buildAnalysis(Hype).mood).toBe('energetic / uplifting');
    expect(buildAnalysis({ ...Hype, scale: 'minor', centroid: 1800 }).mood).toBe('aggressive / intense');
    expect(buildAnalysis({ ...Calm, scale: 'major', centroid: 3000 }).mood).toBe('relaxed / happy');
  });

  it('maps keys onto the Camelot wheel', () => {
    expect(camelotOf('C', 'major')).toEqual({ num: 8, letter: 'B' });
    expect(camelotOf('A', 'minor')).toEqual({ num: 8, letter: 'A' });
    expect(camelotOf('F#', 'major')).toEqual({ num: 2, letter: 'B' });
    expect(camelotOf('Eb', 'minor')).toEqual({ num: 2, letter: 'A' });
    expect(camelotOf('B', 'major')).toEqual({ num: 1, letter: 'B' });
  });

  it('treats relative keys and neighbours as close, clashing keys as far', () => {
    expect(keyDistance('C', 'major', 'C', 'major')).toBe(0);
    expect(keyDistance('C', 'major', 'A', 'minor')).toBeLessThan(0.3);
    expect(keyDistance('C', 'major', 'G', 'major')).toBeLessThan(0.3);
    expect(keyDistance('C', 'major', 'F#', 'major')).toBe(1);
  });

  it('treats half/double time as nearly the same tempo', () => {
    const l = Math.log2;
    expect(tempoDistance(l(120), l(120))).toBe(0);
    expect(tempoDistance(l(70), l(140))).toBeLessThan(0.2);
    expect(tempoDistance(l(100), l(130))).toBe(1);
  });

  it('keeps similar songs close and different vibes far apart', () => {
    const calmA = toVibePoint(buildAnalysis(Calm));
    const calmB = toVibePoint(buildAnalysis(jitter(Calm, 3)));
    const hype = toVibePoint(buildAnalysis(Hype));
    expect(vibeDistance(calmA, calmA)).toBe(0);
    expect(vibeDistance(calmA, calmB)).toBeLessThan(0.1);
    expect(vibeDistance(calmA, hype)).toBeGreaterThan(0.6);
    expect(vibeDistance(calmA, hype)).toBeCloseTo(vibeDistance(hype, calmA), 10);
  });

  it('survives garbage numbers from the native side', () => {
    const a = buildAnalysis({ ...Calm, bpm: NaN, rmsDb: Infinity, centroid: NaN });
    expect(Number.isFinite(a.energy)).toBe(true);
    expect(Number.isFinite(a.valence)).toBe(true);
  });
});

describe('listening stats', () => {
  it('classifies how a listen ended', () => {
    expect(classifyListen(200, 200, 'auto')).toBe('complete');
    expect(classifyListen(190, 200, 'next')).toBe('complete');
    expect(classifyListen(30, 200, 'next')).toBe('skip');
    expect(classifyListen(30, 200, 'auto')).toBe('skip');
    expect(classifyListen(120, 200, 'next')).toBe('play');
    expect(classifyListen(30, 200, 'previous')).toBe('ignore');
    expect(classifyListen(10, 0, 'next')).toBe('ignore');
  });

  it('only penalizes songs that are skipped again and again', () => {
    let stats: SkipStatsMap = new Map();
    for (let i = 0; i < ChronicSkipMinCount - 1; i++) {
      stats = recordSkip(stats, 't', 0.1);
    }
    expect(computeSkipPenalty(stats, 't', 40)).toBe(0);
    stats = recordSkip(stats, 't', 0.1);
    expect(computeSkipPenalty(stats, 't', 40)).toBeGreaterThan(0);
  });

  it('lets full listens outweigh old skips', () => {
    let stats: SkipStatsMap = new Map();
    for (let i = 0; i < 3; i++) {
      stats = recordSkip(stats, 't', 0.1);
    }
    for (let i = 0; i < 4; i++) {
      stats = recordPlay(stats, 't');
    }
    expect(computeSkipPenalty(stats, 't', 40)).toBe(0);
    expect(stats.get('t')!.fullPlays).toBe(4);
  });

  it('un-buries songs from the old buggy stats format', () => {
    const legacy = normalizeSkipRecord(
      { trackId: 't', skipCount: 9, playCount: 9, lastSkippedAt: Date.now(), totalListenPercent: 1 },
      true,
    )!;
    expect(legacy.fullPlays).toBe(0);
    expect(computeSkipPenalty(new Map([['t', legacy]]), 't', 40)).toBe(0);
  });

  it('ignores listens that should not count', () => {
    const stats = new Map();
    expect(recordListen(stats, 't', 'ignore', 0)).toBe(stats);
  });
});

describe('suggestions', () => {
  const [a, b, c] = [track('a', null), track('b', null), track('c', null)];
  let stats: SkipStatsMap = new Map();
  for (let i = 0; i < 4; i++) {
    stats = recordPlay(stats, a.id);
    stats = recordPlay(stats, b.id);
  }
  stats = recordPlay(stats, c.id);

  it('suggests repeatedly played songs that are not loved', () => {
    const s = computeSuggestions([a, b, c], stats, new Set([b.id]), new Map());
    expect(s.map(x => x.track.id)).toEqual([a.id]);
    expect(s[0].fullPlays).toBe(4);
  });

  it('hides dismissed songs until they are played a lot more', () => {
    const dismissed = new Map([[a.id, 4]]);
    expect(computeSuggestions([a], stats, new Set(), dismissed)).toHaveLength(0);
    let more = stats;
    for (let i = 0; i < 5; i++) {
      more = recordPlay(more, a.id);
    }
    expect(computeSuggestions([a], more, new Set(), dismissed)).toHaveLength(1);
  });
});

describe('backup', () => {
  const tracks = [track('x', Calm), track('y', null), track('z', Hype)];
  const trackMap = new Map(tracks.map(t => [t.id, t]));
  let stats: SkipStatsMap = new Map();
  stats = recordPlay(stats, tracks[0].id);
  const backup = createLibraryBackup({
    tracks,
    trackMap,
    favouriteIds: new Set([tracks[0].id, tracks[2].id]),
    playlists: [{ id: 'pl_1', name: 'Mix', trackIds: [tracks[1].id, tracks[0].id], createdAt: 1, updatedAt: 2 }],
    skipStats: stats,
    dismissed: new Map([[tracks[1].id, 3]]),
    shuffleConfig: createShuffleConfig({ vibeWeight: 70 }),
  });

  it('restores favourites and playlists before the library is even scanned', () => {
    const restored = restoreLibraryBackup(JSON.parse(JSON.stringify(backup)), null);
    expect([...restored.favouriteIds].sort()).toEqual([tracks[0].id, tracks[2].id].sort());
    expect(restored.playlists[0].trackIds).toEqual([tracks[1].id, tracks[0].id]);
    expect(restored.skipStats.get(tracks[0].id)!.fullPlays).toBe(1);
    expect(restored.dismissed.get(tracks[1].id)).toBe(3);
    expect(restored.shuffleConfig!.vibeWeight).toBe(70);
  });

  it('finds songs whose file moved by title and artist', () => {
    const moved = { ...tracks[0], filePath: '/storage/emulated/0/Music/New/x.mp3' };
    const movedTrack = { ...moved, id: generateTrackId(moved.filePath) };
    const restored = restoreLibraryBackup(backup, [movedTrack, tracks[1], tracks[2]]);
    expect(restored.favouriteIds.has(movedTrack.id)).toBe(true);
    expect(restored.unresolved).toBe(0);
  });

  it('restores analysis only for unchanged files', () => {
    const saved = createAnalysisBackup(tracks);
    const fresh = tracks.map(t => ({ ...t, analysis: null }));
    fresh[2] = { ...fresh[2], fileSize: 999 };
    const found = analysesFromBackup(saved, fresh);
    expect(found.has(tracks[0].id)).toBe(true);
    expect(found.has(tracks[2].id)).toBe(false);
  });
});

describe('vibe-aware smart shuffle', () => {
  const config = createShuffleConfig({ seed: 7, minArtistGap: 0, artistPenalty: 0, albumPenalty: 0 });

  function calmShare(queue: readonly Track[], count: number): number {
    return queue.slice(1, count + 1).filter(t => t.id.length && t.filePath.includes('calm')).length / count;
  }

  it('keeps the vibe of the starting song', () => {
    const { calm, all } = library(60);
    const shares: number[] = [];
    for (let seed = 1; seed <= 10; seed++) {
      const q = buildShuffledQueue(all, calm[0], { ...config, seed });
      shares.push(calmShare(q.tracks, 10));
    }
    const avg = shares.reduce((a, b) => a + b, 0) / shares.length;
    expect(avg).toBeGreaterThan(0.8);
  });

  it('is vibe-blind when vibe matching is off', () => {
    const { calm, all } = library(60);
    const shares: number[] = [];
    for (let seed = 1; seed <= 10; seed++) {
      const q = buildShuffledQueue(all, calm[0], { ...config, seed, vibeWeight: 0 });
      shares.push(calmShare(q.tracks, 10));
    }
    const avg = shares.reduce((a, b) => a + b, 0) / shares.length;
    expect(avg).toBeGreaterThan(0.3);
    expect(avg).toBeLessThan(0.7);
  });

  it('steers away from the vibe of songs skipped this session', () => {
    const { calm, hype, all } = library(60);
    const unanalyzedStart = track('neutral', null);
    let session = createEmptySession();
    session = withSessionFeedback(session, calm[1].id, 'skipped');
    session = withSessionFeedback(session, calm[2].id, 'skipped');
    const shares: number[] = [];
    for (let seed = 1; seed <= 10; seed++) {
      const q = buildShuffledQueue([unanalyzedStart, ...all], unanalyzedStart, { ...config, seed }, new Map(), {
        session,
      });
      shares.push(calmShare(q.tracks, 10));
    }
    const avg = shares.reduce((a, b) => a + b, 0) / shares.length;
    expect(avg).toBeLessThan(0.2);
    expect(hype.length).toBe(60);
  });

  it('boosts loved songs', () => {
    const tracks = Array.from({ length: 200 }, (_, i) => track(`n${i}`, null));
    const loved = new Set(tracks.slice(0, 20).map(t => t.id));
    let lovedEarly = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const q = buildShuffledQueue(tracks, null, { ...config, seed, favouriteBoost: 30 }, new Map(), {
        favouriteIds: loved,
      });
      lovedEarly += q.tracks.slice(0, 20).filter(t => loved.has(t.id)).length;
    }
    // 10% of the library is loved; without a boost ~2 of the first 20 would be.
    expect(lovedEarly / 10).toBeGreaterThan(8);
  });

  it('re-plans only the upcoming part of the queue', () => {
    const { calm, all } = library(40);
    let qs = loadQueue(all, 0, 'smart', {
      ...createInitialQueueManagerState(),
      shuffleConfig: { ...config, mode: 'smart' },
    });
    qs = skipToIndex(qs, 5);
    const playedBefore = qs.queue.tracks.slice(0, 6).map(t => t.id);
    qs = updateSession(qs, withSessionFeedback(qs.session, calm[3].id, 'skipped'));
    const replanned = replanUpcoming(qs);
    expect(replanned.queue.tracks.slice(0, 6).map(t => t.id)).toEqual(playedBefore);
    expect(new Set(replanned.queue.tracks.map(t => t.id))).toEqual(new Set(qs.queue.tracks.map(t => t.id)));
    expect(replanned.queue.currentIndex).toBe(5);
  });

  it('shuffles a 5000-song analyzed library quickly', () => {
    const tracks = Array.from({ length: 5000 }, (_, i) =>
      track(`p${i}`, jitter(i % 2 ? Calm : Hype, i), `Artist ${i % 300}`),
    );
    const start = Date.now();
    const q = buildShuffledQueue(tracks, tracks[0], createShuffleConfig({ seed: 1 }));
    expect(q.tracks).toHaveLength(5000);
    expect(new Set(q.tracks.map(t => t.id)).size).toBe(5000);
    expect(Date.now() - start).toBeLessThan(3000);
  });
});

describe('shuffle config', () => {
  it('fills in fields missing from configs saved by older versions', () => {
    const old = { mode: 'smart', artistPenalty: 55, bpmMode: 'gradual' };
    const cfg = normalizeShuffleConfig(old);
    expect(cfg.artistPenalty).toBe(55);
    expect(cfg.bpmMode).toBe('gradual');
    expect(cfg.vibeWeight).toBeGreaterThan(0);
    expect(cfg.sessionWeight).toBeGreaterThan(0);
  });

  it('falls back to defaults for junk', () => {
    expect(normalizeShuffleConfig(null).mode).toBe('smart');
    expect(normalizeShuffleConfig({ historyWindowSize: -5 }).historyWindowSize).toBeGreaterThan(0);
  });
});
