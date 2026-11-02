import { getApiUrl } from './config';
import type { CallLog, Conversation, Message, User } from './types';
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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${getApiUrl()}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(t("Can't reach the Flock server. Check your connection."), 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && authToken) onUnauthorized?.();
    // Server messages are English; translate the known ones.
    throw new ApiError(data.error ? t(data.error) : t('Request failed ({status})', { status: res.status }), res.status);
  }
  return data as T;
}

type AuthResponse = { token: string; user: User };

export const api = {
  login: (username: string, password: string) => request<AuthResponse>('POST', '/auth/login', { username, password }),
  register: (username: string, displayName: string, password: string) =>
    request<AuthResponse>('POST', '/auth/register', { username, displayName, password }),
  me: () => request<User>('GET', '/me'),
  updateMe: (patch: Partial<Pick<User, 'displayName' | 'bio' | 'title'>>) => request<User>('PATCH', '/me', patch),
  setAvatar: (base64: string) => request<User>('PUT', '/me/avatar', { data: base64 }),
  removeAvatar: () => request<User>('DELETE', '/me/avatar'),
  users: (q = '') => request<User[]>('GET', `/users?q=${encodeURIComponent(q)}`),
  conversations: () => request<Conversation[]>('GET', '/conversations'),
  conversation: (id: string) => request<Conversation>('GET', `/conversations/${id}`),
  createConversation: (userIds: string[], name?: string) =>
    request<Conversation>('POST', '/conversations', { userIds, name }),
  updateConversation: (id: string, patch: { pinned?: boolean; muted?: boolean }) =>
    request<Conversation>('PATCH', `/conversations/${id}`, patch),
  messages: (id: string, before?: number) =>
    request<Message[]>('GET', `/conversations/${id}/messages${before ? `?before=${before}` : ''}`),
  sendMessage: (id: string, body: string, replyToId?: string) =>
    request<Message>('POST', `/conversations/${id}/messages`, { body, replyToId }),
  markRead: (id: string) => request<{ readAt: number }>('POST', `/conversations/${id}/read`),
  calls: () => request<CallLog[]>('GET', '/calls'),
  ice: () => request<{ iceServers: RTCIceServer[] }>('GET', '/ice'),
};
