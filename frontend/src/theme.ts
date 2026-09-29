export const colors = {
  primary: '#1B7F5A',
  primaryDark: '#12583E',
  primaryLight: '#E3F3EC',
  accent: '#E8A33D',
  background: '#F6F7F5',
  surface: '#FFFFFF',
  text: '#1C2421',
  textMuted: '#6B7570',
  border: '#E1E5E2',
  danger: '#C8423B',
  dangerLight: '#FBE9E8',
  warning: '#B7791F',
  warningLight: '#FDF3E1',
  info: '#2B6CB0',
  infoLight: '#E6F0FA',
  chain: '#5B4BC4',
  chainLight: '#EEEBFB',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 };

export const font = {
  h1: { fontSize: 26, fontWeight: '700' as const, color: colors.text },
  h2: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  h3: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.textMuted },
  mono: { fontFamily: 'monospace', fontSize: 12, color: colors.text },
};
