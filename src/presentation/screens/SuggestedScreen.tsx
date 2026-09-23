import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ListRenderItemInfo,
} from 'react-native';
import { Track } from '../../domain/models/Track';
import { Suggestion, SuggestionMinFullPlays } from '../../domain/models/Suggestions';
import { TrackItem, TrackItemHeight } from '../components/TrackItem';
import { usePlayer } from '../hooks/usePlayer';
import { useSuggestions } from '../hooks/useSuggestions';
import { useAppContext } from '../context/AppContext';
import { BackIcon, PlayIcon, RepeatIcon } from '../components/Icons';

interface SuggestedScreenProps {
  readonly onBack?: () => void;
}

function keyExtractor(item: Suggestion): string {
  return item.track.id;
}

function getItemLayout(
  _data: ArrayLike<Suggestion> | null | undefined,
  index: number,
) {
  return { length: TrackItemHeight, offset: TrackItemHeight * index, index };
}

export function SuggestedScreen({ onBack }: SuggestedScreenProps) {
  const { playerState } = usePlayer();
  const { actions } = useAppContext();
  const suggestions = useSuggestions();

  const tracks = useMemo(() => suggestions.map(s => s.track), [suggestions]);

  const handleTrackPress = useCallback(
    async (track: Track) => {
      const index = tracks.findIndex(t => t.id === track.id);
      await actions.playCollection(tracks, Math.max(0, index));
    },
    [actions, tracks],
  );

  const handlePlayAll = useCallback(async () => {
    if (tracks.length > 0) {
      await actions.playCollection(tracks, 0);
    }
  }, [actions, tracks]);

  const handleLove = useCallback(
    async (track: Track) => {
      await actions.toggleFavourite(track.id);
    },
    [actions],
  );

  const handleDismiss = useCallback(
    async (track: Track) => {
      await actions.dismissSuggestion(track.id);
    },
    [actions],
  );

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Suggestion>) => {
      const isActive = playerState.currentTrack?.id === item.track.id;
      return (
        <TrackItem
          track={item.track}
          isActive={isActive}
          isPlaying={isActive && playerState.isPlaying}
          onPress={handleTrackPress}
          index={index}
          isFavourite={false}
          onToggleFavourite={handleLove}
          onDismiss={handleDismiss}
          badge={`${item.fullPlays}×`}
        />
      );
    },
    [playerState.currentTrack, playerState.isPlaying, handleTrackPress, handleLove, handleDismiss],
  );

  const renderHeader = useCallback(
    () => (
      <View style={styles.listHeader}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <RepeatIcon size={44} color="#e8a838" />
          </View>
          <Text style={styles.heroTitle}>Suggested</Text>
          <Text style={styles.heroSubtitle}>
            Songs you keep playing but haven't loved yet. Tap the heart to add one to
            Favourites, or × to hide it.
          </Text>
        </View>
        {tracks.length > 0 && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.playAllButton} onPress={handlePlayAll} activeOpacity={0.7}>
              <PlayIcon size={18} color="#fff" />
              <Text style={styles.playAllButtonText}>Play All</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    ),
    [tracks.length, handlePlayAll],
  );

  const renderEmpty = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>Nothing to suggest yet</Text>
        <Text style={styles.emptySubtitle}>
          When you play a song to the end {SuggestionMinFullPlays} or more times without loving
          it, it shows up here.
        </Text>
      </View>
    ),
    [],
  );

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <View style={styles.headerBar}>
        {onBack && (
          <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.6} hitSlop={HitSlop}>
            <BackIcon size={28} color="#e0e0e0" />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>Suggested</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList<Suggestion>
        data={suggestions}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        initialNumToRender={15}
        maxToRenderPerBatch={15}
        windowSize={7}
      />
    </View>
  );
}

const HitSlop = { top: 10, bottom: 10, left: 10, right: 10 } as const;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#121212',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#0a0a0a',
    minHeight: 52,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#e0e0e0',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  listHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
    paddingBottom: 12,
  },
  hero: {
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: 24,
  },
  heroIcon: {
    width: 88,
    height: 88,
    borderRadius: 16,
    backgroundColor: '#2a2210',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#e0e0e0',
  },
  heroSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: '#888',
    textAlign: 'center',
    marginTop: 6,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 14,
  },
  playAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1db954',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 22,
    gap: 8,
  },
  playAllButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e0e0e0',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: '#888',
    textAlign: 'center',
  },
});
