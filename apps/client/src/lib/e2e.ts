// End-to-end encryption for secret chats.
//
// Every device makes its own Curve25519 key pair (NaCl box). Only the public half goes to the server;
// the secret half stays in this device's storage (OS keystore on phones, browser storage on the web).
// A secret chat is bound to one device on each side, and messages are sealed with
// XSalsa20-Poly1305 between those two keys, so the server only ever stores ciphertext.
import * as ExpoCrypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import nacl from 'tweetnacl';

import { api } from './api';
import { getApiUrl } from './config';
import { getItem, setItem } from './storage';
import type { Conversation } from './types';

nacl.setPRNG((out, n) => {
  const bytes = ExpoCrypto.getRandomBytes(n);
  for (let i = 0; i < n; i++) out[i] = bytes[i]!;
});

// ---------- encoding ----------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2]! + B64[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    out += c === undefined ? '=' : B64[c & 63]!;
  }
  return out;
}

export function fromBase64(text: string) {
  const clean = text.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let o = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error('bad base64');
    value = (value << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (value >> bits) & 255;
    }
  }
  return out;
}

const utf8 = { encode: (s: string) => new TextEncoder().encode(s), decode: (b: Uint8Array) => new TextDecoder().decode(b) };

// ---------- this device ----------

export type DeviceIdentity = { id: string; publicKey: string; secretKey: string };

let device: DeviceIdentity | null = null;
let deviceUser: string | null = null;
const listeners = new Set<() => void>();
export const onDeviceChange = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

// One identity per account per server on this device. SecureStore keys allow only [A-Za-z0-9._-].
const storageKey = (userId: string) => `flock.device.${getApiUrl().replace(/[^A-Za-z0-9._-]/g, '_')}.${userId}`;

export const getDevice = () => device;

/** Loads this device's identity for `userId` if it has one (doesn't create it). */
export async function loadDevice(userId: string) {
  deviceUser = userId;
  const saved = await getItem(storageKey(userId));
  if (deviceUser !== userId) return null;
  try {
    device = saved ? (JSON.parse(saved) as DeviceIdentity) : null;
  } catch {
    device = null;
  }
  listeners.forEach((fn) => fn());
  return device;
}

export function forgetLoadedDevice() {
  device = null;
  deviceUser = null;
  shared.clear();
}

/** This device's identity, created and registered with the server on first use. */
export async function ensureDevice(userId: string) {
  if (device && deviceUser === userId) return device;
  const existing = await loadDevice(userId);
  if (existing) return existing;
  const pair = nacl.box.keyPair();
  const publicKey = toBase64(pair.publicKey);
  const { id } = await api.registerDevice(publicKey);
  device = { id, publicKey, secretKey: toBase64(pair.secretKey) };
  deviceUser = userId;
  await setItem(storageKey(userId), JSON.stringify(device));
  listeners.forEach((fn) => fn());
  return device;
}

// ---------- secret chats ----------

/**
 * Where a secret chat stands on this device:
 * - ready: both device keys are known and one of them is this device's
 * - waiting: I started it here; the other person hasn't accepted yet
 * - invite: someone started it with me and no device of mine has accepted yet
 * - elsewhere: it belongs to another of my devices (or this device lost its keys)
 */
export type SecretStatus = { state: 'ready'; peerKey: string } | { state: 'waiting' | 'invite' | 'elsewhere' };

export function secretStatus(c: Conversation, meId: string | undefined): SecretStatus | null {
  const s = c.secret;
  if (!s) return null;
  const mine = device;
  if (mine && s.initiatorDeviceId === mine.id) return s.recipientKey ? { state: 'ready', peerKey: s.recipientKey } : { state: 'waiting' };
  if (mine && s.recipientDeviceId === mine.id && s.initiatorKey) return { state: 'ready', peerKey: s.initiatorKey };
  if (!s.recipientDeviceId && s.initiatorUserId !== meId) return { state: 'invite' };
  return { state: 'elsewhere' };
}

/** Re-renders when this device's key loads or is created. */
export function useDevice() {
  return useSyncExternalStore(onDeviceChange, getDevice, getDevice);
}

/** secretStatus() that updates when the device key arrives. */
export function useSecretStatus(c: Conversation | undefined, meId: string | undefined) {
  useDevice();
  return c ? secretStatus(c, meId) : null;
}

const shared = new Map<string, Uint8Array>();
function sharedKey(peerKey: string) {
  if (!device) throw new Error('no device key');
  const id = `${device.id}:${peerKey}`;
  let key = shared.get(id);
  if (!key) {
    key = nacl.box.before(fromBase64(peerKey), fromBase64(device.secretKey));
    shared.set(id, key);
  }
  return key;
}

/** Seals a message for the other device: `{"v":1,"n":nonce,"c":ciphertext}`. */
export function encryptText(text: string, peerKey: string) {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const sealed = nacl.box.after(utf8.encode(text), nonce, sharedKey(peerKey));
  return JSON.stringify({ v: 1, n: toBase64(nonce), c: toBase64(sealed) });
}

/** Opens a sealed message, or null if it isn't one or this device can't read it. */
export function decryptText(body: string, peerKey: string) {
  try {
    const envelope = JSON.parse(body);
    if (envelope?.v !== 1) return null;
    const opened = nacl.box.open.after(fromBase64(envelope.c), fromBase64(envelope.n), sharedKey(peerKey));
    return opened ? utf8.decode(opened) : null;
  } catch {
    return null;
  }
}

/** A short code both people can compare to be sure no one swapped the keys (same on both sides). */
export function safetyCode(keyA: string, keyB: string) {
  const [first, second] = [keyA, keyB].sort();
  const digest = nacl.hash(utf8.encode(`${first}|${second}`));
  const groups: string[] = [];
  for (let i = 0; i < 6; i++) groups.push(String(((digest[i * 2]! << 8) | digest[i * 2 + 1]!) % 100000).padStart(5, '0'));
  return groups.join(' ');
}
