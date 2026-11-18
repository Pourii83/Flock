// Files in secret (end-to-end encrypted) chats. The sender's device encrypts the file with a fresh
// random key (NaCl secretbox) and uploads only the ciphertext. The key, the real name, type, size
// and the caption go inside the message text, which is encrypted for the other device like any
// secret message. The receiving device downloads the ciphertext, opens it in memory and shows it
// from a local URL (blob: on web/desktop, file:// on Android). The server never sees the contents.
import type { DocumentPickerAsset } from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import nacl from 'tweetnacl';

import { getAuthHeaders } from './api';
import { getApiUrl } from './config';
import { fromBase64, toBase64 } from './e2e';
import { t } from './i18n';

/** Kept small: the whole file is encrypted and decrypted in memory. */
export const SECRET_FILE_MAX_MB = 50;

/** What travels (encrypted) in a secret file message's text. */
export type SealedFileMeta = { t: 'file'; k: string; n: string; name: string; mime: string; size: number; caption?: string };

export function parseSealedMeta(text: string): SealedFileMeta | null {
  try {
    const meta = JSON.parse(text);
    return meta?.t === 'file' && typeof meta.k === 'string' && typeof meta.n === 'string' && typeof meta.name === 'string' ? meta : null;
  } catch {
    return null;
  }
}

async function assetBytes(asset: DocumentPickerAsset): Promise<Uint8Array> {
  const blob = (asset as { file?: Blob }).file;
  if (blob) return new Uint8Array(await blob.arrayBuffer());
  return new File(asset.uri).bytes();
}

/**
 * Encrypts a picked/pasted file. Returns the ciphertext as an upload-ready asset and the metadata
 * that goes (encrypted) into the message text.
 */
export async function sealFile(asset: DocumentPickerAsset, caption: string | undefined) {
  if ((asset.size ?? 0) > SECRET_FILE_MAX_MB * 1024 * 1024) throw new Error(t('Files in secret chats can be up to 50 MB'));
  const plain = await assetBytes(asset);
  const key = nacl.randomBytes(nacl.secretbox.keyLength);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const cipher = nacl.secretbox(plain, nonce, key);
  const meta: SealedFileMeta = {
    t: 'file',
    k: toBase64(key),
    n: toBase64(nonce),
    name: asset.name || 'file',
    mime: asset.mimeType || 'application/octet-stream',
    size: plain.length,
    ...(caption?.trim() ? { caption: caption.trim() } : {}),
  };
  let upload: DocumentPickerAsset;
  if (Platform.OS === 'web') {
    const file = new globalThis.File([cipher as BlobPart], 'sealed.bin', { type: 'application/octet-stream' });
    upload = { uri: '', name: 'sealed.bin', size: file.size, mimeType: 'application/octet-stream', lastModified: Date.now(), file } as DocumentPickerAsset;
  } else {
    const out = new File(Paths.cache, `sealed-${Date.now()}.bin`);
    out.create({ overwrite: true });
    out.write(cipher);
    upload = { uri: out.uri, name: 'sealed.bin', size: cipher.length, mimeType: 'application/octet-stream', lastModified: Date.now() } as DocumentPickerAsset;
  }
  return { upload, meta };
}

/** A URL this device made itself (decrypted file): use it as is, without the server or auth. */
export const isLocalUrl = (url: string) => /^(blob:|file:|data:|content:)/.test(url);

const opened = new Map<string, Promise<string>>();

/** Downloads, decrypts and caches a sealed attachment; resolves to a local URL. */
export function openSealed(messageId: string, url: string, key: { k: string; n: string }, name: string, mime: string): Promise<string> {
  let job = opened.get(messageId);
  if (!job) {
    job = (async () => {
      const res = await fetch(`${getApiUrl()}${url}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(res.status === 410 ? t('File expired') : t('Could not download file'));
      const cipher = new Uint8Array(await res.arrayBuffer());
      const plain = nacl.secretbox.open(cipher, fromBase64(key.n), fromBase64(key.k));
      if (!plain) throw new Error(t('This file could not be decrypted'));
      if (Platform.OS === 'web') return URL.createObjectURL(new Blob([plain as BlobPart], { type: mime }));
      const safe = name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-100) || 'file';
      const out = new File(Paths.cache, `${messageId.slice(0, 8)}-${safe}`);
      out.create({ overwrite: true });
      out.write(plain);
      return out.uri;
    })();
    opened.set(messageId, job);
    job.catch(() => opened.delete(messageId));
  }
  return job;
}

/** The decrypted file's local URL for a secret attachment (null while it loads). */
export function useSealedUrl(messageId: string, attachment: { url: string | null; name: string; mimeType: string; sealed?: { k: string; n: string } } | null) {
  const [state, setState] = useState<{ url: string | null; error: string }>({ url: null, error: '' });
  const sealed = attachment?.sealed;
  const remote = attachment?.url ?? null;
  useEffect(() => {
    if (!sealed || !remote || !attachment) return;
    let alive = true;
    openSealed(messageId, remote, sealed, attachment.name, attachment.mimeType).then(
      (url) => alive && setState({ url, error: '' }),
      (e) => alive && setState({ url: null, error: e instanceof Error ? e.message : t('Could not download file') }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one decryption per message
  }, [messageId, remote, sealed?.k]);
  return state;
}
