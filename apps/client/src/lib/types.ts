export type User = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  title: string;
  avatarColor: string;
  /** Server-relative path of the profile photo, or null. */
  avatarUrl: string | null;
  online: boolean;
  lastSeen: number | null;
  /** Only on my own account: I'm the server admin. */
  isAdmin?: boolean;
};

/** A meeting room: a link that works without an account, until it expires or its owner closes it. */
export type Room = {
  id: string;
  code: string;
  ownerId: string;
  title: string;
  createdAt: number;
  /** null = open until closed. */
  expiresAt: number | null;
  closedAt: number | null;
};

export type PublicRoom = {
  code: string;
  title: string;
  expiresAt: number | null;
  open: boolean;
  host: { displayName: string; avatarUrl: string | null; avatarColor: string } | null;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  kind: 'text' | 'system' | 'file' | 'call_invite';
  body: string;
  attachment: {
    name: string;
    mimeType: string;
    size: number;
    expiresAt: number;
    expired: boolean;
    /** Authenticated server-relative URL, null after expiry. */
    url: string | null;
  } | null;
  replyTo: { id: string; body: string; senderId: string; senderName: string } | null;
  createdAt: number;
  /** Client-only: optimistic message not yet confirmed by the server. */
  pending?: boolean;
  failed?: boolean;
  /** Secret chats: 'ok' once decrypted on this device, 'locked' when this device can't read it. */
  secret?: 'ok' | 'locked';
};

export type GroupRole = 'owner' | 'admin' | 'member';

export type Conversation = {
  id: string;
  type: 'direct' | 'group';
  name: string;
  /** Members carry their group role (groups only). */
  members: (User & { role?: GroupRole })[];
  description: string;
  /** Group photo (server-relative), or null. */
  avatarUrl: string | null;
  myRole: GroupRole | null;
  lastMessage: Message | null;
  unreadCount: number;
  pinned: boolean;
  muted: boolean;
  othersReadAt: number;
  createdAt: number;
  updatedAt: number;
  /** End-to-end encrypted direct chat: the two device keys it is bound to (recipient once accepted). */
  secret: SecretInfo | null;
};

export type SecretInfo = {
  initiatorUserId: string;
  initiatorDeviceId: string | null;
  initiatorKey: string | null;
  recipientDeviceId: string | null;
  recipientKey: string | null;
};

/** A call currently running in a conversation (for "Join call"). */
export type ActiveCall = {
  conversationId: string;
  callId: string;
  video: boolean;
  startedAt: number;
  participants: string[];
  title?: string;
  isGroup?: boolean;
};

export type CallLog = {
  id: string;
  conversationId: string;
  title: string;
  conversationType: 'direct' | 'group';
  peer: User | null;
  memberCount: number;
  video: boolean;
  direction: 'incoming' | 'outgoing';
  missed: boolean;
  status: 'completed' | 'missed' | 'declined';
  startedAt: number;
  durationSec: number;
};
