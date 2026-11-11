import { Image } from 'expo-image';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { getApiUrl } from '@/lib/config';
import { initials } from '@/lib/format';
import type { Conversation, User } from '@/lib/types';
import { colors, fonts } from '@/theme';
import { Icon, T } from './ui';

export function Avatar({
  user,
  size = 48,
  showPresence = true,
  ring,
  ringBg = colors.canvas,
  style,
}: {
  user: (Pick<User, 'displayName' | 'avatarColor' | 'online'> & { avatarUrl?: string | null }) | null | undefined;
  size?: number;
  showPresence?: boolean;
  ring?: string;
  ringBg?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const color = user?.avatarColor ?? colors.textMuted;
  const dot = Math.max(10, Math.round(size * 0.24));
  const inner = user?.avatarUrl ? (
    <Image
      source={{ uri: `${getApiUrl()}${user.avatarUrl}` }}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceHigh }}
      contentFit="cover"
      transition={150}
      accessibilityLabel={user.displayName}
    />
  ) : (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${color}26`,
        borderWidth: 1,
        borderColor: `${color}55`,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <T style={{ fontFamily: fonts.semibold, fontSize: size * 0.36, lineHeight: size * 0.44, color }}>
        {initials(user?.displayName ?? '?')}
      </T>
    </View>
  );
  return (
    <View style={[{ width: ring ? size + 8 : size, height: ring ? size + 8 : size }, style]}>
      {ring ? (
        <View
          style={{
            width: size + 8,
            height: size + 8,
            borderRadius: (size + 8) / 2,
            borderWidth: 2,
            borderColor: ring,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {inner}
        </View>
      ) : (
        inner
      )}
      {showPresence && user?.online && (
        <View
          style={{
            position: 'absolute',
            right: ring ? 2 : -1,
            bottom: ring ? 2 : -1,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: colors.online,
            borderWidth: 2,
            borderColor: ringBg,
          }}
        />
      )}
    </View>
  );
}

/** The "Saved Messages" self-conversation. */
export const isSavedConversation = (c: Conversation): boolean => !!c.isSaved;

export function SavedAvatar({ size = 48 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.amberTint, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="bookmark" size={size * 0.42} color={colors.amberText} />
    </View>
  );
}

const GROUP_COLORS = ['#FFB84D', '#4EDEA3', '#7C9CFF', '#FF8A80', '#C792EA', '#64D2FF', '#F5C26B', '#9AE6B4'];

/** A stable accent per group name, so the same group always gets the same colour. */
const groupColor = (name: string) => {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return GROUP_COLORS[hash % GROUP_COLORS.length]!;
};

/** A monochrome megaphone, the channel marker (Feather has none). */
export function MegaphoneIcon({ size = 16, color = colors.text }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 10v4a1 1 0 0 0 1 1h2l4.2 3.4c.6.5 1.8.1 1.8-.8V6.4c0-.9-1.2-1.3-1.8-.8L6 9H4a1 1 0 0 0-1 1zm12.5-2.2a1 1 0 0 0-.2 1.4 4 4 0 0 1 0 5.6 1 1 0 1 0 1.6 1.2 6 6 0 0 0 0-8 1 1 0 0 0-1.4-.2zm2.6-2.6a1 1 0 0 0-.1 1.4 8 8 0 0 1 0 10.8 1 1 0 1 0 1.5 1.3 10 10 0 0 0 0-13.4 1 1 0 0 0-1.4-.1z"
        fill={color}
      />
    </Svg>
  );
}

/** Avatar for a conversation: the peer for DMs; for groups and channels the photo or the name's first letter, plus a small type marker. */
export function ConversationAvatar({
  conversation,
  meId,
  size = 48,
  ringBg,
}: {
  conversation: Conversation;
  meId: string | undefined;
  size?: number;
  ringBg?: string;
}) {
  if (isSavedConversation(conversation)) return <SavedAvatar size={size} />;
  const others = conversation.members.filter((m) => m.id !== meId);
  if (conversation.type === 'direct') return <Avatar user={others[0]} size={size} ringBg={ringBg} />;

  const channel = conversation.type === 'channel';
  const name = conversation.name || (channel ? '#' : '?');
  const color = groupColor(name);
  const badge = Math.max(16, Math.round(size * 0.36));
  const face = conversation.avatarUrl ? (
    <Image
      source={{ uri: `${getApiUrl()}${conversation.avatarUrl}` }}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceHigh }}
      contentFit="cover"
      transition={150}
      accessibilityLabel={conversation.name}
    />
  ) : (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${color}26`,
        borderWidth: 1,
        borderColor: `${color}55`,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <T style={{ fontFamily: fonts.semibold, fontSize: size * 0.36, lineHeight: size * 0.44, color }}>{initials(name).slice(0, 1)}</T>
    </View>
  );
  return (
    <View style={{ width: size, height: size }}>
      {face}
      <View
        style={{
          position: 'absolute',
          right: -2,
          bottom: -2,
          width: badge,
          height: badge,
          borderRadius: badge / 2,
          backgroundColor: colors.surfaceHigh,
          borderWidth: 2,
          borderColor: ringBg ?? colors.canvas,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {channel ? <MegaphoneIcon size={badge * 0.58} color={colors.amberText} /> : <Icon name="users" size={badge * 0.58} color={colors.amberText} />}
      </View>
    </View>
  );
}
