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
  Modal,
  Alert,
} from 'react-native';
import { Track } from '../../domain/models/Track';
import { Playlist } from '../../domain/models/Playlist';
import { TrackItem } from '../components/TrackItem';
import { usePlayer } from '../hooks/usePlayer';
import { usePlaylists } from '../hooks/usePlaylists';
import { useFavourites } from '../hooks/useFavourites';
import { useAppContext } from '../context/AppContext';
import {
  BackIcon,
  PlaylistIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon,
  EditIcon,
  CloseIcon,
  CheckIcon,
  MusicIcon,
} from '../components/Icons';

interface PlaylistsScreenProps {
  readonly onBack?: () => void;
}

const PlaylistItemHeight = 72 as const;

function playlistKeyExtractor(item: Playlist): string {
  return item.id;
}

function trackKeyExtractor(item: Track): string {
  return item.id;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function PlaylistsScreen({ onBack }: PlaylistsScreenProps) {
  const { playerState } = usePlayer();
  const { controls: playlistControls, playlistState } = usePlaylists();
  const { controls: favControls } = useFavourites();
  const { state: appState, actions } = useAppContext();

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    null,
  );
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renamePlaylistId, setRenamePlaylistId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [showAddTrackModal, setShowAddTrackModal] = useState(false);
  const [addTrackSearch, setAddTrackSearch] = useState('');

  const selectedPlaylist = useMemo(() => {
    if (!selectedPlaylistId) {
      return null;
    }
    return playlistControls.getPlaylistById(selectedPlaylistId) ?? null;
  }, [selectedPlaylistId, playlistControls]);

  const selectedTracks = useMemo((): Track[] => {
    if (!selectedPlaylistId) {
      return [];
    }
    return playlistControls.getPlaylistTracks(selectedPlaylistId);
  }, [selectedPlaylistId, playlistControls]);

  const filteredLibraryTracks = useMemo((): Track[] => {
    const query = addTrackSearch.trim().toLowerCase();
    if (query.length === 0) {
      return appState.tracks;
    }
    return appState.tracks.filter(
      t =>
        t.title.toLowerCase().includes(query) ||
        t.artist.toLowerCase().includes(query) ||
        t.album.toLowerCase().includes(query),
    );
  }, [appState.tracks, addTrackSearch]);

  const handlePlaylistPress = useCallback((playlistId: string) => {
    setSelectedPlaylistId(playlistId);
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedPlaylistId(null);
  }, []);

  const handleBack = useCallback(() => {
    if (showAddTrackModal) {
      setShowAddTrackModal(false);
      setAddTrackSearch('');
      return;
    }
    if (selectedPlaylistId) {
      setSelectedPlaylistId(null);
      return;
    }
    onBack?.();
  }, [selectedPlaylistId, showAddTrackModal, onBack]);

  const handleTrackPress = useCallback(
    async (track: Track) => {
      if (!selectedPlaylistId) {
        return;
      }
      const tracks = playlistControls.getPlaylistTracks(selectedPlaylistId);
      const startIndex = tracks.findIndex(t => t.id === track.id);
      await actions.playCollection(tracks, Math.max(0, startIndex));
    },
    [selectedPlaylistId, playlistControls, actions],
  );

  const handlePlayAll = useCallback(async () => {
    if (!selectedPlaylistId) {
      return;
    }
    await playlistControls.playPlaylist(selectedPlaylistId, 0);
  }, [selectedPlaylistId, playlistControls]);

  const handleToggleFavourite = useCallback(
    async (track: Track) => {
      await favControls.toggle(track.id);
    },
    [favControls],
  );

  const handleOpenCreate = useCallback(() => {
    setInputValue('');
    setShowCreateModal(true);
  }, []);

  const handleCreate = useCallback(async () => {
    const name = inputValue.trim();
    if (name.length === 0) {
      return;
    }
    await playlistControls.create(name);
    setShowCreateModal(false);
    setInputValue('');
  }, [inputValue, playlistControls]);

  const handleOpenRename = useCallback(
    (playlistId: string) => {
      const playlist = playlistState.playlists.find(p => p.id === playlistId);
      setRenamePlaylistId(playlistId);
      setInputValue(playlist?.name ?? '');
      setShowRenameModal(true);
    },
    [playlistState.playlists],
  );

  const handleRename = useCallback(async () => {
    const name = inputValue.trim();
    if (name.length === 0 || !renamePlaylistId) {
      return;
    }
    await playlistControls.rename(renamePlaylistId, name);
    setShowRenameModal(false);
    setRenamePlaylistId(null);
    setInputValue('');
  }, [inputValue, renamePlaylistId, playlistControls]);

  const handleDelete = useCallback(
    (playlistId: string) => {
      const playlist = playlistState.playlists.find(p => p.id === playlistId);
      Alert.alert(
        'Delete Playlist',
        `Are you sure you want to delete "${
          playlist?.name ?? 'this playlist'
        }"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              await playlistControls.remove(playlistId);
              if (selectedPlaylistId === playlistId) {
                setSelectedPlaylistId(null);
              }
            },
          },
        ],
      );
    },
    [playlistState.playlists, playlistControls, selectedPlaylistId],
  );

  const handleOpenAddTrack = useCallback(() => {
    setAddTrackSearch('');
    setShowAddTrackModal(true);
  }, []);

  const handleAddTrack = useCallback(
    async (track: Track) => {
      if (!selectedPlaylistId) {
        return;
      }
      await playlistControls.addTrack(selectedPlaylistId, track.id);
    },
    [selectedPlaylistId, playlistControls],
  );

  const handleRemoveTrack = useCallback(
    async (track: Track) => {
      if (!selectedPlaylistId) {
        return;
      }
      await playlistControls.removeTrack(selectedPlaylistId, track.id);
    },
    [selectedPlaylistId, playlistControls],
  );

  const isTrackInPlaylist = useCallback(
    (trackId: string): boolean => {
      if (!selectedPlaylist) {
        return false;
      }
      return selectedPlaylist.trackIds.includes(trackId);
    },
    [selectedPlaylist],
  );

  const renderPlaylistItem = useCallback(
    ({ item }: ListRenderItemInfo<Playlist>) => {
      return (
        <TouchableOpacity
          style={styles.playlistItem}
          onPress={() => handlePlaylistPress(item.id)}
          activeOpacity={0.7}
        >
          <View style={styles.playlistArtwork}>
            <PlaylistIcon size={28} color="#4a4a6a" />
          </View>
          <View style={styles.playlistInfo}>
            <Text
              style={styles.playlistName}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {item.name}
            </Text>
            <Text
              style={styles.playlistMeta}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {item.trackIds.length}{' '}
              {item.trackIds.length === 1 ? 'track' : 'tracks'} •{' '}
              {formatDate(item.updatedAt)}
            </Text>
          </View>
          <View style={styles.playlistActions}>
            <TouchableOpacity
              style={styles.playlistActionButton}
              onPress={() => handleOpenRename(item.id)}
              activeOpacity={0.6}
              hitSlop={hitSlop}
            >
              <EditIcon size={18} color="#666" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.playlistActionButton}
              onPress={() => handleDelete(item.id)}
              activeOpacity={0.6}
              hitSlop={hitSlop}
            >
              <TrashIcon size={18} color="#666" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      );
    },
    [handlePlaylistPress, handleOpenRename, handleDelete],
  );

  const renderPlaylistListEmpty = useCallback(() => {
    return (
      <View style={styles.emptyContainer}>
        <PlaylistIcon size={56} color="#555" />
        <Text style={styles.emptyTitle}>No Playlists</Text>
        <Text style={styles.emptySubtitle}>
          Create a playlist to organize your music
        </Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={handleOpenCreate}
          activeOpacity={0.7}
        >
          <PlusIcon size={18} color="#fff" />
          <Text style={styles.createButtonText}>Create Playlist</Text>
        </TouchableOpacity>
      </View>
    );
  }, [handleOpenCreate]);

  const renderDetailHeader = useCallback(() => {
    if (!selectedPlaylist) {
      return null;
    }

    return (
      <View style={styles.detailHeader}>
        <View style={styles.detailArtwork}>
          <PlaylistIcon size={48} color="#4a4a6a" />
        </View>
        <Text style={styles.detailName} numberOfLines={2}>
          {selectedPlaylist.name}
        </Text>
        <Text style={styles.detailMeta}>
          {selectedPlaylist.trackIds.length}{' '}
          {selectedPlaylist.trackIds.length === 1 ? 'track' : 'tracks'}
        </Text>
        <View style={styles.detailActions}>
          {selectedTracks.length > 0 && (
            <TouchableOpacity
              style={styles.playAllButton}
              onPress={handlePlayAll}
              activeOpacity={0.7}
            >
              <PlayIcon size={18} color="#fff" />
              <Text style={styles.playAllButtonText}>Play All</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.addTrackButton}
            onPress={handleOpenAddTrack}
            activeOpacity={0.7}
          >
            <PlusIcon size={18} color="#1db954" />
            <Text style={styles.addTrackButtonText}>Add Tracks</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [
    selectedPlaylist,
    selectedTracks.length,
    handlePlayAll,
    handleOpenAddTrack,
  ]);

  const renderDetailTrackItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Track>) => {
      const isActive =
        playerState.currentTrack !== null &&
        playerState.currentTrack.id === item.id;
      return (
        <View style={styles.detailTrackRow}>
          <View style={styles.detailTrackContent}>
            <TrackItem
              track={item}
              isActive={isActive}
              isPlaying={isActive && playerState.isPlaying}
              onPress={handleTrackPress}
              index={index}
              isFavourite={favControls.isFavourite(item.id)}
              onToggleFavourite={handleToggleFavourite}
              showActions={true}
            />
          </View>
          <TouchableOpacity
            style={styles.removeTrackButton}
            onPress={() => handleRemoveTrack(item)}
            activeOpacity={0.6}
            hitSlop={hitSlop}
          >
            <CloseIcon size={16} color="#666" />
          </TouchableOpacity>
        </View>
      );
    },
    [
      playerState.currentTrack,
      playerState.isPlaying,
      handleTrackPress,
      favControls,
      handleToggleFavourite,
      handleRemoveTrack,
    ],
  );

  const renderAddTrackItem = useCallback(
    ({ item, index: _index }: ListRenderItemInfo<Track>) => {
      const alreadyAdded = isTrackInPlaylist(item.id);
      return (
        <TouchableOpacity
          style={[
            styles.addTrackItem,
            alreadyAdded && styles.addTrackItemAdded,
          ]}
          onPress={() => !alreadyAdded && handleAddTrack(item)}
          activeOpacity={alreadyAdded ? 1 : 0.7}
        >
          <View style={styles.addTrackInfo}>
            <Text
              style={[
                styles.addTrackTitle,
                alreadyAdded && styles.addTrackTitleAdded,
              ]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {item.title}
            </Text>
            <Text
              style={styles.addTrackArtist}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {item.artist}
            </Text>
          </View>
          {alreadyAdded ? (
            <CheckIcon size={20} color="#1db954" />
          ) : (
            <PlusIcon size={20} color="#1db954" />
          )}
        </TouchableOpacity>
      );
    },
    [isTrackInPlaylist, handleAddTrack],
  );

  const renderDetailEmpty = useCallback(() => {
    return (
      <View style={styles.detailEmptyContainer}>
        <MusicIcon size={48} color="#555" />
        <Text style={styles.detailEmptyText}>No tracks in this playlist</Text>
        <TouchableOpacity
          style={styles.addTrackButton}
          onPress={handleOpenAddTrack}
          activeOpacity={0.7}
        >
          <PlusIcon size={18} color="#1db954" />
          <Text style={styles.addTrackButtonText}>Add Tracks</Text>
        </TouchableOpacity>
      </View>
    );
  }, [handleOpenAddTrack]);

  const renderInputModal = useCallback(
    (
      visible: boolean,
      title: string,
      placeholder: string,
      onSubmit: () => void,
      onClose: () => void,
    ) => {
      return (
        <Modal
          visible={visible}
          transparent={true}
          animationType="fade"
          onRequestClose={onClose}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{title}</Text>
              <TextInput
                style={styles.modalInput}
                value={inputValue}
                onChangeText={setInputValue}
                placeholder={placeholder}
                placeholderTextColor="#666"
                autoFocus={true}
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={onSubmit}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={onClose}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalSubmitButton,
                    inputValue.trim().length === 0 &&
                      styles.modalSubmitButtonDisabled,
                  ]}
                  onPress={onSubmit}
                  activeOpacity={0.7}
                  disabled={inputValue.trim().length === 0}
                >
                  <Text style={styles.modalSubmitText}>
                    {title === 'Rename Playlist' ? 'Rename' : 'Create'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      );
    },
    [inputValue],
  );

  if (showAddTrackModal && selectedPlaylistId) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              setShowAddTrackModal(false);
              setAddTrackSearch('');
            }}
            activeOpacity={0.6}
            hitSlop={hitSlop}
          >
            <BackIcon size={28} color="#e0e0e0" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Tracks</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            value={addTrackSearch}
            onChangeText={setAddTrackSearch}
            placeholder="Search tracks..."
            placeholderTextColor="#666"
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
        </View>

        <FlatList<Track>
          data={filteredLibraryTracks}
          keyExtractor={trackKeyExtractor}
          renderItem={renderAddTrackItem}
          showsVerticalScrollIndicator={true}
          initialNumToRender={20}
          maxToRenderPerBatch={15}
          windowSize={7}
        />
      </View>
    );
  }

  if (selectedPlaylistId && selectedPlaylist) {
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
            {selectedPlaylist.name}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {selectedTracks.length === 0 ? (
          <>
            {renderDetailHeader()}
            {renderDetailEmpty()}
          </>
        ) : (
          <FlatList<Track>
            data={selectedTracks}
            keyExtractor={trackKeyExtractor}
            renderItem={renderDetailTrackItem}
            ListHeaderComponent={renderDetailHeader}
            showsVerticalScrollIndicator={true}
            initialNumToRender={20}
            maxToRenderPerBatch={15}
            windowSize={7}
          />
        )}

        {renderInputModal(
          showRenameModal,
          'Rename Playlist',
          'Playlist name',
          handleRename,
          () => {
            setShowRenameModal(false);
            setRenamePlaylistId(null);
          },
        )}
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
        <Text style={styles.headerTitle}>Playlists</Text>
        <TouchableOpacity
          style={styles.createIconButton}
          onPress={handleOpenCreate}
          activeOpacity={0.6}
          hitSlop={hitSlop}
        >
          <PlusIcon size={22} color="#1db954" />
        </TouchableOpacity>
      </View>

      <View style={styles.countBar}>
        <Text style={styles.countText}>
          {playlistState.totalPlaylists}{' '}
          {playlistState.totalPlaylists === 1 ? 'playlist' : 'playlists'}
        </Text>
      </View>

      {playlistState.isEmpty ? (
        renderPlaylistListEmpty()
      ) : (
        <FlatList<Playlist>
          data={playlistState.playlists}
          keyExtractor={playlistKeyExtractor}
          renderItem={renderPlaylistItem}
          showsVerticalScrollIndicator={true}
          initialNumToRender={20}
          maxToRenderPerBatch={15}
          windowSize={7}
          getItemLayout={(_data, index) => ({
            length: PlaylistItemHeight,
            offset: PlaylistItemHeight * index,
            index,
          })}
        />
      )}

      {renderInputModal(
        showCreateModal,
        'Create Playlist',
        'Playlist name',
        handleCreate,
        () => setShowCreateModal(false),
      )}

      {renderInputModal(
        showRenameModal,
        'Rename Playlist',
        'Playlist name',
        handleRename,
        () => {
          setShowRenameModal(false);
          setRenamePlaylistId(null);
        },
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
  createIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
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
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#121212',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
    height: PlaylistItemHeight,
  },
  playlistArtwork: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  playlistInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  playlistName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e0e0e0',
    marginBottom: 3,
  },
  playlistMeta: {
    fontSize: 13,
    color: '#888',
  },
  playlistActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  playlistActionButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1db954',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 8,
    elevation: 3,
  },
  createButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
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
  detailName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#e0e0e0',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  detailMeta: {
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
  addTrackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1db954',
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 24,
    gap: 6,
  },
  addTrackButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1db954',
  },
  detailTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailTrackContent: {
    flex: 1,
  },
  removeTrackButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  detailEmptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
    gap: 12,
  },
  detailEmptyText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0a0a0a',
  },
  searchInput: {
    backgroundColor: '#1e1e1e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#e0e0e0',
  },
  addTrackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#121212',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
  },
  addTrackItemAdded: {
    backgroundColor: '#1a1a2e',
  },
  addTrackInfo: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 12,
  },
  addTrackTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#e0e0e0',
    marginBottom: 2,
  },
  addTrackTitleAdded: {
    color: '#1db954',
  },
  addTrackArtist: {
    fontSize: 13,
    color: '#888',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#1e1e1e',
    borderRadius: 16,
    padding: 24,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#e0e0e0',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#e0e0e0',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#444',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e0e0e0',
  },
  modalSubmitButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#1db954',
  },
  modalSubmitButtonDisabled: {
    backgroundColor: '#333',
  },
  modalSubmitText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
