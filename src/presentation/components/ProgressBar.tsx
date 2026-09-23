import React, { useCallback, useState, useRef } from 'react';
import { View, Text, StyleSheet, PanResponder, LayoutChangeEvent } from 'react-native';
import { usePlayer } from '../hooks/usePlayer';
import { usePlaybackProgress } from '../state/progressStore';

interface ProgressBarProps {
  readonly height?: number;
  readonly trackColor?: string;
  readonly progressColor?: string;
  readonly thumbColor?: string;
  readonly showTimestamps?: boolean;
  readonly showThumb?: boolean;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function clampFraction(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function ProgressBarComponent({
  height = 4,
  trackColor = '#333',
  progressColor = '#1db954',
  thumbColor = '#fff',
  showTimestamps = true,
  showThumb = true,
}: ProgressBarProps) {
  const { controls, playerState } = usePlayer();
  const progress = usePlaybackProgress();
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekFraction, setSeekFraction] = useState(0);
  const barWidthRef = useRef(0);
  const barXRef = useRef(0);

  const displayFraction = isSeeking ? seekFraction : progress.fraction;
  const displayPosition = isSeeking
    ? seekFraction * progress.duration
    : progress.position;
  const remaining = progress.duration - displayPosition;

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    barWidthRef.current = width;
    barXRef.current = x;
  }, []);

  const computeFractionFromGesture = useCallback((pageX: number): number => {
    if (barWidthRef.current <= 0) {
      return 0;
    }
    const localX = pageX - barXRef.current;
    return clampFraction(localX / barWidthRef.current);
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: (event) => {
        setIsSeeking(true);
        const fraction = computeFractionFromGesture(event.nativeEvent.pageX);
        setSeekFraction(fraction);
      },

      onPanResponderMove: (event) => {
        const fraction = computeFractionFromGesture(event.nativeEvent.pageX);
        setSeekFraction(fraction);
      },

      onPanResponderRelease: async (event) => {
        const fraction = computeFractionFromGesture(event.nativeEvent.pageX);
        setSeekFraction(fraction);
        setIsSeeking(false);
        await controls.seekByFraction(fraction);
      },

      onPanResponderTerminate: () => {
        setIsSeeking(false);
      },
    }),
  ).current;

  const progressWidth = `${clampFraction(displayFraction) * 100}%` as const;
  const thumbSize = isSeeking ? 16 : 12;
  const hitAreaHeight = Math.max(height, 44);
  const verticalPadding = (hitAreaHeight - height) / 2;

  return (
    <View style={styles.container}>
      <View
        style={[styles.hitArea, { paddingVertical: verticalPadding }]}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
      >
        <View style={[styles.track, { height, backgroundColor: trackColor, borderRadius: height / 2 }]}>
          <View
            style={[
              styles.progress,
              {
                width: progressWidth,
                backgroundColor: progressColor,
                borderRadius: height / 2,
              },
            ]}
          />
          {showThumb && playerState.hasTrack && (
            <View
              style={[
                styles.thumbOuter,
                {
                  left: progressWidth,
                  width: thumbSize,
                  height: thumbSize,
                  borderRadius: thumbSize / 2,
                  marginLeft: -(thumbSize / 2),
                  marginTop: -(thumbSize - height) / 2,
                },
              ]}
            >
              <View
                style={[
                  styles.thumbInner,
                  {
                    width: thumbSize,
                    height: thumbSize,
                    borderRadius: thumbSize / 2,
                    backgroundColor: isSeeking ? progressColor : thumbColor,
                  },
                ]}
              />
            </View>
          )}
        </View>
      </View>

      {showTimestamps && (
        <View style={styles.timestampRow}>
          <Text style={styles.timestamp}>{formatTime(displayPosition)}</Text>
          <Text style={styles.timestamp}>-{formatTime(remaining)}</Text>
        </View>
      )}
    </View>
  );
}

export const ProgressBar = React.memo(ProgressBarComponent);

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 16,
  },
  hitArea: {
    width: '100%',
    justifyContent: 'center',
  },
  track: {
    width: '100%',
    overflow: 'visible',
    position: 'relative',
  },
  progress: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
  },
  thumbOuter: {
    position: 'absolute',
    top: 0,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  thumbInner: {
    elevation: 3,
  },
  timestampRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  timestamp: {
    fontSize: 12,
    color: '#888',
    fontVariant: ['tabular-nums'],
  },
});
