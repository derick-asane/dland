import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing } from '@/theme';

export interface StepItem<K extends string> {
  key: K;
  label: string;
  done: boolean;
}

/** Progress bar of the listing steps: done steps show a check, the current one is highlighted. */
export function Stepper<K extends string>({
  steps,
  current,
  onSelect,
}: {
  steps: StepItem<K>[];
  current: K;
  onSelect?: (key: K) => void;
}) {
  return (
    <View style={styles.row}>
      {steps.map((step, i) => {
        const active = step.key === current;
        return (
          <Pressable
            key={step.key}
            style={styles.item}
            onPress={() => onSelect?.(step.key)}
            disabled={!onSelect}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <View style={styles.track}>
              {/* A connector is green when the step on its left is done. */}
              <View style={[styles.line, i === 0 && styles.hidden, i > 0 && steps[i - 1].done && styles.lineDone]} />
              <View style={[styles.dot, step.done && styles.dotDone, active && styles.dotActive]}>
                {step.done && !active ? (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                ) : (
                  <Text style={[styles.number, (active || step.done) && { color: '#fff' }]}>{i + 1}</Text>
                )}
              </View>
              <View style={[styles.line, i === steps.length - 1 && styles.hidden, step.done && styles.lineDone]} />
            </View>
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {step.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  item: { flex: 1, alignItems: 'center' },
  track: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  line: { flex: 1, height: 2, backgroundColor: colors.border },
  lineDone: { backgroundColor: colors.primary },
  hidden: { opacity: 0 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  number: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  label: { marginTop: 4, fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  labelActive: { color: colors.primaryDark },
});
