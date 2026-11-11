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
  /** Display name of the sender, set by the server on message payloads. */
  senderName?: string | null;
  kind: 'text' | 'system' | 'file' | 'call_invite' | 'call';
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
  /** Set on copies made into Saved Messages: the original sender's name. */
  forwardedFrom?: string | null;
  /** When the sender last changed the text (null/undefined = never edited). */
  editedAt?: number | null;
  /** When the message was pinned in its conversation (null/undefined = not pinned). */
  pinnedAt?: number | null;
  /** Emoji reactions, oldest first. Plaintext metadata (also in secret chats). */
  reactions?: Reaction[];
  createdAt: number;
  /**
   * Client-only, kind 'call': the parsed call log. The store also rewrites `body` into a localized
   * one-line summary ("Missed voice call") so list previews can show it as-is.
   */
  call?: CallLogEntry;
  /** Client-only: optimistic message not yet confirmed by the server. */
  pending?: boolean;
  failed?: boolean;
  /** Secret chats: 'ok' once decrypted on this device, 'locked' when this device can't read it. */
  secret?: 'ok' | 'locked';
};

export type Reaction = { emoji: string; userIds: string[] };

/** What the server stores in the body of a 'call' message when a call in the conversation ends. */
export type CallLogEntry = {
  callId: string;
  video: boolean;
  status: 'completed' | 'missed' | 'declined' | 'cancelled';
  durationSec: number;
  /** I placed this call. */
  outgoing: boolean;
};

export type GroupRole = 'owner' | 'admin' | 'member';

export type Conversation = {
  id: string;
  type: 'direct' | 'group' | 'channel';
  /** My personal "Saved Messages" chat (type is 'direct' with me as the only member). */
  isSaved?: boolean;
  name: string;
  /** Members carry their group role (groups only). */
  members: (User & { role?: GroupRole })[];
  description: string;
  /** Group photo (server-relative), or null. */
  avatarUrl: string | null;
  myRole: GroupRole | null;
  /** Everyone in the group or channel (the members list can be shorter: channel subscribers don't see each other). */
  memberCount?: number;
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
