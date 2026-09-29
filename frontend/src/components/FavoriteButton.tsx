import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

/** Optimistic heart toggle; syncs the favorites list and search results afterwards. */
export function FavoriteButton({ landId, isFavorite, size = 20 }: { landId: string; isFavorite: boolean; size?: number }) {
  // Optimistic value while the request and the refetch are in flight; otherwise the server value wins.
  const [override, setOverride] = useState<boolean | null>(null);
  const active = override ?? isFavorite;
  const signedIn = useAuth((s) => s.status === 'signedIn');
  const queryClient = useQueryClient();

  const toggle = async () => {
    if (!signedIn) return;
    const next = !active;
    setOverride(next);
    try {
      if (next) await api.post(`/lands/${landId}/favorite`);
      else await api.delete(`/lands/${landId}/favorite`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['favorites'] }),
        queryClient.invalidateQueries({ queryKey: ['lands'] }),
        queryClient.invalidateQueries({ queryKey: ['land', landId] }),
      ]);
    } catch {
      // Request failed: dropping the override below reverts to the server value.
    } finally {
      setOverride(null);
    }
  };

  return (
    <Pressable onPress={toggle} hitSlop={10} style={styles.button} accessibilityRole="button">
      <Ionicons name={active ? 'heart' : 'heart-outline'} size={size} color={active ? colors.danger : colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 999,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
