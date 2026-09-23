import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  ListRenderItemInfo,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { Track } from '../../domain/models/Track';
import { TrackItem, TrackItemHeight } from '../components/TrackItem';
import { usePlayer } from '../hooks/usePlayer';
import { useLibrary } from '../hooks/useLibrary';
import { useFavourites } from '../hooks/useFavourites';
import { useSuggestions } from '../hooks/useSuggestions';
import { useAppContext } from '../context/AppContext';
import {
  SearchIcon,
  CloseIcon,
  SortIcon,
  RefreshIcon,
  AlertIcon,
  MusicIcon,
  PlayIcon,
  ShuffleIcon,
  HeartFilledIcon,
  DiscIcon,
  PlaylistIcon,
  RepeatIcon,
} from '../components/Icons';

type SortOption = 'title' | 'artist' | 'album' | 'duration' | 'addedAt';
type SortDirection = 'asc' | 'desc';
type BrowseTab = 'all' | 'suggested' | 'favourites' | 'albums' | 'playlists';

interface SortState {
  readonly field: SortOption;
  readonly direction: SortDirection;
}

const SortLabels: Record<SortOption, string> = {
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  duration: 'Duration',
  addedAt: 'Date Added',
} as const;

const ItemHeight = TrackItemHeight;

// One shared collator: calling localeCompare per comparison is far slower on Hermes.
const Collator: { compare: (a: string, b: string) => number } =
  typeof Intl !== 'undefined' && typeof Intl.Collator === 'function'
    ? new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
    : { compare: (a, b) => a.localeCompare(b) };

function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

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

interface BrowseTabDef {
  readonly key: BrowseTab;
  readonly label: string;
}

const BrowseTabs: readonly BrowseTabDef[] = [
  { key: 'all', label: 'All Tracks' },
  { key: 'suggested', label: 'Suggested' },
  { key: 'favourites', label: 'Favourites' },
  { key: 'albums', label: 'Albums' },
  { key: 'playlists', label: 'Playlists' },
] as const;

interface LibraryScreenProps {
  readonly onNavigateAlbums?: () => void;
  readonly onNavigatePlaylists?: () => void;
  readonly onNavigateFavourites?: () => void;
  readonly onNavigateSuggested?: () => void;
}

