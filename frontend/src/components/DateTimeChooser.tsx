import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localeTag } from '@/i18n';
import { font, spacing } from '@/theme';
import { formatDate } from '@/utils/format';
import { Chip } from './ui';

const DAYS_AHEAD = 21;
const FIRST_HOUR = 7;
const LAST_HOUR = 18;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();

/**
 * Picks a day (next three weeks) and a half-hour slot between 07:00 and 18:30, in the
 * device's time zone. Plain chips, so it works the same on phones and in the browser.
 */
export function DateTimeChooser({ value, onChange }: { value: Date | null; onChange: (d: Date) => void }) {
  const { t } = useTranslation();
  const now = new Date();
  const days = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: DAYS_AHEAD }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + i));
  }, []);
  const day = value ? startOfDay(value) : null;
  const dayLabel = new Intl.DateTimeFormat(localeTag(), { weekday: 'short', day: 'numeric', month: 'short' });

  const slots = day
    ? Array.from({ length: (LAST_HOUR - FIRST_HOUR + 1) * 2 }, (_, i) => {
        const d = new Date(day);
        d.setHours(FIRST_HOUR + Math.floor(i / 2), (i % 2) * 30, 0, 0);
        return d;
      }).filter((d) => d.getTime() > now.getTime())
    : [];
  const timeLabel = new Intl.DateTimeFormat(localeTag(), { hour: '2-digit', minute: '2-digit' });

  const pickDay = (d: Date) => {
    // Keep the chosen time when switching day, if it is still in the future.
    const next = new Date(d);
    next.setHours(value?.getHours() ?? 10, value?.getMinutes() ?? 0, 0, 0);
    // Today, once that time has passed: the first free slot.
    while (next.getTime() <= now.getTime()) next.setMinutes(next.getMinutes() + 30);
    onChange(next);
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[font.small, { marginBottom: spacing.sm }]}>{t('visit.chooseDay')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
        {days
          // Today only if there is still a slot left.
          .filter((d) => !sameDay(d, now) || now.getHours() < LAST_HOUR)
          .map((d) => (
            <Chip
              key={d.toISOString()}
              label={sameDay(d, now) ? t('visit.today') : dayLabel.format(d)}
              selected={Boolean(day && sameDay(d, day))}
              onPress={() => pickDay(d)}
            />
          ))}
      </ScrollView>
      {day ? (
        <>
          <Text style={[font.small, { marginVertical: spacing.sm }]}>{t('visit.chooseTime')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {slots.map((s) => (
              <Chip key={s.toISOString()} label={timeLabel.format(s)} selected={value?.getTime() === s.getTime()} onPress={() => onChange(s)} />
            ))}
          </View>
        </>
      ) : null}
      {value ? <Text style={[font.h3, { marginTop: spacing.md }]}>{formatDate(value, true)}</Text> : null}
    </View>
  );
}
