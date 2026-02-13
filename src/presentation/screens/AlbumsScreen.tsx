import React, { useCallback, useMemo, useState } from 'react';
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
import { TrackItem } from '../components/TrackItem';
import { usePlayer } from '../hooks/usePlayer';
import { useLibrary } from '../hooks/useLibrary';
import { useFavourites } from '../hooks/useFavourites';
import { useAppContext } from '../context/AppContext';
import { BackIcon, DiscIcon, PlayIcon } from '../components/Icons';

interface AlbumEntry {
  readonly name: string;
  readonly artist: string;
  readonly trackCount: number;
  readonly totalDuration: number;
}

interface AlbumsScreenProps {
  readonly onBack?: () => void;
}

const AlbumItemHeight = 72 as const;

function formatTotalDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) {
    return '0 min';
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours} hr ${mins} min`;
  }
  return `${mins} min`;
}

function albumKeyExtractor(item: AlbumEntry): string {
  return item.name;
}

function trackKeyExtractor(item: Track): string {
  return item.id;
}

export function AlbumsScreen({ onBack }: AlbumsScreenProps) {
  const { controls: playerControls, playerState } = usePlayer();
  const { controls: libraryControls, libraryState } = useLibrary();
  const { controls: favControls } = useFavourites();
  const { actions } = useAppContext();
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);

  const albums = useMemo((): AlbumEntry[] => {
    const albumMap = new Map<
      string,
      { artist: string; count: number; duration: number }
    >();

    for (const track of libraryState.tracks) {
      const existing = albumMap.get(track.album);
      if (existing) {
        existing.count += 1;
        existing.duration += track.duration;
      } else {
        albumMap.set(track.album, {
          artist: track.artist,
          count: 1,
          duration: track.duration,
        });
      }
    }

    const entries: AlbumEntry[] = [];
    for (const [name, data] of albumMap) {
      entries.push({
        name,
        artist: data.artist,
        trackCount: data.count,
        totalDuration: data.duration,
      });
    }

    entries.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
    return entries;
  }, [libraryState.tracks]);

  const albumTracks = useMemo((): Track[] => {
    if (!selectedAlbum) {
      return [];
    }
    return libraryControls.getTracksByAlbum(selectedAlbum);
  }, [selectedAlbum, libraryControls]);

  const handleAlbumPress = useCallback((albumName: string) => {
    setSelectedAlbum(albumName);
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedAlbum(null);
  }, []);

  const handleBack = useCallback(() => {
    if (selectedAlbum) {
      setSelectedAlbum(null);
      return;
    }
    onBack?.();
  }, [selectedAlbum, onBack]);

  const handleTrackPress = useCallback(
    async (track: Track) => {
      await playerControls.play(track);
    },
    [playerControls],
  );

  const handlePlayAll = useCallback(async () => {
    if (albumTracks.length === 0) {
      return;
    }
    await actions.playCollection(albumTracks, 0);
  }, [albumTracks, actions]);

  const handleToggleFavourite = useCallback(
    async (track: Track) => {
      await favControls.toggle(track.id);
    },
    [favControls],
  );

  const renderAlbumItem = useCallback(
    ({ item }: ListRenderItemInfo<AlbumEntry>) => {
      return (
        <TouchableOpacity
          style={styles.albumItem}
          onPress={() => handleAlbumPress(item.name)}
          activeOpacity={0.7}
        >
          <View style={styles.albumArtwork}>
            <DiscIcon size={28} color="#4a4a6a" />
          </View>
          <View style={styles.albumInfo}>
            <Text
              style={styles.albumName}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {item.name}
            </Text>
            <Text
              style={styles.albumMeta}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {item.artist} • {item.trackCount}{' '}
              {item.trackCount === 1 ? 'track' : 'tracks'} •{' '}
              {formatTotalDuration(item.totalDuration)}
            </Text>
          </View>
        </TouchableOpacity>
      );
    },
    [handleAlbumPress],
  );

  const renderTrackItem = useCallback(
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

  const renderAlbumListEmpty = useCallback(() => {
    return (
      <View style={styles.emptyContainer}>
        <DiscIcon size={56} color="#555" />
        <Text style={styles.emptyTitle}>No Albums</Text>
        <Text style={styles.emptySubtitle}>
          Scan your library to discover albums
        </Text>
      </View>
    );
  }, []);

  const renderDetailHeader = useCallback(() => {
    if (!selectedAlbum) {
      return null;
    }

    const albumEntry = albums.find(a => a.name === selectedAlbum);
    return (
      <View style={styles.detailHeader}>
        <View style={styles.detailArtwork}>
          <DiscIcon size={48} color="#4a4a6a" />
        </View>
        <Text style={styles.detailAlbumName} numberOfLines={2}>
          {selectedAlbum}
        </Text>
        {albumEntry && (
          <Text style={styles.detailAlbumMeta}>
            {albumEntry.artist} • {albumEntry.trackCount}{' '}
            {albumEntry.trackCount === 1 ? 'track' : 'tracks'}
          </Text>
        )}
        <View style={styles.detailActions}>
          <TouchableOpacity
            style={styles.playAllButton}
            onPress={handlePlayAll}
            activeOpacity={0.7}
          >
            <PlayIcon size={18} color="#fff" />
            <Text style={styles.playAllButtonText}>Play All</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [selectedAlbum, albums, handlePlayAll]);

  if (selectedAlbum) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBackToList}
            activeOpacity={0.6}
            hitSlop={hitSlop}
          >
            <BackIcon size={28} color="#e0e0e0" />
          </TouchableOpacity>
          <Text
            style={styles.headerTitle}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {selectedAlbum}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <FlatList<Track>
          data={albumTracks}
          keyExtractor={trackKeyExtractor}
          renderItem={renderTrackItem}
          ListHeaderComponent={renderDetailHeader}
          showsVerticalScrollIndicator={true}
          initialNumToRender={20}
          maxToRenderPerBatch={15}
          windowSize={7}
        />
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
        <Text style={styles.headerTitle}>Albums</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.countBar}>
        <Text style={styles.countText}>
          {albums.length} {albums.length === 1 ? 'album' : 'albums'}
        </Text>
      </View>

      {albums.length === 0 ? (
        renderAlbumListEmpty()
      ) : (
        <FlatList<AlbumEntry>
          data={albums}
          keyExtractor={albumKeyExtractor}
          renderItem={renderAlbumItem}
          showsVerticalScrollIndicator={true}
          initialNumToRender={20}
          maxToRenderPerBatch={15}
          windowSize={7}
          getItemLayout={(_data, index) => ({
            length: AlbumItemHeight,
            offset: AlbumItemHeight * index,
            index,
          })}
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
  countBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
    backgroundColor: '#0e0e0e',
  },
  countText: {
    fontSize: 13,
    color: '#888',
  },
  albumItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#121212',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
    height: AlbumItemHeight,
  },
  albumArtwork: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  albumInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  albumName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e0e0e0',
    marginBottom: 3,
  },
  albumMeta: {
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
  },
  detailHeader: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
  },
  detailArtwork: {
    width: 120,
    height: 120,
    borderRadius: 12,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  detailAlbumName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#e0e0e0',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  detailAlbumMeta: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 16,
  },
  detailActions: {
    flexDirection: 'row',
    gap: 12,
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
});
