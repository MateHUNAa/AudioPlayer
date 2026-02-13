import React from 'react';
import {
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconPlayerSkipForwardFilled,
  IconPlayerSkipBackFilled,
  IconArrowsShuffle,
  IconRepeat,
  IconRepeatOnce,
  IconHeart,
  IconHeartFilled,
  IconSearch,
  IconX,
  IconChevronLeft,
  IconMenu2,
  IconMusic,
  IconMusicBolt,
  IconPlaylist,
  IconPlaylistAdd,
  IconPlus,
  IconTrash,
  IconEdit,
  IconArrowsSort,
  IconRefresh,
  IconAlertTriangle,
  IconFolder,
  IconDisc,
  IconPlayerPlay,
  IconLoader2,
  IconDots,
  IconCheck,
  IconLibrary,
  IconVinyl,
} from '@tabler/icons-react-native';

interface IconProps {
  readonly size?: number;
  readonly color?: string;
  readonly strokeWidth?: number;
}

const DefaultSize = 24 as const;
const DefaultColor = '#e0e0e0' as const;
const DefaultStroke = 1.8 as const;

export function PlayIcon({ size = DefaultSize, color = '#fff', strokeWidth = DefaultStroke }: IconProps) {
  return <IconPlayerPlayFilled size={size} color={color} strokeWidth={strokeWidth} />;
}

export function PauseIcon({ size = DefaultSize, color = '#fff', strokeWidth = DefaultStroke }: IconProps) {
  return <IconPlayerPauseFilled size={size} color={color} strokeWidth={strokeWidth} />;
}

export function SkipForwardIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconPlayerSkipForwardFilled size={size} color={color} strokeWidth={strokeWidth} />;
}

export function SkipBackIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconPlayerSkipBackFilled size={size} color={color} strokeWidth={strokeWidth} />;
}

export function ShuffleIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconArrowsShuffle size={size} color={color} strokeWidth={strokeWidth} />;
}

export function RepeatIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconRepeat size={size} color={color} strokeWidth={strokeWidth} />;
}

export function RepeatOnceIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconRepeatOnce size={size} color={color} strokeWidth={strokeWidth} />;
}

export function HeartIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconHeart size={size} color={color} strokeWidth={strokeWidth} />;
}

export function HeartFilledIcon({ size = DefaultSize, color = '#e53935', strokeWidth = DefaultStroke }: IconProps) {
  return <IconHeartFilled size={size} color={color} strokeWidth={strokeWidth} />;
}

export function SearchIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconSearch size={size} color={color} strokeWidth={strokeWidth} />;
}

export function CloseIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconX size={size} color={color} strokeWidth={strokeWidth} />;
}

export function BackIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconChevronLeft size={size} color={color} strokeWidth={strokeWidth} />;
}

export function MenuIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconMenu2 size={size} color={color} strokeWidth={strokeWidth} />;
}

export function MusicIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconMusic size={size} color={color} strokeWidth={strokeWidth} />;
}

export function MusicBoltIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconMusicBolt size={size} color={color} strokeWidth={strokeWidth} />;
}

export function PlaylistIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconPlaylist size={size} color={color} strokeWidth={strokeWidth} />;
}

export function PlaylistAddIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconPlaylistAdd size={size} color={color} strokeWidth={strokeWidth} />;
}

export function PlusIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconPlus size={size} color={color} strokeWidth={strokeWidth} />;
}

export function TrashIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconTrash size={size} color={color} strokeWidth={strokeWidth} />;
}

export function EditIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconEdit size={size} color={color} strokeWidth={strokeWidth} />;
}

export function SortIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconArrowsSort size={size} color={color} strokeWidth={strokeWidth} />;
}

export function RefreshIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconRefresh size={size} color={color} strokeWidth={strokeWidth} />;
}

export function AlertIcon({ size = DefaultSize, color = '#e53935', strokeWidth = DefaultStroke }: IconProps) {
  return <IconAlertTriangle size={size} color={color} strokeWidth={strokeWidth} />;
}

export function FolderIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconFolder size={size} color={color} strokeWidth={strokeWidth} />;
}

export function DiscIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconDisc size={size} color={color} strokeWidth={strokeWidth} />;
}

export function PlayOutlineIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconPlayerPlay size={size} color={color} strokeWidth={strokeWidth} />;
}

export function LoadingIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconLoader2 size={size} color={color} strokeWidth={strokeWidth} />;
}

export function DotsIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconDots size={size} color={color} strokeWidth={strokeWidth} />;
}

export function CheckIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconCheck size={size} color={color} strokeWidth={strokeWidth} />;
}

export function LibraryIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconLibrary size={size} color={color} strokeWidth={strokeWidth} />;
}

export function VinylIcon({ size = DefaultSize, color = DefaultColor, strokeWidth = DefaultStroke }: IconProps) {
  return <IconVinyl size={size} color={color} strokeWidth={strokeWidth} />;
}
