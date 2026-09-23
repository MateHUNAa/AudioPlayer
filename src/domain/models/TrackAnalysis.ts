/** @enum Mood quadrants, identical to the desktop Music Lens analyzer */
export type Mood =
  | 'relaxed / happy'
  | 'aggressive / intense'
  | 'melancholic / chill'
  | 'energetic / uplifting';

export type Tone = 'dark/warm' | 'balanced' | 'bright';
export type KeyScale = 'major' | 'minor';

/** @field Raw audio features produced by the native analyzer */
export interface RawAnalysis {
  readonly bpm: number;
  readonly key: string;
  readonly scale: string;
  readonly rmsDb: number;
  readonly peakDb: number;
  readonly drDb: number;
  readonly centroid: number;
  readonly bandLow: number;
  readonly bandMid: number;
  readonly bandHigh: number;
  readonly danceability: number;
}

/** @field Audio features plus the derived energy/valence/mood used for vibe matching */
export interface TrackAnalysis {
  readonly version: number;
  readonly bpm: number;
  readonly key: string;
  readonly scale: KeyScale;
  readonly rmsDb: number;
  readonly drDb: number;
  readonly centroid: number;
  readonly danceability: number;
  readonly bands: { readonly low: number; readonly mid: number; readonly high: number };
  readonly energy: number;
  readonly valence: number;
  readonly mood: Mood;
  readonly tone: Tone;
  readonly analyzedAt: number;
}

/** Bump when the native analyzer changes in a way that makes old results incomparable. */
export const AnalysisVersion = 1;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

function finiteOr(value: number, fallback: number): number {
  return typeof value === 'number' && isFinite(value) ? value : fallback;
}

/** @returns Arousal in [0, 1]; same formula as lens/analyze.ts classifyMood */
export function computeEnergy(bpm: number, rmsDb: number, danceability: number): number {
  return (
    0.35 * clamp01((bpm - 80) / 80) +
    0.35 * clamp01((rmsDb + 13) / 8) +
    0.3 * clamp01((danceability - 0.9) / 0.5)
  );
}

/** @returns Valence in [0, 1]; same formula as lens/analyze.ts classifyMood */
export function computeValence(major: boolean, centroid: number): number {
  return (major ? 0.65 : 0.3) + 0.25 * clamp01((centroid - 2000) / 2500);
}

export function classifyMood(energy: number, valence: number): Mood {
  if (energy >= 0.45) {
    return valence < 0.5 ? 'aggressive / intense' : 'energetic / uplifting';
  }
  return valence >= 0.5 ? 'relaxed / happy' : 'melancholic / chill';
}

export function toneOf(centroid: number): Tone {
  return centroid < 2900 ? 'dark/warm' : centroid < 3800 ? 'balanced' : 'bright';
}

/** @param raw - Features from the native module */
/** @returns A complete TrackAnalysis with derived vibe fields */
export function buildAnalysis(raw: RawAnalysis, now: number = Date.now()): TrackAnalysis {
  const bpm = finiteOr(raw.bpm, 0);
  const rmsDb = finiteOr(raw.rmsDb, -20);
  const danceability = finiteOr(raw.danceability, 1);
  const centroid = finiteOr(raw.centroid, 2500);
  const scale: KeyScale = raw.scale === 'minor' ? 'minor' : 'major';
  // An unknown tempo shouldn't read as "slow": treat it as mid-tempo for energy.
  const energy = computeEnergy(bpm > 0 ? bpm : 110, rmsDb, danceability);
  const valence = computeValence(scale === 'major', centroid);

  return {
    version: AnalysisVersion,
    bpm,
    key: raw.key || 'C',
    scale,
    rmsDb: Math.round(rmsDb * 10) / 10,
    drDb: Math.round(finiteOr(raw.drDb, 0) * 10) / 10,
    centroid: Math.round(centroid),
    danceability: Math.round(danceability * 100) / 100,
    bands: {
      low: finiteOr(raw.bandLow, 0),
      mid: finiteOr(raw.bandMid, 0),
      high: finiteOr(raw.bandHigh, 0),
    },
    energy,
    valence,
    mood: classifyMood(energy, valence),
    tone: toneOf(centroid),
    analyzedAt: now,
  };
}

/** @returns Whether a stored analysis is usable by the current engine */
export function isCurrentAnalysis(analysis: TrackAnalysis | null | undefined): analysis is TrackAnalysis {
  return analysis != null && analysis.version === AnalysisVersion;
}

