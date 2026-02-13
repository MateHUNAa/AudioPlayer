import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ListRenderItemInfo,
  TextInput,
} from 'react-native';
import { Track } from '../../domain/models/Track';
import { TrackItem } from '../components/TrackItem';
import { usePlayer } from '../hooks/usePlayer';
import { useFavourites } from '../hooks/useFavourites';
import { useAppContext } from '../context/AppContext';
import {
  BackIcon,
  HeartFilledIcon,
  PlayIcon,
  ShuffleIcon,
  SearchIcon,
  CloseIcon,
} from '../components/Icons';

interface FavouritesScreenProps {
  readonly onBack?: () => void;
}

const ItemHeight = 64 as const;

function keyExtractor(item: Track): string {
  return item.id;
}

function getItemLayout(
  _data: ArrayLike<Track> | null | undefined,
  index: number,
) {
  return {
    length: ItemHeight,
    offset: ItemHeight * index,
    index,
  };
}

export function FavouritesScreen({ onBack }: FavouritesScreenProps) {
  const { playerState } = usePlayer();
  const { controls: favControls, favouriteState } = useFavourites();
  const { actions } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTracks = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (trimmed.length === 0) {
      return favouriteState.favouriteTracks;
    }
    return favouriteState.favouriteTracks.filter(
      t =>
        t.title.toLowerCase().includes(trimmed) ||
        t.artist.toLowerCase().includes(trimmed) ||
        t.album.toLowerCase().includes(trimmed),
    );
  }, [favouriteState.favouriteTracks, searchQuery]);

  const handleBack = useCallback(() => {
    onBack?.();
  }, [onBack]);

  const handleTrackPress = useCallback(
    async (track: Track) => {
      const startIndex = favouriteState.favouriteTracks.findIndex(
        t => t.id === track.id,
      );
      await actions.playCollection(
        favouriteState.favouriteTracks,
        Math.max(0, startIndex),
      );
    },
    [favouriteState.favouriteTracks, actions],
  );

  const handlePlayAll = useCallback(async () => {
    if (favouriteState.favouriteTracks.length === 0) {
      return;
    }
    await actions.playCollection(favouriteState.favouriteTracks, 0);
  }, [favouriteState.favouriteTracks, actions]);

  const handleShuffleAll = useCallback(async () => {
    if (favouriteState.favouriteTracks.length === 0) {
      return;
    }
    const shuffled = [...favouriteState.favouriteTracks].sort(
      () => Math.random() - 0.5,
    );
    await actions.playCollection(shuffled, 0);
  }, [favouriteState.favouriteTracks, actions]);

  const handleToggleFavourite = useCallback(
    async (track: Track) => {
      await favControls.toggle(track.id);
    },
    [favControls],
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Track>) => {
      const isActive =
        playerState.currentTrack !== null &&
        playerState.currentTrack.id === item.id;

      return (
        <TrackItem
          track={item}
          isActive={isActive}
          isPlaying={isActive && playerState.isPlaying}
          onPress={handleTrackPress}
          index={index}
          isFavourite={true}
          onToggleFavourite={handleToggleFavourite}
        />
      );
    },
    [
      playerState.currentTrack,
      playerState.isPlaying,
      handleTrackPress,
      handleToggleFavourite,
    ],
  );

  const renderHeader = useCallback(() => {
    return (
      <View style={styles.listHeader}>
        <View style={styles.listHeaderTop}>
          <View style={styles.heroArtwork}>
            <HeartFilledIcon size={48} color="#e53935" />
          </View>
          <Text style={styles.heroTitle}>Favourites</Text>
          <Text style={styles.heroSubtitle}>
            {favouriteState.totalFavourites}{' '}
            {favouriteState.totalFavourites === 1 ? 'track' : 'tracks'}
          </Text>
        </View>

        {favouriteState.totalFavourites > 0 && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.playAllButton}
              onPress={handlePlayAll}
              activeOpacity={0.7}
            >
              <PlayIcon size={18} color="#fff" />
              <Text style={styles.playAllButtonText}>Play All</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shuffleButton}
              onPress={handleShuffleAll}
              activeOpacity={0.7}
            >
              <ShuffleIcon size={18} color="#1db954" />
              <Text style={styles.shuffleButtonText}>Shuffle</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.trackCountBar}>
          <Text style={styles.trackCountText}>
            {filteredTracks.length}{' '}
            {filteredTracks.length === 1 ? 'track' : 'tracks'}
            {searchQuery.trim().length > 0 ? ' found' : ''}
          </Text>
        </View>
      </View>
    );
  }, [
    favouriteState.totalFavourites,
    filteredTracks.length,
    searchQuery,
    handlePlayAll,
    handleShuffleAll,
  ]);

  const renderEmpty = useCallback(() => {
    if (searchQuery.trim().length > 0) {
      return (
        <View style={styles.emptyContainer}>
          <SearchIcon size={48} color="#555" />
          <Text style={styles.emptyTitle}>No results</Text>
          <Text style={styles.emptySubtitle}>
            No favourites matching "{searchQuery.trim()}"
          </Text>
          <TouchableOpacity
            style={styles.clearSearchButton}
            onPress={handleClearSearch}
            activeOpacity={0.6}
          >
            <Text style={styles.clearSearchButtonText}>Clear Search</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <HeartFilledIcon size={56} color="#444" />
        <Text style={styles.emptyTitle}>No Favourites Yet</Text>
        <Text style={styles.emptySubtitle}>
          Tap the heart icon on any track to add it to your favourites
        </Text>
      </View>
    );
  }, [searchQuery, handleClearSearch]);

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
        <Text style={styles.headerTitle}>Favourites</Text>
        <View style={styles.headerSpacer} />
      </View>

      {favouriteState.totalFavourites > 3 && (
        <View style={styles.searchContainer}>
          <View style={styles.searchInputWrapper}>
            <SearchIcon size={16} color="#666" />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search favourites..."
              placeholderTextColor="#666"
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={handleClearSearch}
                style={styles.clearIcon}
                hitSlop={hitSlop}
              >
                <CloseIcon size={14} color="#888" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {filteredTracks.length === 0 && favouriteState.isEmpty ? (
        renderEmpty()
      ) : filteredTracks.length === 0 ? (
        <>
          {renderHeader()}
          {renderEmpty()}
        </>
      ) : (
        <FlatList<Track>
          data={filteredTracks}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader}
          showsVerticalScrollIndicator={true}
          initialNumToRender={20}
          maxToRenderPerBatch={15}
          windowSize={7}
          removeClippedSubviews={true}
          getItemLayout={getItemLayout}
        />
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
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#0a0a0a',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#e0e0e0',
    flex: 1,
    textAlign: 'center',
    letterSpacing: -0.3,
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
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0a0a0a',
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#e0e0e0',
    paddingVertical: 0,
  },
  clearIcon: {
    padding: 4,
  },
  listHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
  },
  listHeaderTop: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  heroArtwork: {
    width: 100,
    height: 100,
    borderRadius: 16,
    backgroundColor: '#2e1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#e0e0e0',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#888',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 20,
    paddingHorizontal: 24,
  },
  playAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1db954',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 8,
    elevation: 3,
  },
  playAllButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  shuffleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1db954',
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 24,
    gap: 6,
  },
  shuffleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1db954',
  },
  trackCountBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  trackCountText: {
    fontSize: 13,
    color: '#888',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 80,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#e0e0e0',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    maxWidth: 280,
  },
  clearSearchButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#444',
  },
  clearSearchButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e0e0e0',
  },
});
