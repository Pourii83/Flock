import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { getAuthHeaders } from './api';
import { getApiUrl } from './config';
import { t } from './i18n';

const absoluteUrl = (url: string) => `${getApiUrl()}${url}`;
const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120) || 'flock-file';

/** A URL this device made itself (a decrypted secret-chat file): no server, no auth header. */
const isLocal = (url: string) => /^(blob:|file:|data:|content:)/.test(url);

export const attachmentSource = (url: string) => (isLocal(url) ? { uri: url } : { uri: absoluteUrl(url), headers: getAuthHeaders() });

/** Downloads through the authenticated endpoint, then opens the platform share/save sheet. */
export async function openAttachment(url: string, name: string, mimeType: string) {
  if (Platform.OS === 'web' && isLocal(url)) {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    return;
  }
  if (isLocal(url)) {
    if (!(await Sharing.isAvailableAsync())) throw new Error(t('File sharing is not available on this device'));
    await Sharing.shareAsync(url, { mimeType, dialogTitle: name });
    return;
  }
  if (Platform.OS === 'web') {
    const response = await fetch(absoluteUrl(url), { headers: getAuthHeaders() });
    if (!response.ok) throw new Error(response.status === 410 ? t('File expired') : t('Could not download file'));
    const objectUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    return;
  }

  const destination = new File(Paths.cache, `${Date.now()}-${safeName(name)}`);
  const file = await File.downloadFileAsync(absoluteUrl(url), destination, { headers: getAuthHeaders(), idempotent: true });
  if (!(await Sharing.isAvailableAsync())) throw new Error(t('File sharing is not available on this device'));
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
}


/** Web: the attachment as a blob URL this tab can show or open (the server needs the auth header). */
async function attachmentBlob(url: string) {
  const response = await fetch(isLocal(url) ? url : absoluteUrl(url), isLocal(url) ? undefined : { headers: getAuthHeaders() });
  if (!response.ok) throw new Error(response.status === 410 ? t('File expired') : t('Could not download file'));
  return response.blob();
}

/** Web: opens the attachment in a new browser tab. */
export async function openAttachmentInTab(url: string) {
  // Open the tab synchronously (inside the click) so the popup blocker lets it through.
  const tab = window.open('', '_blank');
  try {
    const objectUrl = URL.createObjectURL(await attachmentBlob(url));
    if (tab) tab.location.href = objectUrl;
    else window.open(objectUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

/** Web: puts the image on the clipboard (as PNG — the one image type every browser accepts there). */
export async function copyImageAttachment(url: string) {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) throw new Error(t('Could not copy the image'));
  // Safari wants the ClipboardItem created inside the click, so it gets a promise of the blob.
  const png = attachmentBlob(url).then(async (blob) => {
    if (blob.type === 'image/png') return blob;
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(t('Could not copy the image')))), 'image/png'));
  });
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}
