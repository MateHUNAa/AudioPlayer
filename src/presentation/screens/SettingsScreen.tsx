import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
} from 'react-native';
import { useAppContext } from '../context/AppContext';
import { ShuffleConfig, createDefaultShuffleConfig } from '../../domain/models/ShuffleConfig';
import { BpmMode } from '../../domain/models/ShuffleConfig';
import {
  BackIcon,
  ShuffleIcon,
  RefreshIcon,
  TrashIcon,
  MusicBoltIcon,
  VinylIcon,
  FolderIcon,
} from '../components/Icons';

function formatTimeAgo(timestamp: number | null): string {
  if (!timestamp) {
    return 'never';
  }
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

interface SettingsScreenProps {
  readonly onBack: () => void;
}

const BpmModeOptions: readonly { key: BpmMode; label: string; description: string }[] = [
  { key: 'off', label: 'OFF', description: 'No BPM influence on shuffle' },
  { key: 'similar', label: 'SIMILAR', description: 'Keep songs around the same tempo' },
  { key: 'gradual', label: 'GRADUAL', description: 'Slowly drift between tempos' },
];

const HitSlop = { top: 10, bottom: 10, left: 10, right: 10 } as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface SliderRowProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit?: string;
  readonly onDecrease: () => void;
  readonly onIncrease: () => void;
}

