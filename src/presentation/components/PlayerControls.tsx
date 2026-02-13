import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { usePlayer } from '../hooks/usePlayer';
import { ShuffleMode, RepeatMode } from '../../domain/models/PlaybackState';
import {
  ShuffleIcon,
  RepeatIcon,
  RepeatOnceIcon,
  PlayIcon,
  PauseIcon,
  SkipForwardIcon,
  SkipBackIcon,
  LoadingIcon,
} from './Icons';

function ShuffleDisplay({ mode }: { readonly mode: ShuffleMode }) {
  const color = mode === 'off' ? '#888' : '#1db954';
  return <ShuffleIcon size={22} color={color} />;
}

function RepeatDisplay({ mode }: { readonly mode: RepeatMode }) {
  const color = mode === 'off' ? '#888' : '#1db954';
  if (mode === 'one') {
    return <RepeatOnceIcon size={22} color={color} />;
  }
  return <RepeatIcon size={22} color={color} />;
}

function PlayerControlsComponent() {
  const { controls, playerState } = usePlayer();

  const handleTogglePlayback = useCallback(async () => {
    await controls.togglePlayback();
  }, [controls]);

  const handleNext = useCallback(async () => {
    await controls.next();
  }, [controls]);

  const handlePrevious = useCallback(async () => {
    await controls.previous();
  }, [controls]);

  const handleToggleShuffle = useCallback(async () => {
    await controls.toggleShuffle();
  }, [controls]);

  const shuffleModeLabel = resolveShuffleModeLabel(playerState.shuffleMode);

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleToggleShuffle}
          activeOpacity={0.6}
          hitSlop={HitSlop}
        >
          <ShuffleDisplay mode={playerState.shuffleMode} />
          {playerState.shuffleMode !== 'off' && (
            <Text style={styles.modeLabel}>{shuffleModeLabel}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.6}
          hitSlop={HitSlop}
        >
          <RepeatDisplay mode={playerState.repeatMode} />
        </TouchableOpacity>
      </View>

      <View style={styles.mainRow}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={handlePrevious}
          activeOpacity={0.6}
          hitSlop={HitSlop}
          disabled={!playerState.hasTrack}
        >
          <SkipBackIcon size={28} color="#e0e0e0" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.playButton,
            !playerState.hasTrack && styles.disabledButton,
          ]}
          onPress={handleTogglePlayback}
          activeOpacity={0.7}
          disabled={!playerState.hasTrack && playerState.isStopped}
        >
          {playerState.isBuffering ? (
            <LoadingIcon size={28} color="#fff" />
          ) : playerState.isPlaying ? (
            <PauseIcon size={28} color="#fff" />
          ) : (
            <PlayIcon size={28} color="#fff" />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navButton}
          onPress={handleNext}
          activeOpacity={0.6}
          hitSlop={HitSlop}
          disabled={!playerState.hasTrack}
        >
          <SkipForwardIcon size={28} color="#e0e0e0" />
        </TouchableOpacity>
      </View>

      {playerState.hasTrack && (
        <View style={styles.queueInfoRow}>
          <Text style={styles.queueInfoText}>
            {playerState.queueIndex + 1} / {playerState.queueLength}
          </Text>
        </View>
      )}
    </View>
  );
}

function resolveShuffleModeLabel(mode: ShuffleMode): string {
  switch (mode) {
    case 'smart':
      return 'SMART';
    case 'random':
      return 'RANDOM';
    case 'off':
      return '';
  }
}

const HitSlop = { top: 10, bottom: 10, left: 10, right: 10 } as const;

export const PlayerControls = React.memo(PlayerControlsComponent);

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#121212',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  mainRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
  },
  queueInfoRow: {
    alignItems: 'center',
    marginTop: 10,
  },
  queueInfoText: {
    fontSize: 12,
    color: '#666',
    fontVariant: ['tabular-nums'],
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
  },
  navButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 56,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1db954',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#1db954',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  disabledButton: {
    backgroundColor: '#333',
    shadowOpacity: 0,
    elevation: 0,
  },
  modeLabel: {
    fontSize: 9,
    color: '#1db954',
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.8,
  },
});
