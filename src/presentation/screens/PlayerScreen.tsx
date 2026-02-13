import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { usePlayer } from '../hooks/usePlayer';
import { useFavourites } from '../hooks/useFavourites';
import { ProgressBar } from '../components/ProgressBar';
import { PlayerControls } from '../components/PlayerControls';
import { ShuffleMode } from '../../domain/models/PlaybackState';
import {
  BackIcon,
  MenuIcon,
  MusicIcon,
  MusicBoltIcon,
  HeartIcon,
  HeartFilledIcon,
  ShuffleIcon,
  RepeatIcon,
  RepeatOnceIcon,
  AlertIcon,
} from '../components/Icons';

interface PlayerScreenProps {
  readonly onOpenQueue?: () => void;
  readonly onOpenLibrary?: () => void;
  readonly onBack?: () => void;
}

const { width: ScreenWidth } = Dimensions.get('window');
const ArtworkSize = Math.min(ScreenWidth - 64, 340) as number;

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) {
    return '0:00';
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function resolveShuffleModeDisplay(mode: ShuffleMode): {
  label: string;
  color: string;
} {
  switch (mode) {
    case 'smart':
      return { label: 'Smart Shuffle', color: '#1db954' };
    case 'random':
      return { label: 'Random Shuffle', color: '#1db954' };
    case 'off':
      return { label: 'Shuffle Off', color: '#666' };
  }
}

function resolveFormatBadgeColor(format: string): string {
  switch (format.toLowerCase()) {
    case 'flac':
      return '#e8a838';
    case 'wav':
      return '#4a9eff';
    case 'aac':
      return '#a855f7';
    case 'ogg':
      return '#f97316';
    case 'm4a':
      return '#06b6d4';
    default:
      return '#888';
  }
}

export function PlayerScreen({
  onOpenQueue,
  onOpenLibrary,
  onBack,
}: PlayerScreenProps) {
  const { playerState } = usePlayer();
  const { controls: favControls } = useFavourites();
  const {
    currentTrack,
    shuffleMode,
    repeatMode,
    isPlaying,
    queueIndex,
    queueLength,
  } = playerState;

  const handleOpenQueue = useCallback(() => {
    onOpenQueue?.();
  }, [onOpenQueue]);

  const handleOpenLibrary = useCallback(() => {
    onOpenLibrary?.();
  }, [onOpenLibrary]);

  const handleBack = useCallback(() => {
    onBack?.();
  }, [onBack]);

  const handleToggleFavourite = useCallback(async () => {
    if (currentTrack) {
      await favControls.toggle(currentTrack.id);
    }
  }, [currentTrack, favControls]);

  const isFav = useMemo(() => {
    if (!currentTrack) {
      return false;
    }
    return favControls.isFavourite(currentTrack.id);
  }, [currentTrack, favControls]);

  const shuffleDisplay = useMemo(
    () => resolveShuffleModeDisplay(shuffleMode),
    [shuffleMode],
  );

  const repeatLabel = useMemo(() => {
    switch (repeatMode) {
      case 'one':
        return 'Repeat One';
      case 'all':
        return 'Repeat All';
      case 'off':
        return '';
    }
  }, [repeatMode]);

  const formatBadgeColor = useMemo(() => {
    if (!currentTrack) {
      return '#888';
    }
    return resolveFormatBadgeColor(currentTrack.format);
  }, [currentTrack]);

  if (!currentTrack) {
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
          <Text style={styles.headerTitle}>Now Playing</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.emptyContainer}>
          <View style={styles.emptyArtworkPlaceholder}>
            <MusicIcon size={72} color="#333" />
          </View>
          <Text style={styles.emptyTitle}>Nothing Playing</Text>
          <Text style={styles.emptySubtitle}>
            Select a track from your library to start listening
          </Text>
          {onOpenLibrary && (
            <TouchableOpacity
              style={styles.openLibraryButton}
              onPress={handleOpenLibrary}
              activeOpacity={0.7}
            >
              <Text style={styles.openLibraryButtonText}>Open Library</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

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
          <Text style={styles.headerSubtitle}>PLAYING FROM</Text>
          <Text
            style={styles.headerSource}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {currentTrack.album !== 'Unknown Album'
              ? currentTrack.album
              : 'Library'}
          </Text>
        </View>
        {onOpenQueue && (
          <TouchableOpacity
            style={styles.queueButton}
            onPress={handleOpenQueue}
            activeOpacity={0.6}
            hitSlop={hitSlop}
          >
            <MenuIcon size={20} color="#e0e0e0" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        <View style={styles.artworkContainer}>
          <View style={styles.artworkWrapper}>
            <View
              style={[
                styles.artworkShadow,
                isPlaying && styles.artworkShadowActive,
              ]}
            />
            <View style={styles.artwork}>
              {currentTrack.artwork ? (
                <Text style={styles.artworkFallbackText}>
                  {currentTrack.title.charAt(0).toUpperCase()}
                </Text>
              ) : (
                <>
                  <MusicBoltIcon size={64} color="#333" />
                  <Text style={styles.artworkFallbackText}>
                    {currentTrack.title.charAt(0).toUpperCase()}
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>

        <View style={styles.trackInfoContainer}>
          <View style={styles.titleRow}>
            <Text
              style={styles.trackTitle}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {currentTrack.title}
            </Text>

            <TouchableOpacity
              style={styles.favouriteButton}
              onPress={handleToggleFavourite}
              activeOpacity={0.6}
              hitSlop={hitSlop}
            >
              {isFav ? (
                <HeartFilledIcon size={24} color="#e53935" />
              ) : (
                <HeartIcon size={24} color="#666" />
              )}
            </TouchableOpacity>

            {currentTrack.format !== 'mp3' && (
              <View
                style={[styles.formatBadge, { borderColor: formatBadgeColor }]}
              >
                <Text
                  style={[styles.formatBadgeText, { color: formatBadgeColor }]}
                >
                  {currentTrack.format.toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          <Text
            style={styles.trackArtist}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {currentTrack.artist}
          </Text>

          {currentTrack.album !== 'Unknown Album' && (
            <Text
              style={styles.trackAlbum}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {currentTrack.album}
              {currentTrack.year != null && (
                <Text style={styles.trackYear}> ({currentTrack.year})</Text>
              )}
            </Text>
          )}
        </View>

        <View style={styles.progressContainer}>
          <ProgressBar
            height={4}
            trackColor="#333"
            progressColor="#1db954"
            thumbColor="#fff"
            showTimestamps={true}
            showThumb={true}
          />
        </View>

        <PlayerControls />

        <View style={styles.metadataContainer}>
          <View style={styles.metadataRow}>
            <View style={styles.metadataPill}>
              <View style={styles.metadataPillContent}>
                <ShuffleIcon size={14} color={shuffleDisplay.color} />
                <Text
                  style={[
                    styles.metadataPillText,
                    { color: shuffleDisplay.color },
                  ]}
                >
                  {shuffleDisplay.label}
                </Text>
              </View>
            </View>

            {repeatLabel.length > 0 && (
              <View style={styles.metadataPill}>
                <View style={styles.metadataPillContent}>
                  {repeatMode === 'one' ? (
                    <RepeatOnceIcon size={14} color="#1db954" />
                  ) : (
                    <RepeatIcon size={14} color="#1db954" />
                  )}
                  <Text style={styles.metadataPillTextActive}>
                    {repeatLabel}
                  </Text>
                </View>
              </View>
            )}
          </View>

          <View style={styles.metadataRow}>
            {currentTrack.genre != null && (
              <View style={styles.metadataChip}>
                <Text style={styles.metadataChipText}>
                  {currentTrack.genre}
                </Text>
              </View>
            )}

            {currentTrack.bpm != null && (
              <View style={styles.metadataChip}>
                <Text style={styles.metadataChipText}>
                  {currentTrack.bpm} BPM
                </Text>
              </View>
            )}

            {currentTrack.trackNumber != null && (
              <View style={styles.metadataChip}>
                <Text style={styles.metadataChipText}>
                  Track {currentTrack.trackNumber}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.queuePositionContainer}>
            <Text style={styles.queuePositionText}>
              {queueIndex + 1} of {queueLength}
            </Text>
            <Text style={styles.durationText}>
              {formatDuration(currentTrack.duration)}
            </Text>
          </View>
        </View>
      </ScrollView>

      {playerState.error != null && (
        <View style={styles.errorBanner}>
          <AlertIcon size={16} color="#f0a0a0" />
          <Text style={styles.errorText} numberOfLines={2}>
            {playerState.error}
          </Text>
        </View>
      )}
    </View>
  );
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e0e0e0',
    flex: 1,
    textAlign: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  headerSource: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e0e0e0',
    maxWidth: 200,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  artworkContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 24,
    paddingBottom: 28,
    paddingHorizontal: 32,
  },
  artworkWrapper: {
    position: 'relative',
  },
  artworkShadow: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: -8,
    bottom: -8,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  artworkShadowActive: {
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
  },
  artwork: {
    width: ArtworkSize,
    height: ArtworkSize,
    borderRadius: 12,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  artworkFallbackText: {
    fontSize: 72,
    fontWeight: '800',
    color: '#2a2a4a',
    letterSpacing: -2,
  },
  trackInfoContainer: {
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  trackTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#e0e0e0',
    flex: 1,
    letterSpacing: -0.3,
    lineHeight: 30,
  },
  favouriteButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  formatBadge: {
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  formatBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  trackArtist: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1db954',
    marginBottom: 4,
  },
  trackAlbum: {
    fontSize: 14,
    color: '#999',
    fontWeight: '400',
  },
  trackYear: {
    fontSize: 14,
    color: '#666',
  },
  progressContainer: {
    marginBottom: 8,
  },
  metadataContainer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    gap: 10,
  },
  metadataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  metadataPill: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a2a',
  },
  metadataPillContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metadataPillText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  metadataPillTextActive: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1db954',
    letterSpacing: 0.3,
  },
  metadataChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#1e1e1e',
  },
  metadataChipText: {
    fontSize: 11,
    color: '#aaa',
    fontWeight: '500',
  },
  queuePositionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2a2a',
    marginTop: 6,
  },
  queuePositionText: {
    fontSize: 12,
    color: '#666',
    fontVariant: ['tabular-nums'],
  },
  durationText: {
    fontSize: 12,
    color: '#666',
    fontVariant: ['tabular-nums'],
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 60,
  },
  emptyArtworkPlaceholder: {
    width: ArtworkSize * 0.7,
    height: ArtworkSize * 0.7,
    borderRadius: 16,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#e0e0e0',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    maxWidth: 260,
  },
  openLibraryButton: {
    backgroundColor: '#1db954',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 24,
    elevation: 3,
    shadowColor: '#1db954',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  openLibraryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2e1a1a',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#e53935',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    gap: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#f0a0a0',
    lineHeight: 18,
  },
});
