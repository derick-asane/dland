import { create } from 'zustand';

const TYPING_VISIBLE_MS = 3000;
const timers: Record<string, ReturnType<typeof setTimeout>> = {};

/** Conversations where the other person typed in the last few seconds. */
export const useTypingStore = create<{ typing: Record<string, boolean>; signal: (conversationId: string) => void }>((set) => ({
  typing: {},
  signal: (conversationId) => {
    set((s) => ({ typing: { ...s.typing, [conversationId]: true } }));
    clearTimeout(timers[conversationId]);
    timers[conversationId] = setTimeout(
      () => set((s) => ({ typing: { ...s.typing, [conversationId]: false } })),
      TYPING_VISIBLE_MS,
    );
  },
}));

export const useIsTyping = (conversationId: string | undefined) =>
  useTypingStore((s) => (conversationId ? Boolean(s.typing[conversationId]) : false));
