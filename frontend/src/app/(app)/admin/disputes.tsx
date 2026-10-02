import { DisputeList } from '@/components/DisputeList';
import { Screen } from '@/components/ui';
import { spacing } from '@/theme';

/** Admin oversight of every ownership dispute (notaries make the decisions). */
export default function AdminDisputesScreen() {
  return (
    <Screen scroll={false} contentStyle={{ padding: spacing.lg }}>
      <DisputeList />
    </Screen>
  );
}
