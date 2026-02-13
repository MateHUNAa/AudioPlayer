import {
  createInitialShuffleState,
  recordSelection,
  computeTrackScore,
  selectNextTrack,
  buildShuffledQueue,
  buildRandomQueue,
  resetShuffleState,
  hasCompletedCycle,
  ShuffleState,
} from '../../src/domain/engine/ShuffleEngine';
import { Track } from '../../src/domain/models/Track';
import {
  ShuffleConfig,
  createDefaultShuffleConfig,
  createShuffleConfig,
  createRandomShuffleConfig,
} from '../../src/domain/models/ShuffleConfig';

function createMockTrack(overrides: Partial<Track> = {}): Track {
  const id = overrides.id ?? `trk_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    filePath: `/music/${id}.mp3`,
    title: overrides.title ?? `Track ${id}`,
    artist: overrides.artist ?? 'Unknown Artist',
    album: overrides.album ?? 'Unknown Album',
    duration: overrides.duration ?? 200,
    artwork: overrides.artwork ?? null,
    format: overrides.format ?? 'mp3',
    genre: overrides.genre ?? null,
    trackNumber: overrides.trackNumber ?? null,
    year: overrides.year ?? null,
    bpm: overrides.bpm ?? null,
    fileSize: overrides.fileSize ?? 5000000,
    addedAt: overrides.addedAt ?? Date.now(),
  };
}

function createTracksWithArtist(artist: string, count: number): Track[] {
  return Array.from({ length: count }, (_, i) =>
    createMockTrack({
      id: `trk_${artist.toLowerCase().replace(/\s/g, '_')}_${i}`,
      title: `Song ${i + 1} by ${artist}`,
      artist,
      album: `${artist} Album`,
    }),
  );
}

function createDiverseTrackSet(size: number): Track[] {
  const artists = ['Artist A', 'Artist B', 'Artist C', 'Artist D', 'Artist E'];
  const albums = ['Album 1', 'Album 2', 'Album 3', 'Album 4', 'Album 5'];
  return Array.from({ length: size }, (_, i) =>
    createMockTrack({
      id: `trk_diverse_${i}`,
      title: `Diverse Track ${i}`,
      artist: artists[i % artists.length],
      album: albums[i % albums.length],
      genre: i % 2 === 0 ? 'Rock' : 'Pop',
      bpm: 80 + i * 5,
    }),
  );
}

function createSeededConfig(
  seed: number,
  overrides: Partial<ShuffleConfig> = {},
): ShuffleConfig {
  return createShuffleConfig({ seed, ...overrides });
}

describe('ShuffleEngine', () => {
  describe('createInitialShuffleState', () => {
    it('should return a state with empty history', () => {
      const state = createInitialShuffleState();
      expect(state.recentHistory).toEqual([]);
      expect(state.selectionCount).toBe(0);
    });

    it('should return a state with empty artist frequency map', () => {
      const state = createInitialShuffleState();
      expect(state.artistFrequency.size).toBe(0);
    });

    it('should return a state with empty album frequency map', () => {
      const state = createInitialShuffleState();
      expect(state.albumFrequency.size).toBe(0);
    });
  });

  describe('recordSelection', () => {
    it('should add the track ID to recent history', () => {
      const state = createInitialShuffleState();
      const track = createMockTrack({ id: 'trk_test_1' });
      const config = createDefaultShuffleConfig();

      const updated = recordSelection(state, track, config);

      expect(updated.recentHistory).toContain('trk_test_1');
      expect(updated.recentHistory.length).toBe(1);
    });

    it('should increment the selection count', () => {
      const state = createInitialShuffleState();
      const track = createMockTrack();
      const config = createDefaultShuffleConfig();

      const updated = recordSelection(state, track, config);

      expect(updated.selectionCount).toBe(1);
    });

    it('should track artist frequency', () => {
      const state = createInitialShuffleState();
      const track = createMockTrack({ artist: 'Test Artist' });
      const config = createDefaultShuffleConfig();

      const updated = recordSelection(state, track, config);

      expect(updated.artistFrequency.get('Test Artist')).toBe(1);
    });

    it('should increment artist frequency on repeated selections', () => {
      const config = createDefaultShuffleConfig();
      const track1 = createMockTrack({ id: 'trk_a', artist: 'Same Artist' });
      const track2 = createMockTrack({ id: 'trk_b', artist: 'Same Artist' });

      let state = createInitialShuffleState();
      state = recordSelection(state, track1, config);
      state = recordSelection(state, track2, config);

      expect(state.artistFrequency.get('Same Artist')).toBe(2);
    });

    it('should track album frequency', () => {
      const state = createInitialShuffleState();
      const track = createMockTrack({ album: 'Test Album' });
      const config = createDefaultShuffleConfig();

      const updated = recordSelection(state, track, config);

      expect(updated.albumFrequency.get('Test Album')).toBe(1);
    });

    it('should trim history to window size', () => {
      const config = createShuffleConfig({ historyWindowSize: 3 });
      let state = createInitialShuffleState();

      for (let i = 0; i < 5; i++) {
        const track = createMockTrack({ id: `trk_trim_${i}` });
        state = recordSelection(state, track, config);
      }

      expect(state.recentHistory.length).toBe(3);
      expect(state.recentHistory[0]).toBe('trk_trim_2');
      expect(state.recentHistory[1]).toBe('trk_trim_3');
      expect(state.recentHistory[2]).toBe('trk_trim_4');
    });

    it('should not mutate the original state', () => {
      const state = createInitialShuffleState();
      const track = createMockTrack();
      const config = createDefaultShuffleConfig();

      const updated = recordSelection(state, track, config);

      expect(state.recentHistory.length).toBe(0);
      expect(state.selectionCount).toBe(0);
      expect(state.artistFrequency.size).toBe(0);
      expect(updated).not.toBe(state);
    });
  });

  describe('computeTrackScore', () => {
    it('should return the base weight for a track with no history', () => {
      const track = createMockTrack();
      const state = createInitialShuffleState();
      const config = createSeededConfig(42);
      const rng = () => 0.5;

      const score = computeTrackScore(track, state, config, rng);

      expect(score).toBeGreaterThan(0);
    });

    it('should return at minimum 1 even with heavy penalties', () => {
      const track = createMockTrack({ id: 'trk_heavy' });
      const config = createShuffleConfig({
        seed: 42,
        artistPenalty: 1000,
        albumPenalty: 1000,
        recentPlayPenalty: 1000,
        baseWeight: 10,
      });

      const state: ShuffleState = {
        recentHistory: ['trk_heavy'],
        artistFrequency: new Map(),
        albumFrequency: new Map(),
        selectionCount: 1,
      };

      const rng = () => 0;
      const score = computeTrackScore(track, state, config, rng);

      expect(score).toBeGreaterThanOrEqual(1);
    });

    it('should penalize recently played tracks', () => {
      const track = createMockTrack({ id: 'trk_recent' });
      const config = createSeededConfig(42);

      const freshState = createInitialShuffleState();
      const recentState: ShuffleState = {
        recentHistory: ['trk_recent'],
        artistFrequency: new Map(),
        albumFrequency: new Map(),
        selectionCount: 1,
      };

      const rng = () => 0.5;
      const freshScore = computeTrackScore(track, freshState, config, rng);
      const recentScore = computeTrackScore(track, recentState, config, rng);

      expect(recentScore).toBeLessThan(freshScore);
    });

    it('should incorporate randomness factor', () => {
      const track = createMockTrack();
      const state = createInitialShuffleState();
      const config = createShuffleConfig({ randomnessFactor: 50, seed: null });

      const scores = new Set<number>();
      for (let i = 0; i < 20; i++) {
        const rng = () => Math.random();
        scores.add(computeTrackScore(track, state, config, rng));
      }

      expect(scores.size).toBeGreaterThan(1);
    });

    it('should return consistent scores with deterministic RNG', () => {
      const track = createMockTrack();
      const state = createInitialShuffleState();
      const config = createSeededConfig(42);
      const fixedRng = () => 0.5;

      const score1 = computeTrackScore(track, state, config, fixedRng);
      const score2 = computeTrackScore(track, state, config, fixedRng);

      expect(score1).toBe(score2);
    });
  });

  describe('selectNextTrack', () => {
    it('should return null for an empty track list', () => {
      const state = createInitialShuffleState();
      const config = createDefaultShuffleConfig();

      const result = selectNextTrack([], null, state, config);

      expect(result).toBeNull();
    });

    it('should return the only track when list has one element', () => {
      const track = createMockTrack({ id: 'trk_only' });
      const state = createInitialShuffleState();
      const config = createDefaultShuffleConfig();

      const result = selectNextTrack([track], null, state, config);

      expect(result).not.toBeNull();
      expect(result!.track.id).toBe('trk_only');
    });

    it('should not select the current track', () => {
      const tracks = [
        createMockTrack({ id: 'trk_current' }),
        createMockTrack({ id: 'trk_other' }),
      ];
      const state = createInitialShuffleState();
      const config = createSeededConfig(42);

      const result = selectNextTrack(tracks, tracks[0], state, config);

      expect(result).not.toBeNull();
      expect(result!.track.id).toBe('trk_other');
    });

    it('should return a track with a positive score', () => {
      const tracks = createDiverseTrackSet(10);
      const state = createInitialShuffleState();
      const config = createSeededConfig(42);

      const result = selectNextTrack(tracks, null, state, config);

      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThan(0);
    });

    it('should prefer tracks from different artists when history has repeated artists', () => {
      const artistATracks = createTracksWithArtist('Artist A', 5);
      const artistBTracks = createTracksWithArtist('Artist B', 5);
      const allTracks = [...artistATracks, ...artistBTracks];
      const config = createShuffleConfig({
        seed: 42,
        artistPenalty: 80,
        minArtistGap: 3,
        randomnessFactor: 1,
      });

      let state = createInitialShuffleState();
      state = recordSelection(state, artistATracks[0], config);
      state = recordSelection(state, artistATracks[1], config);
      state = recordSelection(state, artistATracks[2], config);

      const artistBSelections = new Set<string>();
      for (let seed = 1; seed <= 20; seed++) {
        const seededConfig = createShuffleConfig({ ...config, seed });
        const result = selectNextTrack(
          allTracks,
          artistATracks[2],
          state,
          seededConfig,
        );
        if (result && result.track.artist === 'Artist B') {
          artistBSelections.add(result.track.id);
        }
      }

      expect(artistBSelections.size).toBeGreaterThan(0);
    });
  });

  describe('buildShuffledQueue', () => {
    it('should return an empty queue for empty input', () => {
      const config = createDefaultShuffleConfig();
      const result = buildShuffledQueue([], null, config);

      expect(result.tracks.length).toBe(0);
    });

    it('should return the single track for a one-element input', () => {
      const track = createMockTrack({ id: 'trk_single' });
      const config = createDefaultShuffleConfig();

      const result = buildShuffledQueue([track], null, config);

      expect(result.tracks.length).toBe(1);
      expect(result.tracks[0].id).toBe('trk_single');
    });

    it('should include all tracks exactly once', () => {
      const tracks = createDiverseTrackSet(20);
      const config = createSeededConfig(42);

      const result = buildShuffledQueue(tracks, null, config);
      const resultIds = result.tracks.map(t => t.id);
      const inputIds = tracks.map(t => t.id);

      expect(resultIds.length).toBe(inputIds.length);
      expect(new Set(resultIds).size).toBe(inputIds.length);

      for (const id of inputIds) {
        expect(resultIds).toContain(id);
      }
    });

    it('should produce a different order than the original', () => {
      const tracks = createDiverseTrackSet(50);
      const config = createSeededConfig(42);

      const result = buildShuffledQueue(tracks, null, config);
      const resultIds = result.tracks.map(t => t.id);
      const inputIds = tracks.map(t => t.id);

      let identicalPositions = 0;
      for (let i = 0; i < inputIds.length; i++) {
        if (inputIds[i] === resultIds[i]) {
          identicalPositions++;
        }
      }

      expect(identicalPositions).toBeLessThan(inputIds.length * 0.5);
    });

    it('should place startTrack first when provided', () => {
      const tracks = createDiverseTrackSet(20);
      const startTrack = tracks[10];
      const config = createSeededConfig(42);

      const result = buildShuffledQueue(tracks, startTrack, config);

      expect(result.tracks[0].id).toBe(startTrack.id);
    });

    it('should be deterministic with the same seed', () => {
      const tracks = createDiverseTrackSet(30);
      const config = createSeededConfig(12345);

      const result1 = buildShuffledQueue(tracks, null, config);
      const result2 = buildShuffledQueue(tracks, null, config);

      const ids1 = result1.tracks.map(t => t.id);
      const ids2 = result2.tracks.map(t => t.id);

      expect(ids1).toEqual(ids2);
    });

    it('should produce different results with different seeds', () => {
      const tracks = createDiverseTrackSet(30);
      const config1 = createSeededConfig(111);
      const config2 = createSeededConfig(999);

      const result1 = buildShuffledQueue(tracks, null, config1);
      const result2 = buildShuffledQueue(tracks, null, config2);

      const ids1 = result1.tracks.map(t => t.id);
      const ids2 = result2.tracks.map(t => t.id);

      let matches = 0;
      for (let i = 0; i < ids1.length; i++) {
        if (ids1[i] === ids2[i]) {
          matches++;
        }
      }

      expect(matches).toBeLessThan(ids1.length);
    });

    it('should return a valid final state with recorded selections', () => {
      const tracks = createDiverseTrackSet(10);
      const config = createSeededConfig(42);

      const result = buildShuffledQueue(tracks, null, config);

      expect(result.finalState.selectionCount).toBe(tracks.length);
    });

    it('should avoid clustering same artist tracks together', () => {
      const artistA = createTracksWithArtist('Artist A', 10);
      const artistB = createTracksWithArtist('Artist B', 10);
      const artistC = createTracksWithArtist('Artist C', 10);
      const tracks = [...artistA, ...artistB, ...artistC];
      const config = createShuffleConfig({
        seed: 42,
        artistPenalty: 50,
        minArtistGap: 2,
        randomnessFactor: 5,
      });

      const result = buildShuffledQueue(tracks, null, config);

      let consecutiveSameArtist = 0;
      let maxConsecutive = 0;

      for (let i = 1; i < result.tracks.length; i++) {
        if (result.tracks[i].artist === result.tracks[i - 1].artist) {
          consecutiveSameArtist++;
          maxConsecutive = Math.max(maxConsecutive, consecutiveSameArtist);
        } else {
          consecutiveSameArtist = 0;
        }
      }

      expect(maxConsecutive).toBeLessThan(5);
    });

    it('should handle large track sets efficiently', () => {
      const tracks = Array.from({ length: 2000 }, (_, i) =>
        createMockTrack({
          id: `trk_perf_${i}`,
          artist: `Artist ${i % 100}`,
          album: `Album ${i % 200}`,
        }),
      );
      const config = createSeededConfig(42);

      const startTime = Date.now();
      const result = buildShuffledQueue(tracks, null, config);
      const elapsed = Date.now() - startTime;

      expect(result.tracks.length).toBe(2000);
      expect(elapsed).toBeLessThan(15000);
    }, 20000);

    it('should provide fair distribution across all tracks', () => {
      const tracks = createDiverseTrackSet(20);
      const positionSums = new Map<string, number>();

      for (const track of tracks) {
        positionSums.set(track.id, 0);
      }

      const iterations = 50;
      for (let seed = 0; seed < iterations; seed++) {
        const config = createSeededConfig(seed);
        const result = buildShuffledQueue(tracks, null, config);

        for (let pos = 0; pos < result.tracks.length; pos++) {
          const current = positionSums.get(result.tracks[pos].id) ?? 0;
          positionSums.set(result.tracks[pos].id, current + pos);
        }
      }

      const avgPositions: number[] = [];
      for (const sum of positionSums.values()) {
        avgPositions.push(sum / iterations);
      }

      const expectedAvg = (tracks.length - 1) / 2;
      const tolerance = expectedAvg * 0.6;

      for (const avg of avgPositions) {
        expect(avg).toBeGreaterThan(expectedAvg - tolerance);
        expect(avg).toBeLessThan(expectedAvg + tolerance);
      }
    });

    it('should avoid same album clustering', () => {
      const album1Tracks = Array.from({ length: 8 }, (_, i) =>
        createMockTrack({
          id: `trk_alb1_${i}`,
          artist: `Artist ${i}`,
          album: 'Same Album',
        }),
      );
      const album2Tracks = Array.from({ length: 8 }, (_, i) =>
        createMockTrack({
          id: `trk_alb2_${i}`,
          artist: `Artist ${i + 8}`,
          album: 'Different Album',
        }),
      );
      const tracks = [...album1Tracks, ...album2Tracks];
      const config = createShuffleConfig({
        seed: 42,
        albumPenalty: 40,
        minAlbumGap: 2,
        randomnessFactor: 3,
      });

      const result = buildShuffledQueue(tracks, null, config);

      let consecutiveSameAlbum = 0;
      let maxConsecutive = 0;
      for (let i = 1; i < result.tracks.length; i++) {
        if (result.tracks[i].album === result.tracks[i - 1].album) {
          consecutiveSameAlbum++;
          maxConsecutive = Math.max(maxConsecutive, consecutiveSameAlbum);
        } else {
          consecutiveSameAlbum = 0;
        }
      }

      expect(maxConsecutive).toBeLessThan(4);
    });
  });

  describe('buildRandomQueue', () => {
    it('should return an empty queue for empty input', () => {
      const result = buildRandomQueue([], null);

      expect(result.tracks.length).toBe(0);
    });

    it('should return the single track for one-element input', () => {
      const track = createMockTrack({ id: 'trk_rand_single' });
      const result = buildRandomQueue([track], null);

      expect(result.tracks.length).toBe(1);
      expect(result.tracks[0].id).toBe('trk_rand_single');
    });

    it('should include all tracks exactly once', () => {
      const tracks = createDiverseTrackSet(25);
      const result = buildRandomQueue(tracks, null, 42);

      const resultIds = new Set(result.tracks.map(t => t.id));
      expect(resultIds.size).toBe(tracks.length);
    });

    it('should place startTrack first when provided', () => {
      const tracks = createDiverseTrackSet(20);
      const startTrack = tracks[15];

      const result = buildRandomQueue(tracks, startTrack, 42);

      expect(result.tracks[0].id).toBe(startTrack.id);
    });

    it('should be deterministic with the same seed', () => {
      const tracks = createDiverseTrackSet(30);

      const result1 = buildRandomQueue(tracks, null, 42);
      const result2 = buildRandomQueue(tracks, null, 42);

      const ids1 = result1.tracks.map(t => t.id);
      const ids2 = result2.tracks.map(t => t.id);

      expect(ids1).toEqual(ids2);
    });

    it('should produce different results with different seeds', () => {
      const tracks = createDiverseTrackSet(30);

      const result1 = buildRandomQueue(tracks, null, 100);
      const result2 = buildRandomQueue(tracks, null, 200);

      const ids1 = result1.tracks.map(t => t.id);
      const ids2 = result2.tracks.map(t => t.id);

      let matches = 0;
      for (let i = 0; i < ids1.length; i++) {
        if (ids1[i] === ids2[i]) {
          matches++;
        }
      }

      expect(matches).toBeLessThan(ids1.length);
    });

    it('should shuffle the order (Fisher-Yates)', () => {
      const tracks = createDiverseTrackSet(50);
      const result = buildRandomQueue(tracks, null, 42);

      const originalIds = tracks.map(t => t.id);
      const shuffledIds = result.tracks.map(t => t.id);

      let samePosition = 0;
      for (let i = 0; i < originalIds.length; i++) {
        if (originalIds[i] === shuffledIds[i]) {
          samePosition++;
        }
      }

      expect(samePosition).toBeLessThan(originalIds.length * 0.5);
    });

    it('should return a fresh shuffle state', () => {
      const tracks = createDiverseTrackSet(10);
      const result = buildRandomQueue(tracks, null, 42);

      expect(result.finalState.selectionCount).toBe(0);
      expect(result.finalState.recentHistory.length).toBe(0);
    });
  });

  describe('resetShuffleState', () => {
    it('should return a fresh state regardless of input', () => {
      const dirtyState: ShuffleState = {
        recentHistory: ['a', 'b', 'c'],
        artistFrequency: new Map([['Artist A', 5]]),
        albumFrequency: new Map([['Album 1', 3]]),
        selectionCount: 42,
      };

      const reset = resetShuffleState(dirtyState);

      expect(reset.recentHistory.length).toBe(0);
      expect(reset.artistFrequency.size).toBe(0);
      expect(reset.albumFrequency.size).toBe(0);
      expect(reset.selectionCount).toBe(0);
    });
  });

  describe('hasCompletedCycle', () => {
    it('should return false when selection count is less than total tracks', () => {
      const state: ShuffleState = {
        recentHistory: ['a', 'b'],
        artistFrequency: new Map(),
        albumFrequency: new Map(),
        selectionCount: 5,
      };

      expect(hasCompletedCycle(state, 10)).toBe(false);
    });

    it('should return true when selection count equals total tracks', () => {
      const state: ShuffleState = {
        recentHistory: [],
        artistFrequency: new Map(),
        albumFrequency: new Map(),
        selectionCount: 10,
      };

      expect(hasCompletedCycle(state, 10)).toBe(true);
    });

    it('should return true when selection count exceeds total tracks', () => {
      const state: ShuffleState = {
        recentHistory: [],
        artistFrequency: new Map(),
        albumFrequency: new Map(),
        selectionCount: 15,
      };

      expect(hasCompletedCycle(state, 10)).toBe(true);
    });

    it('should return true when total tracks is zero', () => {
      const state = createInitialShuffleState();

      expect(hasCompletedCycle(state, 0)).toBe(true);
    });
  });

  describe('smart shuffle quality', () => {
    it('should not immediately repeat the same track within a session', () => {
      const tracks = createDiverseTrackSet(10);
      const config = createShuffleConfig({
        seed: 42,
        recentPlayPenalty: 100,
        randomnessFactor: 1,
      });

      let state = createInitialShuffleState();
      let currentTrack = tracks[0];
      state = recordSelection(state, currentTrack, config);

      for (let i = 0; i < 50; i++) {
        const result = selectNextTrack(tracks, currentTrack, state, config);
        expect(result).not.toBeNull();
        expect(result!.track.id).not.toBe(currentTrack.id);

        currentTrack = result!.track;
        state = recordSelection(state, currentTrack, config);
      }
    });

    it('should distribute selections across multiple artists over many picks', () => {
      const artistA = createTracksWithArtist('Pop Star', 10);
      const artistB = createTracksWithArtist('Rock Band', 10);
      const artistC = createTracksWithArtist('Jazz Combo', 10);
      const tracks = [...artistA, ...artistB, ...artistC];

      const config = createShuffleConfig({
        seed: 42,
        artistPenalty: 40,
        minArtistGap: 2,
        randomnessFactor: 5,
      });

      const result = buildShuffledQueue(tracks, null, config);

      const firstTenArtists = result.tracks.slice(0, 10).map(t => t.artist);
      const uniqueArtistsInFirstTen = new Set(firstTenArtists);

      expect(uniqueArtistsInFirstTen.size).toBeGreaterThanOrEqual(2);
    });

    it('should handle a library with only one artist gracefully', () => {
      const tracks = createTracksWithArtist('Solo Artist', 15);
      const config = createShuffleConfig({
        seed: 42,
        artistPenalty: 50,
        minArtistGap: 3,
      });

      const result = buildShuffledQueue(tracks, null, config);

      expect(result.tracks.length).toBe(15);
      const ids = new Set(result.tracks.map(t => t.id));
      expect(ids.size).toBe(15);
    });

    it('should handle a library where all tracks share the same album', () => {
      const tracks = Array.from({ length: 12 }, (_, i) =>
        createMockTrack({
          id: `trk_same_alb_${i}`,
          artist: `Artist ${i}`,
          album: 'The Only Album',
        }),
      );
      const config = createShuffleConfig({
        seed: 42,
        albumPenalty: 30,
        minAlbumGap: 2,
      });

      const result = buildShuffledQueue(tracks, null, config);

      expect(result.tracks.length).toBe(12);
    });

    it('should respect minArtistGap in generated queue', () => {
      const artistA = createTracksWithArtist('A', 3);
      const otherTracks = createDiverseTrackSet(20).map(t => ({
        ...t,
        artist: t.artist === 'A' ? 'A_alt' : t.artist,
      }));
      const tracks = [...artistA, ...otherTracks];
      const config = createShuffleConfig({
        seed: 42,
        artistPenalty: 80,
        minArtistGap: 3,
        randomnessFactor: 1,
      });

      const result = buildShuffledQueue(tracks, null, config);

      for (let i = 0; i < result.tracks.length; i++) {
        if (result.tracks[i].artist === 'A') {
          for (
            let j = i + 1;
            j < Math.min(i + config.minArtistGap, result.tracks.length);
            j++
          ) {
            if (result.tracks[j].artist === 'A') {
              const gap = j - i;
              expect(gap).toBeGreaterThanOrEqual(1);
            }
          }
        }
      }
    });
  });

  describe('edge cases', () => {
    it('should handle two tracks correctly', () => {
      const tracks = [
        createMockTrack({ id: 'trk_one' }),
        createMockTrack({ id: 'trk_two' }),
      ];
      const config = createSeededConfig(42);

      const result = buildShuffledQueue(tracks, null, config);

      expect(result.tracks.length).toBe(2);
      expect(new Set(result.tracks.map(t => t.id)).size).toBe(2);
    });

    it('should handle three tracks with the same artist', () => {
      const tracks = createTracksWithArtist('Same', 3);
      const config = createSeededConfig(42);

      const result = buildShuffledQueue(tracks, null, config);

      expect(result.tracks.length).toBe(3);
    });

    it('should handle tracks with identical metadata gracefully', () => {
      const tracks = Array.from({ length: 5 }, (_, i) =>
        createMockTrack({
          id: `trk_identical_${i}`,
          title: 'Same Title',
          artist: 'Same Artist',
          album: 'Same Album',
        }),
      );
      const config = createSeededConfig(42);

      const result = buildShuffledQueue(tracks, null, config);

      expect(result.tracks.length).toBe(5);
      expect(new Set(result.tracks.map(t => t.id)).size).toBe(5);
    });

    it('should handle config with zero randomness factor', () => {
      const tracks = createDiverseTrackSet(10);
      const config = createShuffleConfig({
        seed: 42,
        randomnessFactor: 0,
      });

      const result = buildShuffledQueue(tracks, null, config);

      expect(result.tracks.length).toBe(10);
    });

    it('should handle config with very high randomness factor', () => {
      const tracks = createDiverseTrackSet(10);
      const config = createShuffleConfig({
        seed: 42,
        randomnessFactor: 1000,
      });

      const result = buildShuffledQueue(tracks, null, config);

      expect(result.tracks.length).toBe(10);
    });

    it('should handle config with history window of 1', () => {
      const tracks = createDiverseTrackSet(10);
      const config = createShuffleConfig({
        seed: 42,
        historyWindowSize: 1,
      });

      const result = buildShuffledQueue(tracks, null, config);

      expect(result.tracks.length).toBe(10);
    });

    it('should handle config with very large history window', () => {
      const tracks = createDiverseTrackSet(10);
      const config = createShuffleConfig({
        seed: 42,
        historyWindowSize: 200,
      });

      const result = buildShuffledQueue(tracks, null, config);

      expect(result.tracks.length).toBe(10);
    });

    it('should handle startTrack not in the tracks list', () => {
      const tracks = createDiverseTrackSet(10);
      const outsideTrack = createMockTrack({ id: 'trk_outside' });
      const config = createSeededConfig(42);

      const result = buildShuffledQueue(tracks, outsideTrack, config);

      expect(result.tracks.length).toBe(10);
      const ids = result.tracks.map(t => t.id);
      expect(ids).not.toContain('trk_outside');
    });
  });

  describe('random shuffle config', () => {
    it('should use zero penalties for random mode', () => {
      const config = createRandomShuffleConfig();

      expect(config.artistPenalty).toBe(0);
      expect(config.albumPenalty).toBe(0);
      expect(config.recentPlayPenalty).toBe(0);
      expect(config.mode).toBe('random');
    });

    it('should have high randomness factor', () => {
      const config = createRandomShuffleConfig();

      expect(config.randomnessFactor).toBe(100);
    });

    it('should have zero minimum gaps', () => {
      const config = createRandomShuffleConfig();

      expect(config.minArtistGap).toBe(0);
      expect(config.minAlbumGap).toBe(0);
    });
  });

  describe('seeded RNG determinism', () => {
    it('should produce identical shuffled queues across multiple runs with same seed', () => {
      const tracks = createDiverseTrackSet(100);

      for (let trial = 0; trial < 5; trial++) {
        const config = createSeededConfig(7777);
        const result = buildShuffledQueue(tracks, null, config);
        const firstRunIds = result.tracks.map(t => t.id);

        const config2 = createSeededConfig(7777);
        const result2 = buildShuffledQueue(tracks, null, config2);
        const secondRunIds = result2.tracks.map(t => t.id);

        expect(firstRunIds).toEqual(secondRunIds);
      }
    });

    it('should produce identical random queues across multiple runs with same seed', () => {
      const tracks = createDiverseTrackSet(50);

      const result1 = buildRandomQueue(tracks, null, 54321);
      const result2 = buildRandomQueue(tracks, null, 54321);

      expect(result1.tracks.map(t => t.id)).toEqual(
        result2.tracks.map(t => t.id),
      );
    });
  });

  describe('performance characteristics', () => {
    it('should complete shuffle of 1000 tracks in under 5 seconds', () => {
      const tracks = Array.from({ length: 1000 }, (_, i) =>
        createMockTrack({
          id: `trk_perf1k_${i}`,
          artist: `Artist ${i % 50}`,
          album: `Album ${i % 100}`,
        }),
      );
      const config = createSeededConfig(42);

      const start = Date.now();
      const result = buildShuffledQueue(tracks, null, config);
      const elapsed = Date.now() - start;

      expect(result.tracks.length).toBe(1000);
      expect(elapsed).toBeLessThan(5000);
    }, 10000);

    it('should complete random shuffle of 5000 tracks in under 2 seconds', () => {
      const tracks = Array.from({ length: 5000 }, (_, i) =>
        createMockTrack({
          id: `trk_rand5k_${i}`,
          artist: `Artist ${i % 100}`,
          album: `Album ${i % 200}`,
        }),
      );

      const start = Date.now();
      const result = buildRandomQueue(tracks, null, 42);
      const elapsed = Date.now() - start;

      expect(result.tracks.length).toBe(5000);
      expect(elapsed).toBeLessThan(2000);
    }, 5000);
  });
});
