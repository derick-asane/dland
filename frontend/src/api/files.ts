import { Linking, Platform } from 'react-native';
import { api, fileUrl } from './client';

/**
 * Opens a private document (title deed, ID, receipt). `linkPath` is the API endpoint that checks
 * permissions and returns a short-lived signed link, e.g. `/lands/:id/documents/:docId/link`.
 */
export async function openPrivateFile(linkPath: string) {
  // Browsers block tabs opened after an await, so open it right away (still inside the tap) and
  // point it at the file once the signed link arrives.
  const tab = Platform.OS === 'web' ? globalThis.open?.('', '_blank') : null;
  if (tab) tab.opener = null;
  try {
    const { data } = await api.get<{ url: string; expiresAt: string }>(linkPath);
    const url = fileUrl(data.url) ?? '';
    if (tab) tab.location.href = url;
    else await Linking.openURL(url);
  } catch (err) {
    tab?.close();
    throw err;
  }
}