const PitchClass: Readonly<Record<string, number>> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

/** @returns Camelot wheel position (1-12) and letter (A = minor, B = major), or null for unknown keys */
export function camelotOf(key: string, scale: KeyScale): { num: number; letter: 'A' | 'B' } | null {
  const pc = PitchClass[key];
  if (pc === undefined) {
    return null;
  }
  const majorPc = scale === 'minor' ? (pc + 3) % 12 : pc;
  const num = (((majorPc * 7) % 12) + 7) % 12 + 1;
  return { num, letter: scale === 'minor' ? 'A' : 'B' };
}

export function camelotLabel(analysis: TrackAnalysis): string | null {
  const c = camelotOf(analysis.key, analysis.scale);
  return c ? `${c.num}${c.letter}` : null;
}

/** @field A point in "vibe space"; the anchor that smart shuffle drifts through */
export interface VibePoint {
  readonly energy: number;
  readonly valence: number;
  readonly logBpm: number | null;
  readonly centroid: number;
  readonly danceability: number;
  readonly key: string | null;
  readonly scale: KeyScale | null;
}

export function toVibePoint(a: TrackAnalysis): VibePoint {
  return {
    energy: a.energy,
    valence: a.valence,
    logBpm: a.bpm > 0 ? Math.log2(a.bpm) : null,
    centroid: a.centroid,
    danceability: a.danceability,
    key: a.key,
    scale: a.scale,
  };
}

/** @returns A point moved `amount` of the way from `from` to `to`; key follows the latest track */
export function blendVibe(from: VibePoint | null, to: VibePoint, amount: number): VibePoint {
  if (!from) {
    return to;
  }
  const mix = (x: number, y: number) => x + (y - x) * amount;
  return {
    energy: mix(from.energy, to.energy),
    valence: mix(from.valence, to.valence),
    logBpm:
      from.logBpm != null && to.logBpm != null
        ? mix(from.logBpm, to.logBpm)
        : to.logBpm ?? from.logBpm,
    centroid: mix(from.centroid, to.centroid),
    danceability: mix(from.danceability, to.danceability),
    key: to.key,
    scale: to.scale,
  };
}

const TempoTolerance = Math.log2(1.15);

/** @returns 0 for the same tempo, 1 at >=15% apart; half/double time count as close */
export function tempoDistance(logA: number | null, logB: number | null): number {
  if (logA == null || logB == null) {
    return 0.5;
  }
  const r = Math.abs(logA - logB);
  const octaveFolded = Math.abs(r - 1);
  if (octaveFolded < r) {
    return Math.min(1, 0.15 + octaveFolded / TempoTolerance);
  }
  return Math.min(1, r / TempoTolerance);
}

/** @returns 0 for the same key, small for Camelot neighbours / relative keys, 1 for clashing keys */
export function keyDistance(
  keyA: string | null,
  scaleA: KeyScale | null,
  keyB: string | null,
  scaleB: KeyScale | null,
): number {
  if (!keyA || !keyB || !scaleA || !scaleB) {
    return 0.5;
  }
  const a = camelotOf(keyA, scaleA);
  const b = camelotOf(keyB, scaleB);
  if (!a || !b) {
    return 0.5;
  }
  const diff = Math.abs(a.num - b.num);
  const steps = Math.min(diff, 12 - diff);
  const d = a.letter === b.letter ? steps : steps === 0 ? 1 : steps + 1.5;
  return Math.min(1, d / 4);
}

/** @returns Perceptual vibe distance in [0, 1] between two points */
export function vibeDistance(a: VibePoint, b: VibePoint): number {
  const de = Math.min(1, Math.abs(a.energy - b.energy) / 0.5);
  const dv = Math.min(1, Math.abs(a.valence - b.valence) / 0.45);
  const dt = tempoDistance(a.logBpm, b.logBpm);
  const dk = keyDistance(a.key, a.scale, b.key, b.scale);
  const dc = Math.min(1, Math.abs(a.centroid - b.centroid) / 1800);
  const dd = Math.min(1, Math.abs(a.danceability - b.danceability) / 0.45);
  return 0.28 * de + 0.18 * dv + 0.2 * dt + 0.12 * dk + 0.12 * dc + 0.1 * dd;
}

/** Distance assumed when one side has not been analyzed yet: neutral, neither close nor far. */
export const UnknownVibeDistance = 0.35;
