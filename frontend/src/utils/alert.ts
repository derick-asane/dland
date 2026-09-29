import { Alert, Platform } from 'react-native';

/** Alert.alert is a no-op in react-native-web, so fall back to the browser dialog there. */
export function showAlert(title: string, message?: string) {
  if (Platform.OS === 'web') {
    globalThis.alert?.(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
