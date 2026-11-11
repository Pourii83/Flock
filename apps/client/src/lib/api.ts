import type { DocumentPickerAsset } from 'expo-document-picker';

import { getApiUrl } from './config';
import type { ActiveCall, CallLog, Conversation, Message, PublicRoom, Reaction, Room, User } from './types';
import { t } from '@/lib/i18n';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

/** A meeting guest's pass: lets a guest fetch the ICE/TURN servers (the only REST call they make). */
let guestPass: string | null = null;
export const setGuestPass = (token: string | null) => {
  guestPass = token;
};

export const getAuthHeaders =(): Record<string, string> => (authToken ? { Authorization: `Bearer ${authToken}` } : {});

async function readResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && authToken) onUnauthorized?.();
    // Server messages are English; translate the known ones.
    throw new ApiError((data as any).error ? t((data as any).error) : t('Request failed ({status})', { status: res.status }), res.status);
  }
  return data as T;
}

async function request<T>(method: string, path: string, body?: unknown, tokenOverride?: string | null): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${getApiUrl()}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(tokenOverride ? { Authorization: `Bearer ${tokenOverride}` } : getAuthHeaders()),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(t("Can't reach the Flock server. Check your connection."), 0);
  }
  return readResponse<T>(res);
}

async function uploadFile(
  conversationId: string,
  asset: DocumentPickerAsset,
  replyToId?: string,
  caption?: string,
  /** 0..1 upload progress, when the platform can report it (web/desktop). */
  onProgress?: (fraction: number) => void,
): Promise<Message> {
  const form = new FormData();
  const part = asset.file ?? ({ uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/octet-stream' } as any);
  form.append('file', part);
  if (replyToId) form.append('replyToId', replyToId);
  if (caption?.trim()) form.append('caption', caption.trim());
  const url = `${getApiUrl()}/api/conversations/${conversationId}/files`;
  // fetch() cannot report upload progress; XHR can, so big files get a real bar on web/desktop.
  if (onProgress && typeof XMLHttpRequest !== 'undefined') {
    return new Promise<Message>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      for (const [name, value] of Object.entries(getAuthHeaders())) xhr.setRequestHeader(name, value);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.min(1, event.loaded / event.total));
      };
      xhr.onload = () => {
        let data: any = {};
        try {
          data = JSON.parse(xhr.responseText || '{}');
        } catch {
          data = {};
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(1);
          resolve(data as Message);
          return;
        }
        if (xhr.status === 401 && authToken) onUnauthorized?.();
        reject(new ApiError(data?.error ? t(data.error) : t('Request failed ({status})', { status: xhr.status }), xhr.status));
      };
      xhr.onerror = () => reject(new ApiError(t("Can't reach the Flock server. Check your connection."), 0));
      xhr.send(form);
    });
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: form,
    });
  } catch {
    throw new ApiError(t("Can't reach the Flock server. Check your connection."), 0);
  }
  return readResponse<Message>(res);
}

type AuthResponse = { token: string; user: User };

/** Server-wide settings the admin changes in App settings. */
export type AppSettings = {
  allowRegistration: boolean;
  allowGuestMeetings: boolean;
  maxUploadMb: number;
  fileRetentionDays: number;
  /** The app's name, shown everywhere instead of "Flock" (1–40 characters). */
  appName: string;
  /** GitHub repository (https://github.com/owner/name) this server updates from; '' = the main one. */
  mirrorUrl: string;
};

/** Public branding every client can read without signing in. */
export type Branding = { appName: string; repoUrl: string; showRepoLinks: boolean; version: string | null };

/** What an invite link leads to, shown before joining. */
export type InviteInfo = { id: string; type: 'group' | 'channel'; name: string; description: string; avatarUrl: string | null; memberCount: number; member: boolean };

/** The installed server version and its changelog (empty when the package has none). */
export type UpdateInfo = { version: string | null; notes: string; notesFa?: string };

/** Admin-only: installed server release vs the latest GitHub release (Releases, not commits). */
export type ServerUpdateInfo = {
  current: string | null;
  latest: string | null;
  updateAvailable: boolean;
  notes: string;
  url: string;
  publishedAt: string | null;
};

