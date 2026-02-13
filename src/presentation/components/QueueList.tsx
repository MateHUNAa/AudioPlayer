import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ListRenderItemInfo,
  TouchableOpacity,
} from 'react-native';
import { Track } from '../../domain/models/Track';
import { TrackItem } from './TrackItem';
import { usePlayer } from '../hooks/usePlayer';
import { MusicIcon } from './Icons';

interface QueueListProps {
  readonly maxVisible?: number;
  readonly showHeader?: boolean;
  readonly headerTitle?: string;
  readonly onTrackPress?: (track: Track) => void;
  readonly emptyMessage?: string;
  readonly showClearButton?: boolean;
  readonly onClearQueue?: () => void;
}

interface QueueTrackItem {
  readonly track: Track;
  readonly queueIndex: number;
}

function keyExtractor(item: QueueTrackItem): string {
  return `${item.track.id}_${item.queueIndex}`;
}

function QueueListComponent({
  maxVisible,
  showHeader = true,
  headerTitle = 'Up Next',
  onTrackPress,
  emptyMessage = 'No tracks in queue',
  showClearButton = false,
  onClearQueue,
}: QueueListProps) {
  const { controls, playerState } = usePlayer();

  const upcoming = playerState.upcoming;
  const currentTrack = playerState.currentTrack;

  const displayItems: QueueTrackItem[] = React.useMemo(() => {
    const items: QueueTrackItem[] = [];
    const limit =
      maxVisible != null
        ? Math.min(maxVisible, upcoming.length)
        : upcoming.length;

    for (let i = 0; i < limit; i++) {
      items.push({
        track: upcoming[i],
        queueIndex: playerState.queueIndex + 1 + i,
      });
    }

    return items;
  }, [upcoming, maxVisible, playerState.queueIndex]);

  const remainingCount =
    maxVisible != null ? Math.max(0, upcoming.length - maxVisible) : 0;

  const handleTrackPress = useCallback(
    (track: Track) => {
      if (onTrackPress) {
        onTrackPress(track);
        return;
      }
      controls.playInQueue(track);
    },
    [onTrackPress, controls],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<QueueTrackItem>) => {
      const isActive =
        currentTrack !== null && currentTrack.id === item.track.id;

      return (
        <TrackItem
          track={item.track}
          isActive={isActive}
          isPlaying={isActive && playerState.isPlaying}
          onPress={handleTrackPress}
          index={item.queueIndex}
        />
      );
    },
    [currentTrack, playerState.isPlaying, handleTrackPress],
  );

  const renderHeader = useCallback(() => {
    if (!showHeader) {
      return null;
    }

    return (
      <View style={styles.headerContainer}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <Text style={styles.headerCount}>
            {upcoming.length} {upcoming.length === 1 ? 'track' : 'tracks'}
          </Text>
        </View>
        {showClearButton && onClearQueue && upcoming.length > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={onClearQueue}
            activeOpacity={0.6}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [showHeader, headerTitle, upcoming.length, showClearButton, onClearQueue]);

  const renderNowPlaying = useCallback(() => {
    if (!currentTrack) {
      return null;
    }

    return (
      <View style={styles.nowPlayingContainer}>
        <Text style={styles.nowPlayingLabel}>Now Playing</Text>
        <TrackItem
          track={currentTrack}
          isActive={true}
          isPlaying={playerState.isPlaying}
          onPress={handleTrackPress}
          index={playerState.queueIndex}
        />
      </View>
    );
  }, [
    currentTrack,
    playerState.isPlaying,
    playerState.queueIndex,
    handleTrackPress,
  ]);

  const renderEmpty = useCallback(() => {
    return (
      <View style={styles.emptyContainer}>
        <MusicIcon size={48} color="#555" />
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }, [emptyMessage]);

  const renderFooter = useCallback(() => {
    if (remainingCount <= 0) {
      return null;
    }

    return (
      <View style={styles.footerContainer}>
        <Text style={styles.footerText}>
          +{remainingCount} more {remainingCount === 1 ? 'track' : 'tracks'}
        </Text>
      </View>
    );
  }, [remainingCount]);

  const renderSeparator = useCallback(() => {
    return <View style={styles.separator} />;
  }, []);

  return (
    <View style={styles.container}>
      {renderNowPlaying()}
      {renderHeader()}
      {displayItems.length === 0 ? (
        renderEmpty()
      ) : (
        <FlatList<QueueTrackItem>
          data={displayItems}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ItemSeparatorComponent={renderSeparator}
          ListFooterComponent={renderFooter}
          showsVerticalScrollIndicator={false}
          initialNumToRender={20}
          maxToRenderPerBatch={15}
          windowSize={7}
          removeClippedSubviews={true}
          getItemLayout={(_data, index) => ({
            length: ItemHeight,
            offset: ItemHeight * index,
            index,
          })}
        />
      )}
    </View>
  );
}

const ItemHeight = 64 as const;

export const QueueList = React.memo(QueueListComponent);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#e0e0e0',
    marginBottom: 2,
  },
  headerCount: {
    fontSize: 13,
    color: '#888',
  },
  clearButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#444',
    backgroundColor: 'transparent',
  },
  clearButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e0e0e0',
  },
  nowPlayingContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    paddingBottom: 4,
  },
  nowPlayingLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1db954',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 12,
  },
  footerContainer: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
  },
  separator: {
    height: 0,
  },
});
