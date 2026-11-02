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

export type Conversation = {
  id: string;
  type: 'direct' | 'group';
  name: string;
  members: User[];
  lastMessage: Message | null;
  unreadCount: number;
  pinned: boolean;
  muted: boolean;
  othersReadAt: number;
  createdAt: number;
  updatedAt: number;
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