export type ServerUsage = {
  version: string | null;
  cpu: { percent: number; cores: number; load: number[] };
  memory: { total: number; free: number; flock: number };
  disk: { total: number; free: number } | null;
  storage: { uploads: number; database: number };
  uptime: { system: number; flock: number };
  counts: {
    users: number;
    online: number;
    conversations: number;
    messages: number;
    files: number;
    openRooms: number;
    liveCalls: number;
    liveRooms: number;
    inCalls: number;
  };
};

export const api = {
  login: (username: string, password: string) => request<AuthResponse>('POST', '/auth/login', { username, password }),
  register: (username: string, displayName: string, password: string) =>
    request<AuthResponse>('POST', '/auth/register', { username, displayName, password }),
  me: () => request<User>('GET', '/me'),
  updateMe: (patch: Partial<Pick<User, 'displayName' | 'bio' | 'title' | 'username'>>) => request<User>('PATCH', '/me', patch),
  setAvatar: (base64: string) => request<User>('PUT', '/me/avatar', { data: base64 }),
  removeAvatar: () => request<User>('DELETE', '/me/avatar'),
  /** Directory search (the server needs 3+ characters). */
  users: (q = '') => request<User[]>('GET', `/users?q=${encodeURIComponent(q)}`),
  adminSettings: () => request<AppSettings>('GET', '/admin/settings'),
  updateAdminSettings: (patch: Partial<AppSettings>) => request<AppSettings>('PATCH', '/admin/settings', patch),
  adminUsage: () => request<ServerUsage>('GET', '/admin/usage'),
  /** Admin-only: latest GitHub release vs the installed server release. */
  serverUpdate: () => request<ServerUpdateInfo>('GET', '/admin/server-update'),
  startServerUpdate: (tag: string) => request<{ ok: boolean; started?: boolean; error?: string }>('POST', '/admin/server-update', { tag }),
  health: () => request<{ ok: boolean; maxUploadMb?: number }>('GET', '/health'),
  /** Public branding: app name, project link and the server's installed version. */
  branding: () => request<Branding>('GET', '/branding'),
  /** The installed server version and the changelog packaged with it. */
  updateInfo: () => request<UpdateInfo>('GET', '/update'),
  rooms: () => request<Room[]>('GET', '/rooms'),
  /** expiresInMinutes null = open until closed. */
  createRoom: (title: string, expiresInMinutes: number | null) => request<Room>('POST', '/rooms', { title, expiresInMinutes }),
  closeRoom: (id: string) => request<Room>('DELETE', `/rooms/${id}`),
  publicRoom: (code: string) => request<PublicRoom>('GET', `/rooms/public/${encodeURIComponent(code)}`),
  joinRoomAsGuest: (code: string, name: string) => request<AuthResponse>('POST', `/rooms/public/${encodeURIComponent(code)}/guest`, { name }),
  /** People I already share a chat with. */
  contacts: (q = '') => request<User[]>('GET', `/users?scope=contacts&q=${encodeURIComponent(q)}`),
  conversations: () => request<Conversation[]>('GET', '/conversations'),
  conversation: (id: string) => request<Conversation>('GET', `/conversations/${id}`),
  registerDevice: (publicKey: string) => request<{ id: string }>('POST', '/devices', { publicKey }),
  createSecretConversation: (userId: string, deviceId: string) => request<Conversation>('POST', '/conversations/secret', { userId, deviceId }),
  acceptSecret: (id: string, deviceId: string) => request<Conversation>('POST', `/conversations/${id}/secret/accept`, { deviceId }),
  createGroup: (userIds: string[], name: string, description: string, channel = false) =>
    request<Conversation>('POST', '/conversations', { userIds, name, description, ...(channel ? { channel: true } : {}) }),
  updateGroupInfo: (id: string, patch: { name?: string; description?: string }) =>
    request<Conversation>('PATCH', `/conversations/${id}/info`, patch),
  setGroupAvatar: (id: string, base64: string) => request<Conversation>('PUT', `/conversations/${id}/avatar`, { data: base64 }),
  removeGroupAvatar: (id: string) => request<Conversation>('DELETE', `/conversations/${id}/avatar`),
  /** The group/channel's invite code (null when there is no active link). */
  groupInvite: (id: string) => request<{ code: string | null }>('GET', `/conversations/${id}/invite`),
  /** Creates the link when there is none; `reset` (owner) replaces it and so revokes the old one. */
  createGroupInvite: (id: string, reset = false) => request<{ code: string | null }>('POST', `/conversations/${id}/invite`, reset ? { reset: true } : {}),
  revokeGroupInvite: (id: string) => request<{ code: string | null }>('DELETE', `/conversations/${id}/invite`),
  /** A short-lived signed link for streaming a file (`url` is the attachment's /api/files/<id> URL). */
  fileLink: (url: string) => request<{ url: string }>('POST', `${url.replace(/^\/api/, '')}/link`),
  inviteInfo: (code: string) => request<InviteInfo>('GET', `/invite/${encodeURIComponent(code)}`),
  joinInvite: (code: string) => request<Conversation>('POST', `/invite/${encodeURIComponent(code)}/join`),
  addMembers: (id: string, userIds: string[]) => request<Conversation>('POST', `/conversations/${id}/members`, { userIds }),
  /** Removes a member, or leaves when `userId` is yourself. */
  removeMember: (id: string, userId: string) => request<{ ok: true }>('DELETE', `/conversations/${id}/members/${userId}`),
  setMemberRole: (id: string, userId: string, role: 'admin' | 'member' | 'owner') =>
    request<Conversation>('PATCH', `/conversations/${id}/members/${userId}`, { role }),
  activeCalls: () => request<ActiveCall[]>('GET', '/calls/active'),
  invitedCall: (callId: string) => request<ActiveCall>('GET', `/calls/${callId}/active`),
  createConversation: (userIds: string[], name?: string) =>
    request<Conversation>('POST', '/conversations', { userIds, name }),
  updateConversation: (id: string, patch: { pinned?: boolean; muted?: boolean }) =>
    request<Conversation>('PATCH', `/conversations/${id}`, patch),
  messages: (id: string, before?: number) =>
    request<Message[]>('GET', `/conversations/${id}/messages${before ? `?before=${before}` : ''}`),
  /** Case-insensitive search inside one conversation; newest matches first. */
  searchMessages: (id: string, q: string, before?: number) =>
    request<Message[]>(
      'GET',
      `/conversations/${id}/search?q=${encodeURIComponent(q)}${before ? `&before=${before}` : ''}`,
    ),
  /** Pinned messages of one conversation, newest pin first. */
  pinnedMessages: (id: string) => request<Message[]>('GET', `/conversations/${id}/pinned`),
  sendMessage: (id: string, body: string, replyToId?: string) =>
    request<Message>('POST', `/conversations/${id}/messages`, { body, replyToId }),
  uploadFile,
  /** Same upload as `uploadFile`, with an optional caption stored as the message text. */
  sendFile: uploadFile,
  /** Add (`on` true), remove (false) or toggle (omitted) my reaction. */
  react: (messageId: string, emoji: string, on?: boolean) =>
    request<{ messageId: string; reactions: Reaction[] }>('POST', `/messages/${messageId}/react`, { emoji, on }),
  /** Edits the text of my own message; returns the updated message. */
  editMessage: (messageId: string, body: string) => request<Message>('PATCH', `/messages/${messageId}`, { body }),
  /** Deletes my own message (and its file, when it has one). */
  deleteMessage: (messageId: string) =>
    request<{ ok: true; messageId: string }>('DELETE', `/messages/${messageId}`),
  /** Copies a message into another conversation I'm in, noting the original sender. */
  forwardMessage: (messageId: string, conversationId: string) =>
    request<Message>('POST', `/messages/${messageId}/forward`, { conversationId }),
  /** Pins, unpins (`on: false`) or toggles (omitted) a message. */
  pinMessage: (messageId: string, on?: boolean) =>
    request<{ messageId: string; pinnedAt: number | null }>('POST', `/messages/${messageId}/pin`, { on }),
  /** Copies a message into my Saved Messages (created on first use). */
  saveMessage: (messageId: string) => request<Message>('POST', `/messages/${messageId}/save`),
  savedMessages: () => request<Conversation>('GET', '/conversations/saved'),
  markRead: (id: string) => request<{ readAt: number }>('POST', `/conversations/${id}/read`),
  calls: () => request<CallLog[]>('GET', '/calls'),
  ice: () => request<{ iceServers: RTCIceServer[]; iceTransportPolicy?: RTCIceTransportPolicy }>('GET', '/ice', undefined, authToken ? null : guestPass),
};