function SliderRow({ label, value, min, max, step, unit, onDecrease, onIncrease }: SliderRowProps) {
  const displayValue = Number.isInteger(step) ? value.toString() : value.toFixed(0);
  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <View style={styles.sliderRow}>
      <Text style={styles.sliderLabel}>{label}</Text>
      <View style={styles.sliderControls}>
        <TouchableOpacity
          style={[styles.stepButton, atMin && styles.stepButtonDisabled]}
          onPress={onDecrease}
          disabled={atMin}
          activeOpacity={0.6}
          hitSlop={HitSlop}
        >
          <Text style={[styles.stepButtonText, atMin && styles.stepButtonTextDisabled]}>−</Text>
        </TouchableOpacity>

        <View style={styles.sliderValueContainer}>
          <Text style={styles.sliderValue}>
            {displayValue}{unit ? ` ${unit}` : ''}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.stepButton, atMax && styles.stepButtonDisabled]}
          onPress={onIncrease}
          disabled={atMax}
          activeOpacity={0.6}
          hitSlop={HitSlop}
        >
          <Text style={[styles.stepButtonText, atMax && styles.stepButtonTextDisabled]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface SegmentedControlProps {
  readonly options: readonly { key: string; label: string }[];
  readonly selectedKey: string;
  readonly onSelect: (key: string) => void;
  readonly accentColor?: string;
}

function SegmentedControl({ options, selectedKey, onSelect, accentColor = '#1db954' }: SegmentedControlProps) {
  return (
    <View style={styles.segmentedContainer}>
      {options.map((option) => {
        const isSelected = option.key === selectedKey;
        return (
          <TouchableOpacity
            key={option.key}
            style={[
              styles.segmentedOption,
              isSelected && { backgroundColor: accentColor },
            ]}
            onPress={() => onSelect(option.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.segmentedOptionText,
                isSelected && styles.segmentedOptionTextActive,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function SettingsScreen({ onBack }: SettingsScreenProps) {
  const { state, actions } = useAppContext();
  const config = state.queueManagerState.shuffleConfig;
  const { analysisStatus, backupStatus } = state;
  const skipStatsSize = useMemo(() => state.queueManagerState.skipStats.size, [state.queueManagerState.skipStats]);

  const [pendingConfig, setPendingConfig] = useState<ShuffleConfig>(config);
  const hasChanges = useMemo(() => {
    return (
      pendingConfig.bpmMode !== config.bpmMode ||
      pendingConfig.bpmTolerance !== config.bpmTolerance ||
      pendingConfig.bpmPenalty !== config.bpmPenalty ||
      pendingConfig.skipPenalty !== config.skipPenalty ||
      pendingConfig.minArtistGap !== config.minArtistGap ||
      pendingConfig.minAlbumGap !== config.minAlbumGap ||
      pendingConfig.randomnessFactor !== config.randomnessFactor ||
      pendingConfig.historyWindowSize !== config.historyWindowSize ||
      pendingConfig.artistPenalty !== config.artistPenalty ||
      pendingConfig.albumPenalty !== config.albumPenalty ||
      pendingConfig.recentPlayPenalty !== config.recentPlayPenalty ||
      pendingConfig.vibeWeight !== config.vibeWeight ||
      pendingConfig.sessionWeight !== config.sessionWeight ||
      pendingConfig.favouriteBoost !== config.favouriteBoost
    );
  }, [pendingConfig, config]);

  const handleBpmModeChange = useCallback((key: string) => {
    setPendingConfig(prev => ({ ...prev, bpmMode: key as BpmMode }));
  }, []);

  const updateField = useCallback((field: keyof ShuffleConfig, value: number) => {
    setPendingConfig(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleApply = useCallback(async () => {
    await actions.updateShuffleConfig(pendingConfig);
  }, [actions, pendingConfig]);

  const handleResetDefaults = useCallback(() => {
    Alert.alert(
      'Reset to Defaults',
      'This will reset all shuffle settings to their default values.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            const defaults = createDefaultShuffleConfig();
            const resetConfig: ShuffleConfig = {
              ...defaults,
              mode: config.mode,
              seed: config.seed,
            };
            setPendingConfig(resetConfig);
            await actions.updateShuffleConfig(resetConfig);
          },
        },
      ],
    );
  }, [config.mode, config.seed, actions]);

  const handleClearSkipHistory = useCallback(() => {
    Alert.alert(
      'Clear Skip History',
      `This will remove skip data for ${skipStatsSize} tracked song${skipStatsSize === 1 ? '' : 's'}. Shuffle will treat all songs equally again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await actions.clearSkipStats();
          },
        },
      ],
    );
  }, [actions, skipStatsSize]);

  const bpmDescription = useMemo(() => {
    const match = BpmModeOptions.find(o => o.key === pendingConfig.bpmMode);
    return match?.description ?? '';
  }, [pendingConfig.bpmMode]);

  const skipEnabled = pendingConfig.skipPenalty > 0;
  const vibeEnabled = pendingConfig.vibeWeight > 0;
  const sessionEnabled = pendingConfig.sessionWeight > 0;
  const analysisPercent =
    analysisStatus.total > 0 ? Math.round((analysisStatus.analyzed / analysisStatus.total) * 100) : 0;

  const handleRestore = useCallback(() => {
    Alert.alert(
      'Restore Backup',
      'Adds favourites, playlists and listening history from the backup file to what you have now.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            const ok = await actions.restoreFromBackup();
            if (ok) {
              Alert.alert('Restored', 'Your favourites and playlists were restored.');
            }
          },
        },
      ],
    );
  }, [actions]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      <View style={styles.headerBar}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={onBack}
          activeOpacity={0.6}
          hitSlop={HitSlop}
        >
          <BackIcon size={24} color="#e0e0e0" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Shuffle Settings</Text>

        <View style={styles.headerButton} />
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <VinylIcon size={18} color="#b388ff" />
            <Text style={styles.sectionTitle}>Vibe Matching</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Songs are analyzed on the phone (tempo, key, energy, mood, brightness and
            danceability, the same analyzer as Music Lens) so Smart Shuffle keeps the vibe
            flowing and learns from what you skip or play through this session.
          </Text>

          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>
              {analysisStatus.available
                ? `${analysisStatus.analyzed} of ${analysisStatus.total} songs analyzed (${analysisPercent}%)`
                : 'Analyzer not available in this build'}
            </Text>
            {analysisStatus.failed > 0 && (
              <Text style={styles.progressHint}>{analysisStatus.failed} could not be read</Text>
            )}
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${analysisPercent}%` }]} />
          </View>
          {analysisStatus.available && analysisStatus.analyzed < analysisStatus.total && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={analysisStatus.running ? actions.cancelAnalysis : actions.startAnalysis}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryButtonText}>
                {analysisStatus.running ? 'Pause analysis' : 'Analyze remaining songs'}
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Keep the vibe</Text>
            <TouchableOpacity
              style={[styles.toggleButton, vibeEnabled && styles.toggleButtonActive]}
              onPress={() => updateField('vibeWeight', vibeEnabled ? 0 : 45)}
              activeOpacity={0.7}
            >
              <Text style={[styles.toggleButtonText, vibeEnabled && styles.toggleButtonTextActive]}>
                {vibeEnabled ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>
          </View>
          {vibeEnabled && (
            <SliderRow
              label="Vibe Strength"
              value={pendingConfig.vibeWeight}
              min={10}
              max={100}
              step={5}
              onDecrease={() => updateField('vibeWeight', clamp(pendingConfig.vibeWeight - 5, 10, 100))}
              onIncrease={() => updateField('vibeWeight', clamp(pendingConfig.vibeWeight + 5, 10, 100))}
            />
          )}

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Learn from this session</Text>
            <TouchableOpacity
              style={[styles.toggleButton, sessionEnabled && styles.toggleButtonActive]}
              onPress={() => updateField('sessionWeight', sessionEnabled ? 0 : 50)}
              activeOpacity={0.7}
            >
              <Text style={[styles.toggleButtonText, sessionEnabled && styles.toggleButtonTextActive]}>
                {sessionEnabled ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>
          </View>
          {sessionEnabled && (
            <Text style={styles.modeDescription}>
              Skip a song and upcoming songs with a similar vibe move back. Play one through and
              similar songs move forward. Resets when the app restarts.
            </Text>
          )}

          <SliderRow
            label="Favourites Boost"
            value={pendingConfig.favouriteBoost}
            min={0}
            max={60}
            step={5}
            onDecrease={() => updateField('favouriteBoost', clamp(pendingConfig.favouriteBoost - 5, 0, 60))}
            onIncrease={() => updateField('favouriteBoost', clamp(pendingConfig.favouriteBoost + 5, 0, 60))}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MusicBoltIcon size={18} color="#1db954" />
            <Text style={styles.sectionTitle}>BPM Matching</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Controls how shuffle considers song tempo when picking the next track.
          </Text>

          <SegmentedControl
            options={BpmModeOptions}
            selectedKey={pendingConfig.bpmMode}
            onSelect={handleBpmModeChange}
          />

          {pendingConfig.bpmMode !== 'off' && (
            <Text style={styles.modeDescription}>{bpmDescription}</Text>
          )}

          {pendingConfig.bpmMode !== 'off' && (
            <>
              <SliderRow
                label="BPM Tolerance"
                value={pendingConfig.bpmTolerance}
                min={3}
                max={50}
                step={1}
                unit="BPM"
                onDecrease={() =>
                  updateField('bpmTolerance', clamp(pendingConfig.bpmTolerance - 1, 3, 50))
                }
                onIncrease={() =>
                  updateField('bpmTolerance', clamp(pendingConfig.bpmTolerance + 1, 3, 50))
                }
              />

              <SliderRow
                label="BPM Penalty"
                value={pendingConfig.bpmPenalty}
                min={0}
                max={100}
                step={5}
                onDecrease={() =>
                  updateField('bpmPenalty', clamp(pendingConfig.bpmPenalty - 5, 0, 100))
                }
                onIncrease={() =>
                  updateField('bpmPenalty', clamp(pendingConfig.bpmPenalty + 5, 0, 100))
                }
              />
            </>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ShuffleIcon size={18} color="#e8a838" />
            <Text style={styles.sectionTitle}>Skip Intelligence</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Songs you skip again and again (3+ times, more often than not) get played
            less. A one-off skip only affects the current session, and songs you play to the
            end count in their favour. The penalty fades over a couple of weeks.
          </Text>

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Skip Penalty</Text>
            <TouchableOpacity
              style={[styles.toggleButton, skipEnabled && styles.toggleButtonActive]}
              onPress={() => updateField('skipPenalty', skipEnabled ? 0 : 40)}
              activeOpacity={0.7}
            >
              <Text style={[styles.toggleButtonText, skipEnabled && styles.toggleButtonTextActive]}>
                {skipEnabled ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>
          </View>

          {skipEnabled && (
            <SliderRow
              label="Penalty Strength"
              value={pendingConfig.skipPenalty}
              min={10}
              max={100}
              step={5}
              onDecrease={() =>
                updateField('skipPenalty', clamp(pendingConfig.skipPenalty - 5, 10, 100))
              }
              onIncrease={() =>
                updateField('skipPenalty', clamp(pendingConfig.skipPenalty + 5, 10, 100))
              }
            />
          )}

          <TouchableOpacity
            style={styles.dangerButton}
            onPress={handleClearSkipHistory}
            activeOpacity={0.7}
          >
            <TrashIcon size={16} color="#e57373" />
            <Text style={styles.dangerButtonText}>
              Clear Skip History ({skipStatsSize} song{skipStatsSize === 1 ? '' : 's'})
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ShuffleIcon size={18} color="#64b5f6" />
            <Text style={styles.sectionTitle}>Shuffle Tuning</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Fine-tune how the smart shuffle algorithm picks tracks.
          </Text>

          <SliderRow
            label="Artist Gap"
            value={pendingConfig.minArtistGap}
            min={0}
            max={15}
            step={1}
            unit="tracks"
            onDecrease={() =>
              updateField('minArtistGap', clamp(pendingConfig.minArtistGap - 1, 0, 15))
            }
            onIncrease={() =>
              updateField('minArtistGap', clamp(pendingConfig.minArtistGap + 1, 0, 15))
            }
          />

          <SliderRow
            label="Album Gap"
            value={pendingConfig.minAlbumGap}
            min={0}
            max={15}
            step={1}
            unit="tracks"
            onDecrease={() =>
              updateField('minAlbumGap', clamp(pendingConfig.minAlbumGap - 1, 0, 15))
            }
            onIncrease={() =>
              updateField('minAlbumGap', clamp(pendingConfig.minAlbumGap + 1, 0, 15))
            }
          />

          <SliderRow
            label="Artist Penalty"
            value={pendingConfig.artistPenalty}
            min={0}
            max={100}
            step={5}
            onDecrease={() =>
              updateField('artistPenalty', clamp(pendingConfig.artistPenalty - 5, 0, 100))
            }
            onIncrease={() =>
              updateField('artistPenalty', clamp(pendingConfig.artistPenalty + 5, 0, 100))
            }
          />

          <SliderRow
            label="Album Penalty"
            value={pendingConfig.albumPenalty}
            min={0}
            max={100}
            step={5}
            onDecrease={() =>
              updateField('albumPenalty', clamp(pendingConfig.albumPenalty - 5, 0, 100))
            }
            onIncrease={() =>
              updateField('albumPenalty', clamp(pendingConfig.albumPenalty + 5, 0, 100))
            }
          />

          <SliderRow
            label="Recent Play Penalty"
            value={pendingConfig.recentPlayPenalty}
            min={0}
            max={100}
            step={5}
            onDecrease={() =>
              updateField('recentPlayPenalty', clamp(pendingConfig.recentPlayPenalty - 5, 0, 100))
            }
            onIncrease={() =>
              updateField('recentPlayPenalty', clamp(pendingConfig.recentPlayPenalty + 5, 0, 100))
            }
          />

          <SliderRow
            label="Randomness"
            value={pendingConfig.randomnessFactor}
            min={0}
            max={100}
            step={5}
            onDecrease={() =>
              updateField('randomnessFactor', clamp(pendingConfig.randomnessFactor - 5, 0, 100))
            }
            onIncrease={() =>
              updateField('randomnessFactor', clamp(pendingConfig.randomnessFactor + 5, 0, 100))
            }
          />

          <SliderRow
            label="History Window"
            value={pendingConfig.historyWindowSize}
            min={5}
            max={100}
            step={5}
            unit="tracks"
            onDecrease={() =>
              updateField('historyWindowSize', clamp(pendingConfig.historyWindowSize - 5, 5, 100))
            }
            onIncrease={() =>
              updateField('historyWindowSize', clamp(pendingConfig.historyWindowSize + 5, 5, 100))
            }
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FolderIcon size={18} color="#4fc3f7" />
            <Text style={styles.sectionTitle}>Backup</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Favourites, playlists, play counts and song analysis are saved automatically to{' '}
            {backupStatus.location}. That folder survives reinstalling or rebuilding the app,
            and the backup is restored automatically on first launch.
          </Text>
          {backupStatus.allFilesAccess === false && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                Allow "All files access" so the app can read its backup after a reinstall.
              </Text>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={actions.requestAllFilesAccess}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryButtonText}>Allow access</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text style={styles.progressLabel}>Last backup: {formatTimeAgo(backupStatus.lastBackupAt)}</Text>
          {backupStatus.lastError != null && (
            <Text style={styles.errorText}>{backupStatus.lastError}</Text>
          )}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={actions.backupNow} activeOpacity={0.7}>
              <Text style={styles.secondaryButtonText}>Back up now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleRestore} activeOpacity={0.7}>
              <Text style={styles.secondaryButtonText}>Restore</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.actionsSection}>
          {hasChanges && (
            <TouchableOpacity
              style={styles.applyButton}
              onPress={handleApply}
              activeOpacity={0.7}
            >
              <Text style={styles.applyButtonText}>Apply Changes</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.resetButton}
            onPress={handleResetDefaults}
            activeOpacity={0.7}
          >
            <RefreshIcon size={16} color="#aaa" />
            <Text style={styles.resetButtonText}>Reset to Defaults</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#121212',
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#0a0a0a',
    minHeight: 56,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e0e0e0',
    flex: 1,
    textAlign: 'center',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  section: {
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a3e',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#e0e0e0',
    letterSpacing: 0.3,
  },
  sectionDescription: {
    fontSize: 13,
    color: '#888',
    lineHeight: 18,
    marginBottom: 14,
  },
  modeDescription: {
    fontSize: 12,
    color: '#1db954',
    marginTop: 8,
    marginBottom: 4,
    fontStyle: 'italic',
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: '#111125',
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  segmentedOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedOptionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 0.8,
  },
  segmentedOptionTextActive: {
    color: '#fff',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  sliderLabel: {
    fontSize: 14,
    color: '#ccc',
    flex: 1,
  },
  sliderControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#252540',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonDisabled: {
    opacity: 0.3,
  },
  stepButtonText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#e0e0e0',
    lineHeight: 22,
  },
  stepButtonTextDisabled: {
    color: '#555',
  },
  sliderValueContainer: {
    minWidth: 70,
    alignItems: 'center',
  },
  sliderValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e0e0e0',
    fontVariant: ['tabular-nums'],
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  toggleLabel: {
    fontSize: 14,
    color: '#ccc',
  },
  toggleButton: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#252540',
  },
  toggleButtonActive: {
    backgroundColor: '#1db954',
  },
  toggleButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 0.8,
  },
  toggleButtonTextActive: {
    color: '#fff',
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(229, 115, 115, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(229, 115, 115, 0.25)',
  },
  dangerButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e57373',
  },
  progressRow: {
    marginTop: 4,
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 13,
    color: '#bbb',
    marginBottom: 6,
  },
  progressHint: {
    fontSize: 12,
    color: '#777',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#b388ff',
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#444',
    marginTop: 6,
    marginBottom: 6,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e0e0e0',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  warningBox: {
    backgroundColor: '#2e2616',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  warningText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#f0d090',
  },
  errorText: {
    fontSize: 12,
    color: '#e57373',
    marginBottom: 6,
  },
  actionsSection: {
    marginHorizontal: 16,
    marginTop: 24,
    gap: 12,
  },
  applyButton: {
    backgroundColor: '#1db954',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#1db954',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  applyButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1a1a2e',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a3e',
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#aaa',
  },
});
