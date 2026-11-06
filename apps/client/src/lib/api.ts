import type { DocumentPickerAsset } from 'expo-document-picker';

import { getApiUrl } from './config';
import type { ActiveCall, CallLog, Conversation, Message, PublicRoom, Room, User } from './types';
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

export const getAuthHeaders = (): Record<string, string> => (authToken ? { Authorization: `Bearer ${authToken}` } : {});

async function readResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && authToken) onUnauthorized?.();
    // Server messages are English; translate the known ones.
    throw new ApiError((data as any).error ? t((data as any).error) : t('Request failed ({status})', { status: res.status }), res.status);
  }
  return data as T;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${getApiUrl()}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(t("Can't reach the Flock server. Check your connection."), 0);
  }
  return readResponse<T>(res);
}

async function uploadFile(conversationId: string, asset: DocumentPickerAsset, replyToId?: string): Promise<Message> {
  const form = new FormData();
  const part = asset.file ?? ({ uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/octet-stream' } as any);
  form.append('file', part);
  if (replyToId) form.append('replyToId', replyToId);
  let res: Response;
  try {
    res = await fetch(`${getApiUrl()}/api/conversations/${conversationId}/files`, {
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
export type AppSettings = { allowRegistration: boolean; allowGuestMeetings: boolean; maxUploadMb: number; fileRetentionDays: number };

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
  health: () => request<{ ok: boolean; maxUploadMb?: number }>('GET', '/health'),
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
  createGroup: (userIds: string[], name: string, description: string) =>
    request<Conversation>('POST', '/conversations', { userIds, name, description }),
  updateGroupInfo: (id: string, patch: { name?: string; description?: string }) =>
    request<Conversation>('PATCH', `/conversations/${id}/info`, patch),
  setGroupAvatar: (id: string, base64: string) => request<Conversation>('PUT', `/conversations/${id}/avatar`, { data: base64 }),
  removeGroupAvatar: (id: string) => request<Conversation>('DELETE', `/conversations/${id}/avatar`),
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
  sendMessage: (id: string, body: string, replyToId?: string) =>
    request<Message>('POST', `/conversations/${id}/messages`, { body, replyToId }),
  uploadFile,
  markRead: (id: string) => request<{ readAt: number }>('POST', `/conversations/${id}/read`),
  calls: () => request<CallLog[]>('GET', '/calls'),
  ice: () => request<{ iceServers: RTCIceServer[]; iceTransportPolicy?: RTCIceTransportPolicy }>('GET', '/ice'),
};
