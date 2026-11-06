import { Image } from 'expo-image';
import { View, type StyleProp, type ViewStyle } from 'react-native';

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

/** Avatar for a conversation: the peer for DMs, a stacked pair or group glyph for groups. */
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
  const others = conversation.members.filter((m) => m.id !== meId);
  if (conversation.type === 'direct') return <Avatar user={others[0]} size={size} ringBg={ringBg} />;
  if (conversation.avatarUrl)
    return (
      <Image
        source={{ uri: `${getApiUrl()}${conversation.avatarUrl}` }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceHigh }}
        contentFit="cover"
        transition={150}
        accessibilityLabel={conversation.name}
      />
    );
  if (others.length >= 2) {
    const small = size * 0.68;
    return (
      <View style={{ width: size, height: size }}>
        <Avatar user={others[0]} size={small} showPresence={false} />
        <View style={{ position: 'absolute', right: 0, bottom: 0, borderRadius: small, borderWidth: 2, borderColor: ringBg ?? colors.canvas }}>
          <Avatar user={others[1]} size={small - 4} showPresence={false} />
        </View>
      </View>
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.surfaceHigh,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Icon name="users" size={size * 0.42} color={colors.amberText} />
    </View>
  );
}
