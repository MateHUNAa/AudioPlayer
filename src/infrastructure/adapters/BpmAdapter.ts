import { NativeModules, Platform } from 'react-native';
import { IBpmPort } from '../../domain/ports/IBpmPort';

const { BpmAnalyzerModule } = NativeModules;

const UNSUPPORTED_PLATFORM_MSG = 'BPM analysis is only supported on Android';

function assertAndroidPlatform(): void {
  if (Platform.OS !== 'android') {
    throw new Error(UNSUPPORTED_PLATFORM_MSG);
  }
}

function assertModuleAvailable(): void {
  if (!BpmAnalyzerModule) {
    throw new Error(
      'BpmAnalyzerModule native module is not available. Ensure the module is properly linked.',
    );
  }
}

export class BpmAdapter implements IBpmPort {
  constructor() {
    assertAndroidPlatform();
    assertModuleAvailable();
  }

  async analyzeBpm(filePath: string): Promise<number> {
    const result: number = await BpmAnalyzerModule.analyzeBpm(filePath);
    return result;
  }

  async getCachedBpm(filePath: string): Promise<number | null> {
    const result: number | null = await BpmAnalyzerModule.getCachedBpm(filePath);
    return result ?? null;
  }

  async removeCachedBpm(filePath: string): Promise<void> {
    await BpmAnalyzerModule.removeCachedBpm(filePath);
  }

  async clearBpmCache(): Promise<void> {
    await BpmAnalyzerModule.clearBpmCache();
  }

  async getCacheSize(): Promise<number> {
    const size: number = await BpmAnalyzerModule.getCacheSize();
    return size;
  }
}
