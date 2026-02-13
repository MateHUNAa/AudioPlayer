import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { QueueList } from '../components/QueueList';
import { Track } from '../../domain/models/Track';
import { usePlayer } from '../hooks/usePlayer';
import { BackIcon, ShuffleIcon } from '../components/Icons';

interface QueueScreenProps {
  readonly onBack?: () => void;
  readonly onTrackPress?: (track: Track) => void;
}

export function QueueScreen({ onBack, onTrackPress }: QueueScreenProps) {
  const { controls, playerState } = usePlayer();

  const handleBack = useCallback(() => {
    onBack?.();
  }, [onBack]);

  const handleTrackPress = useCallback(
    (track: Track) => {
      if (onTrackPress) {
        onTrackPress(track);
        return;
      }
      controls.playInQueue(track);
    },
    [onTrackPress, controls],
  );

  const shuffleModeLabel = resolveShuffleModeLabel(playerState.shuffleMode);
  const shuffleColor = playerState.shuffleMode !== 'off' ? '#1db954' : '#888';

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      <View style={styles.headerBar}>
        {onBack && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={0.6}
            hitSlop={hitSlop}
          >
            <BackIcon size={28} color="#e0e0e0" />
          </TouchableOpacity>
        )}

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Queue</Text>
          {shuffleModeLabel.length > 0 && (
            <View style={styles.shuffleBadge}>
              <Text style={styles.shuffleBadgeText}>{shuffleModeLabel}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.shuffleToggle}
          onPress={controls.toggleShuffle}
          activeOpacity={0.6}
          hitSlop={hitSlop}
        >
          <ShuffleIcon size={20} color={shuffleColor} />
        </TouchableOpacity>
      </View>

      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{playerState.queueLength}</Text>
          <Text style={styles.statLabel}>
            {playerState.queueLength === 1 ? 'Track' : 'Tracks'}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{playerState.queueIndex + 1}</Text>
          <Text style={styles.statLabel}>Current</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{playerState.upcoming.length}</Text>
          <Text style={styles.statLabel}>Remaining</Text>
        </View>
      </View>

      <QueueList
        showHeader={true}
        headerTitle="Up Next"
        onTrackPress={handleTrackPress}
        emptyMessage="Queue is empty. Play a track from the library to build a queue."
      />
    </View>
  );
}

function resolveShuffleModeLabel(mode: string): string {
  switch (mode) {
    case 'smart':
      return 'SMART SHUFFLE';
    case 'random':
      return 'RANDOM';
    default:
      return '';
  }
}

const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 } as const;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#121212',
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#0a0a0a',
    minHeight: 52,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e0e0e0',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shuffleToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shuffleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#1a2e1a',
    borderWidth: 1,
    borderColor: '#1db954',
  },
  shuffleBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1db954',
    letterSpacing: 1,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#0e0e0e',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
    gap: 24,
  },
  statItem: {
    alignItems: 'center',
    minWidth: 60,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e0e0e0',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#2a2a2a',
  },
});
