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
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  kind: 'text' | 'system';
  body: string;
  replyTo: { id: string; body: string; senderId: string; senderName: string } | null;
  createdAt: number;
  /** Client-only: optimistic message not yet confirmed by the server. */
  pending?: boolean;
  failed?: boolean;
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
};

/** A call currently running in a conversation (for "Join call"). */
export type ActiveCall = {
  conversationId: string;
  callId: string;
  video: boolean;
  startedAt: number;
  participants: string[];
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
