import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import {
  AnalysisBatchSummary,
  AnalysisJob,
  AnalysisResultEvent,
  IAnalysisPort,
} from '../../domain/ports/IAnalysisPort';

const { AudioAnalyzerModule } = NativeModules;

const ResultEvent = 'AudioAnalyzer:result';
const DoneEvent = 'AudioAnalyzer:done';

export class AudioAnalyzerAdapter implements IAnalysisPort {
  private emitter: NativeEventEmitter | null = null;
  private onResult: ((event: AnalysisResultEvent) => void) | null = null;
  private onDone: ((summary: AnalysisBatchSummary) => void) | null = null;

  isAvailable(): boolean {
    return Platform.OS === 'android' && AudioAnalyzerModule != null;
  }

  private ensureListeners(): void {
    if (this.emitter || !this.isAvailable()) {
      return;
    }
    this.emitter = new NativeEventEmitter(AudioAnalyzerModule);
    this.emitter.addListener(ResultEvent, (event: AnalysisResultEvent) => {
      this.onResult?.(event);
    });
    this.emitter.addListener(DoneEvent, (summary: AnalysisBatchSummary) => {
      const done = this.onDone;
      this.onResult = null;
      this.onDone = null;
      done?.(summary);
    });
  }

  async startBatch(
    jobs: readonly AnalysisJob[],
    onResult: (event: AnalysisResultEvent) => void,
    onDone: (summary: AnalysisBatchSummary) => void,
  ): Promise<void> {
    if (!this.isAvailable()) {
      onDone({ processed: 0, failed: 0, cancelled: true });
      return;
    }
    this.ensureListeners();
    this.onResult = onResult;
    this.onDone = onDone;
    await AudioAnalyzerModule.startBatch(jobs.map(j => ({ id: j.id, path: j.path })));
  }

  async cancelBatch(): Promise<void> {
    if (this.isAvailable()) {
      await AudioAnalyzerModule.cancelBatch();
    }
  }

  async readMetadata(paths: readonly string[]): Promise<Array<Record<string, unknown>>> {
    if (!this.isAvailable()) {
      throw new Error('AudioAnalyzerModule is not available');
    }
    const result = await AudioAnalyzerModule.readMetadata([...paths]);
    return Array.isArray(result) ? result : [];
  }

  async hasAllFilesAccess(): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }
    return Boolean(await AudioAnalyzerModule.hasAllFilesAccess());
  }

  async requestAllFilesAccess(): Promise<void> {
    if (this.isAvailable()) {
      await AudioAnalyzerModule.requestAllFilesAccess();
    }
  }
}