export function LibraryScreen({
  onNavigateAlbums,
  onNavigatePlaylists,
  onNavigateFavourites,
  onNavigateSuggested,
}: LibraryScreenProps) {
  const { playerState } = usePlayer();
  const { controls: libraryControls, libraryState } = useLibrary();
  const { controls: favControls, favouriteState } = useFavourites();
  const { actions } = useAppContext();
  const suggestionCount = useSuggestions().length;
  const [searchQuery, setSearchQuery] = useState('');
  const [sortState, setSortState] = useState<SortState>({
    field: 'title',
    direction: 'asc',
  });
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<BrowseTab>('all');

  const filteredTracks = useMemo(() => {
    const trimmed = searchQuery.trim();
    const base =
      trimmed.length > 0
        ? libraryControls.searchTracks(trimmed)
        : libraryState.tracks;

    const sorted = [...base];
    sorted.sort((a, b) => {
      const aVal = a[sortState.field];
      const bVal = b[sortState.field];

      if (aVal == null && bVal == null) {
        return 0;
      }
      if (aVal == null) {
        return sortState.direction === 'asc' ? 1 : -1;
      }
      if (bVal == null) {
        return sortState.direction === 'asc' ? -1 : 1;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const result = Collator.compare(aVal, bVal);
        return sortState.direction === 'asc' ? result : -result;
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortState.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }

      return 0;
    });

    return sorted;
  }, [searchQuery, libraryState.tracks, sortState, libraryControls]);

  const handleTrackPress = useCallback(
    async (track: Track) => {
      await actions.playCollection(
        filteredTracks,
        filteredTracks.findIndex(t => t.id === track.id),
      );
    },
    [actions, filteredTracks],
  );

  const handleScan = useCallback(async () => {
    await libraryControls.scan();
  }, [libraryControls]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await libraryControls.scan();
    setIsRefreshing(false);
  }, [libraryControls]);

  const handleSortPress = useCallback((field: SortOption) => {
    setSortState(prev => {
      if (prev.field === field) {
        return { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { field, direction: 'asc' };
    });
    setShowSortMenu(false);
  }, []);

  const toggleSortMenu = useCallback(() => {
    setShowSortMenu(prev => !prev);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  const handlePlayAll = useCallback(async () => {
    if (filteredTracks.length === 0) {
      return;
    }
    await actions.playCollection(filteredTracks, 0);
  }, [actions, filteredTracks]);

  const handleShuffleAll = useCallback(async () => {
    if (filteredTracks.length === 0) {
      return;
    }
    await actions.playCollection(shuffled(filteredTracks), 0);
  }, [actions, filteredTracks]);

  const handleToggleFavourite = useCallback(
    async (track: Track) => {
      await favControls.toggle(track.id);
    },
    [favControls],
  );

  const handleTabPress = useCallback(
    (tab: BrowseTab) => {
      if (tab === 'albums' && onNavigateAlbums) {
        onNavigateAlbums();
        return;
      }
      if (tab === 'playlists' && onNavigatePlaylists) {
        onNavigatePlaylists();
        return;
      }
      if (tab === 'favourites' && onNavigateFavourites) {
        onNavigateFavourites();
        return;
      }
      if (tab === 'suggested' && onNavigateSuggested) {
        onNavigateSuggested();
        return;
      }
      setActiveTab(tab);
    },
    [onNavigateAlbums, onNavigatePlaylists, onNavigateFavourites, onNavigateSuggested],
  );

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
          isFavourite={favControls.isFavourite(item.id)}
          onToggleFavourite={handleToggleFavourite}
        />
      );
    },
    [
      playerState.currentTrack,
      playerState.isPlaying,
      handleTrackPress,
      favControls,
      handleToggleFavourite,
    ],
  );

  const renderBrowseTabs = useCallback(() => {
    return (
      <View style={styles.browseTabsWrapper}>
        <ScrollView
          horizontal={true}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.browseTabsContent}
        >
          {BrowseTabs.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.browseTab, isActive && styles.browseTabActive]}
                onPress={() => handleTabPress(tab.key)}
                activeOpacity={0.7}
              >
                <View style={styles.browseTabIcon}>
                  {tab.key === 'all' && (
                    <MusicIcon size={16} color={isActive ? '#fff' : '#aaa'} />
                  )}
                  {tab.key === 'suggested' && (
                    <RepeatIcon size={16} color={isActive ? '#fff' : '#e8a838'} />
                  )}
                  {tab.key === 'favourites' && (
                    <HeartFilledIcon
                      size={16}
                      color={isActive ? '#fff' : '#aaa'}
                    />
                  )}
                  {tab.key === 'albums' && (
                    <DiscIcon size={16} color={isActive ? '#fff' : '#aaa'} />
                  )}
                  {tab.key === 'playlists' && (
                    <PlaylistIcon
                      size={16}
                      color={isActive ? '#fff' : '#aaa'}
                    />
                  )}
                </View>
                <Text
                  style={[
                    styles.browseTabText,
                    isActive && styles.browseTabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
                {tab.key === 'suggested' && suggestionCount > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{suggestionCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  }, [activeTab, handleTabPress, suggestionCount]);

  const renderSortMenu = useCallback(() => {
    if (!showSortMenu) {
      return null;
    }

    const options: SortOption[] = [
      'title',
      'artist',
      'album',
      'duration',
      'addedAt',
    ];

    return (
      <View style={styles.sortMenu}>
        {options.map(option => {
          const isSelected = sortState.field === option;
          return (
            <TouchableOpacity
              key={option}
              style={[
                styles.sortMenuItem,
                isSelected && styles.sortMenuItemActive,
              ]}
              onPress={() => handleSortPress(option)}
              activeOpacity={0.6}
            >
              <Text
                style={[
                  styles.sortMenuItemText,
                  isSelected && styles.sortMenuItemTextActive,
                ]}
              >
                {SortLabels[option]}
              </Text>
              {isSelected && (
                <Text style={styles.sortDirectionIndicator}>
                  {sortState.direction === 'asc' ? '↑' : '↓'}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }, [showSortMenu, sortState, handleSortPress]);

  const renderScanProgress = useCallback(() => {
    if (!libraryState.isScanning) {
      return null;
    }

    const progressFraction =
      libraryState.scanProgress.total > 0
        ? libraryState.scanProgress.completed / libraryState.scanProgress.total
        : 0;

    return (
      <View style={styles.scanProgressContainer}>
        <View style={styles.scanProgressHeader}>
          <ActivityIndicator size="small" color="#1db954" />
          <Text style={styles.scanProgressText}>Scanning library...</Text>
        </View>
        <View style={styles.scanProgressBarTrack}>
          <View
            style={[
              styles.scanProgressBarFill,
              { width: `${Math.min(100, progressFraction * 100)}%` },
            ]}
          />
        </View>
        {libraryState.scanProgress.total > 0 && (
          <Text style={styles.scanProgressDetail}>
            {libraryState.scanProgress.completed} /{' '}
            {libraryState.scanProgress.total}
          </Text>
        )}
        {libraryState.scanProgress.currentFile.length > 0 && (
          <Text
            style={styles.scanCurrentFile}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {libraryState.scanProgress.currentFile}
          </Text>
        )}
      </View>
    );
  }, [libraryState.isScanning, libraryState.scanProgress]);

  const renderEmpty = useCallback(() => {
    if (libraryState.isLoading) {
      return (
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color="#1db954" />
          <Text style={styles.loadingText}>Loading library...</Text>
        </View>
      );
    }

    if (searchQuery.trim().length > 0) {
      return (
        <View style={styles.centeredContainer}>
          <SearchIcon size={56} color="#555" />
          <Text style={styles.emptyTitle}>No results</Text>
          <Text style={styles.emptySubtitle}>
            No tracks matching "{searchQuery.trim()}"
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
      <View style={styles.centeredContainer}>
        <MusicIcon size={56} color="#555" />
        <Text style={styles.emptyTitle}>Your library is empty</Text>
        <Text style={styles.emptySubtitle}>
          Scan your device's Music folder to discover tracks
        </Text>
        <TouchableOpacity
          style={styles.scanButton}
          onPress={handleScan}
          activeOpacity={0.7}
          disabled={libraryState.isScanning}
        >
          <Text style={styles.scanButtonText}>
            {libraryState.isScanning ? 'Scanning...' : 'Scan Library'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }, [
    libraryState.isLoading,
    libraryState.isScanning,
    searchQuery,
    handleScan,
    handleClearSearch,
  ]);

  const renderPlayActions = useCallback(() => {
    if (filteredTracks.length === 0) {
      return null;
    }

    return (
      <View style={styles.playActionsRow}>
        <TouchableOpacity
          style={styles.playAllButton}
          onPress={handlePlayAll}
          activeOpacity={0.7}
        >
          <PlayIcon size={16} color="#fff" />
          <Text style={styles.playAllButtonText}>Play All</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.shuffleAllButton}
          onPress={handleShuffleAll}
          activeOpacity={0.7}
        >
          <ShuffleIcon size={16} color="#1db954" />
          <Text style={styles.shuffleAllButtonText}>Shuffle</Text>
        </TouchableOpacity>
      </View>
    );
  }, [filteredTracks.length, handlePlayAll, handleShuffleAll]);

  const renderHeader = useCallback(() => {
    return (
      <View style={styles.listHeader}>
        {renderPlayActions()}
        <View style={styles.trackCountRow}>
          <Text style={styles.trackCountText}>
            {filteredTracks.length}{' '}
            {filteredTracks.length === 1 ? 'track' : 'tracks'}
            {searchQuery.trim().length > 0 ? ' found' : ''}
          </Text>
          {favouriteState.totalFavourites > 0 &&
            searchQuery.trim().length === 0 && (
              <View style={styles.favouriteCountBadge}>
                <HeartFilledIcon size={12} color="#e53935" />
                <Text style={styles.favouriteCountText}>
                  {favouriteState.totalFavourites}
                </Text>
              </View>
            )}
        </View>
      </View>
    );
  }, [
    filteredTracks.length,
    searchQuery,
    favouriteState.totalFavourites,
    renderPlayActions,
  ]);

  const renderError = useCallback(() => {
    if (!libraryState.error) {
      return null;
    }

    return (
      <View style={styles.errorBanner}>
        <AlertIcon size={16} color="#f0a0a0" />
        <Text style={styles.errorText} numberOfLines={2}>
          {libraryState.error}
        </Text>
      </View>
    );
  }, [libraryState.error]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Library</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerActionButton}
            onPress={toggleSortMenu}
            activeOpacity={0.6}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <SortIcon size={20} color="#e0e0e0" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerActionButton}
            onPress={handleScan}
            activeOpacity={0.6}
            disabled={libraryState.isScanning}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <RefreshIcon
              size={20}
              color={libraryState.isScanning ? '#555' : '#e0e0e0'}
            />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <SearchIcon size={16} color="#888" />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search tracks, artists, albums..."
            placeholderTextColor="#666"
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={handleClearSearch}
              style={styles.clearIcon}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <CloseIcon size={14} color="#888" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {renderBrowseTabs()}
      {renderSortMenu()}
      {renderError()}
      {renderScanProgress()}

      {filteredTracks.length === 0 ? (
        renderEmpty()
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
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#1db954"
              colors={['#1db954']}
              progressBackgroundColor="#1a1a1a"
            />
          }
        />
      )}
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#0a0a0a',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#e0e0e0',
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerActionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
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
    marginLeft: 8,
    padding: 4,
  },
  browseTabsWrapper: {
    backgroundColor: '#0a0a0a',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
  },
  browseTabsContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  browseTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    gap: 6,
  },
  browseTabActive: {
    backgroundColor: '#1db954',
  },
  browseTabIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  browseTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#aaa',
  },
  browseTabTextActive: {
    color: '#fff',
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: '#e8a838',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#121212',
  },
  sortMenu: {
    backgroundColor: '#1a1a1a',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    paddingVertical: 4,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  sortMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sortMenuItemActive: {
    backgroundColor: '#242424',
  },
  sortMenuItemText: {
    fontSize: 15,
    color: '#ccc',
  },
  sortMenuItemTextActive: {
    color: '#1db954',
    fontWeight: '600',
  },
  sortDirectionIndicator: {
    fontSize: 16,
    color: '#1db954',
    fontWeight: '700',
  },
  scanProgressContainer: {
    backgroundColor: '#1a1a2e',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 14,
  },
  scanProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  scanProgressText: {
    fontSize: 14,
    color: '#e0e0e0',
    marginLeft: 10,
    fontWeight: '500',
  },
  scanProgressBarTrack: {
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  scanProgressBarFill: {
    height: '100%',
    backgroundColor: '#1db954',
    borderRadius: 2,
  },
  scanProgressDetail: {
    fontSize: 12,
    color: '#888',
    fontVariant: ['tabular-nums'],
  },
  scanCurrentFile: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 80,
  },
  loadingText: {
    fontSize: 16,
    color: '#888',
    marginTop: 16,
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
  },
  scanButton: {
    backgroundColor: '#1db954',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 24,
    elevation: 3,
  },
  scanButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
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
  listHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
  },
  playActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  playAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1db954',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 22,
    gap: 8,
    elevation: 2,
    shadowColor: '#1db954',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  playAllButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  shuffleAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1db954',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 22,
    gap: 6,
  },
  shuffleAllButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1db954',
  },
  trackCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  trackCountText: {
    fontSize: 13,
    color: '#888',
  },
  favouriteCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#2e1a1a',
  },
  favouriteCountText: {
    fontSize: 12,
    color: '#e53935',
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2e1a1a',
    marginHorizontal: 16,
    marginVertical: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#e53935',
    gap: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#f0a0a0',
    lineHeight: 18,
  },
});
