import React, { useState, useCallback } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { LibraryScreen } from '../screens/LibraryScreen';
import { PlayerScreen } from '../screens/PlayerScreen';
import { QueueScreen } from '../screens/QueueScreen';
import { AlbumsScreen } from '../screens/AlbumsScreen';
import { PlaylistsScreen } from '../screens/PlaylistsScreen';
import { FavouritesScreen } from '../screens/FavouritesScreen';
import { usePlayer } from '../hooks/usePlayer';
import {
  LibraryIcon,
  VinylIcon,
  MenuIcon,
  PlayIcon,
  PauseIcon,
  SkipForwardIcon,
  MusicIcon,
} from '../components/Icons';

type TabRoute = 'library' | 'player' | 'queue';
type SubRoute =
  | { type: 'none' }
  | { type: 'albums' }
  | { type: 'playlists' }
  | { type: 'favourites' };

interface TabDefinition {
  readonly key: TabRoute;
  readonly label: string;
}

const Tabs: readonly TabDefinition[] = [
  { key: 'library', label: 'Library' },
  { key: 'player', label: 'Now Playing' },
  { key: 'queue', label: 'Queue' },
];

interface MiniPlayerBarProps {
  readonly onPress: () => void;
}

function MiniPlayerBar({ onPress }: MiniPlayerBarProps) {
  const { playerState, controls } = usePlayer();

  const handleToggle = useCallback(async () => {
    await controls.togglePlayback();
  }, [controls]);

  const handleNext = useCallback(async () => {
    await controls.next();
  }, [controls]);

  if (!playerState.hasTrack || !playerState.currentTrack) {
    return null;
  }

  const progressWidth = `${Math.min(
    100,
    playerState.progress * 100,
  )}%` as const;

  return (
    <TouchableOpacity
      style={styles.miniPlayer}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.miniPlayerProgress}>
        <View
          style={[styles.miniPlayerProgressFill, { width: progressWidth }]}
        />
      </View>

      <View style={styles.miniPlayerContent}>
        <View style={styles.miniPlayerArtwork}>
          <MusicIcon size={18} color="#4a4a6a" />
        </View>

        <View style={styles.miniPlayerInfo}>
          <Text
            style={styles.miniPlayerTitle}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {playerState.currentTrack.title}
          </Text>
          <Text
            style={styles.miniPlayerArtist}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {playerState.currentTrack.artist}
          </Text>
        </View>

        <View style={styles.miniPlayerActions}>
          <TouchableOpacity
            style={styles.miniPlayerButton}
            onPress={handleToggle}
            activeOpacity={0.6}
            hitSlop={MiniPlayerHitSlop}
          >
            {playerState.isPlaying ? (
              <PauseIcon size={20} color="#e0e0e0" />
            ) : (
              <PlayIcon size={20} color="#e0e0e0" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.miniPlayerButton}
            onPress={handleNext}
            activeOpacity={0.6}
            hitSlop={MiniPlayerHitSlop}
          >
            <SkipForwardIcon size={20} color="#e0e0e0" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

interface TabBarProps {
  readonly activeTab: TabRoute;
  readonly onTabPress: (tab: TabRoute) => void;
  readonly hasActiveTrack: boolean;
}

function TabBar({ activeTab, onTabPress, hasActiveTrack }: TabBarProps) {
  return (
    <View style={styles.tabBar}>
      {Tabs.map(tab => {
        const isActive = activeTab === tab.key;
        const showDot = tab.key === 'player' && hasActiveTrack && !isActive;
        const iconColor = isActive ? '#1db954' : '#666';

        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tabItem}
            onPress={() => onTabPress(tab.key)}
            activeOpacity={0.6}
          >
            <View style={styles.tabIconContainer}>
              {tab.key === 'library' && (
                <LibraryIcon size={22} color={iconColor} />
              )}
              {tab.key === 'player' && (
                <VinylIcon size={22} color={iconColor} />
              )}
              {tab.key === 'queue' && <MenuIcon size={22} color={iconColor} />}
              {showDot && <View style={styles.tabDot} />}
            </View>
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function AppNavigator() {
  const [activeTab, setActiveTab] = useState<TabRoute>('library');
  const [subRoute, setSubRoute] = useState<SubRoute>({ type: 'none' });
  const { playerState } = usePlayer();

  const navigateToTab = useCallback((tab: TabRoute) => {
    setActiveTab(tab);
    setSubRoute({ type: 'none' });
  }, []);

  const navigateToPlayer = useCallback(() => {
    setActiveTab('player');
    setSubRoute({ type: 'none' });
  }, []);

  const navigateToQueue = useCallback(() => {
    setActiveTab('queue');
    setSubRoute({ type: 'none' });
  }, []);

  const navigateToLibrary = useCallback(() => {
    setActiveTab('library');
    setSubRoute({ type: 'none' });
  }, []);

  const navigateToAlbums = useCallback(() => {
    setSubRoute({ type: 'albums' });
  }, []);

  const navigateToPlaylists = useCallback(() => {
    setSubRoute({ type: 'playlists' });
  }, []);

  const navigateToFavourites = useCallback(() => {
    setSubRoute({ type: 'favourites' });
  }, []);

  const navigateBackFromSub = useCallback(() => {
    setSubRoute({ type: 'none' });
  }, []);

  const renderScreen = useCallback(() => {
    if (activeTab === 'library' && subRoute.type !== 'none') {
      switch (subRoute.type) {
        case 'albums':
          return <AlbumsScreen onBack={navigateBackFromSub} />;
        case 'playlists':
          return <PlaylistsScreen onBack={navigateBackFromSub} />;
        case 'favourites':
          return <FavouritesScreen onBack={navigateBackFromSub} />;
      }
    }

    switch (activeTab) {
      case 'library':
        return (
          <LibraryScreen
            onNavigateAlbums={navigateToAlbums}
            onNavigatePlaylists={navigateToPlaylists}
            onNavigateFavourites={navigateToFavourites}
          />
        );
      case 'player':
        return (
          <PlayerScreen
            onOpenQueue={navigateToQueue}
            onOpenLibrary={navigateToLibrary}
          />
        );
      case 'queue':
        return <QueueScreen onBack={navigateToPlayer} />;
      default:
        return (
          <LibraryScreen
            onNavigateAlbums={navigateToAlbums}
            onNavigatePlaylists={navigateToPlaylists}
            onNavigateFavourites={navigateToFavourites}
          />
        );
    }
  }, [
    activeTab,
    subRoute,
    navigateToQueue,
    navigateToLibrary,
    navigateToPlayer,
    navigateToAlbums,
    navigateToPlaylists,
    navigateToFavourites,
    navigateBackFromSub,
  ]);

  const showMiniPlayer = activeTab !== 'player' && playerState.hasTrack;

  return (
    <View style={styles.container}>
      <View style={styles.screenContainer}>{renderScreen()}</View>

      {showMiniPlayer && <MiniPlayerBar onPress={navigateToPlayer} />}

      <TabBar
        activeTab={activeTab}
        onTabPress={navigateToTab}
        hasActiveTrack={playerState.hasTrack}
      />
    </View>
  );
}

const MiniPlayerHitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  screenContainer: {
    flex: 1,
  },
  miniPlayer: {
    backgroundColor: '#1a1a2e',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2a2a',
    overflow: 'hidden',
  },
  miniPlayerProgress: {
    height: 2,
    backgroundColor: '#333',
    width: '100%',
  },
  miniPlayerProgressFill: {
    height: '100%',
    backgroundColor: '#1db954',
  },
  miniPlayerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
  },
  miniPlayerArtwork: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#2a2a4a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniPlayerInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  miniPlayerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e0e0e0',
    marginBottom: 1,
  },
  miniPlayerArtist: {
    fontSize: 12,
    color: '#999',
  },
  miniPlayerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniPlayerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0a0a0a',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2a2a',
    paddingBottom: 6,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabIconContainer: {
    position: 'relative',
    marginBottom: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabDot: {
    position: 'absolute',
    top: -2,
    right: -6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1db954',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: '#1db954',
  },
});
