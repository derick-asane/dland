import { useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Conversation, Message } from '@/api/types';
import { useAuth } from '@/store/auth';
import { ErrorState, Loading } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';
import { errorMessage, formatDate, fullName } from '@/utils/format';
import { getSocket } from '@/realtime/socket';
import { useIsTyping } from '@/realtime/typing';

const TYPING_SIGNAL_MS = 2000;

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const me = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const lastTypingSignal = useRef(0);
  const otherIsTyping = useIsTyping(id);

  // Tells the other person we are typing, at most every 2 seconds.
  const onChangeText = (text: string) => {
    setBody(text);
    const now = Date.now();
    if (text && now - lastTypingSignal.current > TYPING_SIGNAL_MS) {
      lastTypingSignal.current = now;
      getSocket()?.emit('typing', { conversationId: id });
    }
  };

  const query = useQuery({
    queryKey: ['messages', id],
    queryFn: async () => (await api.get<{ conversation: Conversation; items: Message[] }>(`/conversations/${id}/messages`)).data,
  });

  const send = useMutation({
    mutationFn: (text: string) => api.post(`/conversations/${id}/messages`, { body: text }),
    onSuccess: () => {
      setBody('');
      void queryClient.invalidateQueries({ queryKey: ['messages', id] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const { conversation, items } = query.data;
  const other = conversation.buyerId === me?.id ? conversation.seller : conversation.buyer;
  // "Seen" under my latest message once the other person has read it.
  const lastMine = items.find((m) => m.senderId === me?.id);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View>
              <Text style={font.h3}>{fullName(other)}</Text>
              {otherIsTyping ? (
                <Text style={{ color: colors.primary, fontSize: 12 }}>{t('messages.typing', { name: other.firstName })}</Text>
              ) : null}
            </View>
          ),
        }}
      />
      <Pressable style={styles.landBar} onPress={() => router.push(`/land/${conversation.land.id}`)}>
        <Ionicons name="map-outline" size={16} color={colors.primary} />
        <Text style={[font.small, { flex: 1, color: colors.primary }]} numberOfLines={1}>
          {conversation.land.title} · {conversation.land.reference}
        </Text>
      </Pressable>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList
          inverted
          data={items}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          ListEmptyComponent={<Text style={[font.small, { textAlign: 'center', transform: [{ scaleY: -1 }] }]}>{t('messages.noMessages')}</Text>}
          renderItem={({ item }) => {
            const mine = item.senderId === me?.id;
            return (
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <Text style={{ color: mine ? '#fff' : colors.text, fontSize: 15 }}>{item.body}</Text>
                <Text style={{ color: mine ? 'rgba(255,255,255,0.75)' : colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  {formatDate(item.createdAt, true)}
                  {item.id === lastMine?.id && item.readAt ? ` · ${t('messages.seen')}` : ''}
                </Text>
              </View>
            );
          }}
        />
        <View style={styles.composer}>
          <TextInput
            value={body}
            onChangeText={onChangeText}
            placeholder={t('messages.placeholder')}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
            maxLength={4000}
          />
          <Pressable
            onPress={() => body.trim() && send.mutate(body.trim())}
            disabled={!body.trim() || send.isPending}
            style={[styles.sendBtn, (!body.trim() || send.isPending) && { opacity: 0.5 }]}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  landBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primaryLight,
  },
  bubble: { maxWidth: '80%', padding: spacing.md, borderRadius: radius.lg },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
