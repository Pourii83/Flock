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

