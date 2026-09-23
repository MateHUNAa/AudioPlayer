import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Track } from '../../domain/models/Track';
import {
  CloseIcon,
  HeartIcon,
  HeartFilledIcon,
  MusicIcon,
  PlaylistAddIcon,
} from './Icons';

/** Every row is exactly this tall; lists rely on it for getItemLayout. */
export const TrackItemHeight = 64;

interface TrackItemProps {
  readonly track: Track;
  readonly isActive: boolean;
  readonly isPlaying: boolean;
  readonly onPress: (track: Track) => void;
  readonly index: number;
  readonly isFavourite?: boolean;
  readonly onToggleFavourite?: (track: Track) => void;
  readonly onAddToPlaylist?: (track: Track) => void;
  readonly onDismiss?: (track: Track) => void;
  readonly badge?: string;
  readonly showActions?: boolean;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) {
    return '0:00';
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const ActionHitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;

function TrackItemComponent({
  track,
  isActive,
  isPlaying,
  onPress,
  index,
  isFavourite = false,
  onToggleFavourite,
  onAddToPlaylist,
  onDismiss,
  badge,
  showActions = true,
}: TrackItemProps) {
  const handlePress = useCallback(() => {
    onPress(track);
  }, [track, onPress]);

  const handleToggleFavourite = useCallback(() => {
    onToggleFavourite?.(track);
  }, [track, onToggleFavourite]);

  const handleAddToPlaylist = useCallback(() => {
    onAddToPlaylist?.(track);
  }, [track, onAddToPlaylist]);

  const handleDismiss = useCallback(() => {
    onDismiss?.(track);
  }, [track, onDismiss]);

  return (
    <TouchableOpacity
      style={[styles.container, isActive && styles.activeContainer]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.indexContainer}>
        {isActive && isPlaying ? (
          <View style={styles.playingIndicator}>
            <View style={[styles.bar, styles.bar1]} />
            <View style={[styles.bar, styles.bar2]} />
            <View style={[styles.bar, styles.bar3]} />
          </View>
        ) : isActive ? (
          <MusicIcon size={16} color="#1db954" />
        ) : (
          <Text style={styles.indexText}>{index + 1}</Text>
        )}
      </View>

      <View style={styles.infoContainer}>
        <Text
          style={[styles.title, isActive && styles.activeText]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {track.title}
        </Text>
        <View style={styles.subtitleRow}>
          <Text
            style={[styles.artist, isActive && styles.activeSubtext]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {track.artist}
          </Text>
          {track.album !== 'Unknown Album' && (
            <>
              <Text
                style={[styles.separator, isActive && styles.activeSubtext]}
              >
                •
              </Text>
              <Text
                style={[styles.album, isActive && styles.activeSubtext]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {track.album}
              </Text>
            </>
          )}
        </View>
      </View>

      {showActions && (
        <View style={styles.actionsContainer}>
          {onToggleFavourite && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleToggleFavourite}
              activeOpacity={0.6}
              hitSlop={ActionHitSlop}
            >
              {isFavourite ? (
                <HeartFilledIcon size={18} color="#e53935" />
              ) : (
                <HeartIcon size={18} color="#555" />
              )}
            </TouchableOpacity>
          )}
          {onDismiss && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleDismiss}
              activeOpacity={0.6}
              hitSlop={ActionHitSlop}
            >
              <CloseIcon size={16} color="#555" />
            </TouchableOpacity>
          )}
          {onAddToPlaylist && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleAddToPlaylist}
              activeOpacity={0.6}
              hitSlop={ActionHitSlop}
            >
              <PlaylistAddIcon size={18} color="#555" />
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.metaContainer}>
        <Text style={[styles.duration, isActive && styles.activeSubtext]}>
          {formatDuration(track.duration)}
        </Text>
        {badge != null && <Text style={styles.badge}>{badge}</Text>}
        {track.format !== 'mp3' && (
          <Text style={[styles.format, isActive && styles.activeFormat]}>
            {track.format.toUpperCase()}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export const TrackItem = React.memo(TrackItemComponent);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: TrackItemHeight,
    paddingHorizontal: 16,
    backgroundColor: '#121212',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
  },
  activeContainer: {
    backgroundColor: '#1a1a2e',
  },
  indexContainer: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  indexText: {
    fontSize: 14,
    color: '#888',
    fontVariant: ['tabular-nums'],
  },
  playingIndicator: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 16,
    gap: 2,
  },
  bar: {
    width: 3,
    backgroundColor: '#1db954',
    borderRadius: 1,
  },
  bar1: {
    height: 12,
  },
  bar2: {
    height: 16,
  },
  bar3: {
    height: 8,
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 8,
  },
  // Fixed line heights keep rows the same height for scripts with taller glyphs (e.g. Arabic).
  title: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '500',
    color: '#e0e0e0',
    marginBottom: 2,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  artist: {
    fontSize: 13,
    lineHeight: 17,
    color: '#999',
    flexShrink: 1,
  },
  separator: {
    fontSize: 13,
    color: '#666',
    marginHorizontal: 6,
  },
  album: {
    fontSize: 13,
    lineHeight: 17,
    color: '#999',
    flexShrink: 2,
  },
  badge: {
    fontSize: 11,
    color: '#e8a838',
    fontWeight: '700',
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 8,
  },
  actionButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  duration: {
    fontSize: 13,
    color: '#888',
    fontVariant: ['tabular-nums'],
  },
  format: {
    fontSize: 10,
    color: '#1db954',
    fontWeight: '600',
    marginTop: 3,
    letterSpacing: 0.5,
  },
  activeText: {
    color: '#1db954',
  },
  activeSubtext: {
    color: '#4ecb71',
  },
  activeFormat: {
    color: '#4ecb71',
  },
});
