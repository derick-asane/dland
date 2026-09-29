import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Block, LandHistory } from '@/api/types';
import { Avatar, Badge, Banner, EmptyState, ErrorState, KeyValue, Loading, Row, Screen } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';
import { errorMessage, formatDate, formatMoney, shortHash } from '@/utils/format';

/** Timeline of the land's chain blocks: registration, then every change of owner. */
export default function LandHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['history', id],
    queryFn: async () => (await api.get<LandHistory>(`/chain/lands/${id}/history`)).data,
  });

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const { blocks, parties, valid, land } = query.data;
  const partyName = (wallet: unknown) => {
    const p = parties.find((x) => x.walletAddress === wallet);
    return p ? { name: `${p.firstName} ${p.lastName}`, avatarUrl: p.avatarUrl, id: p.id } : null;
  };

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <Text style={font.h2}>{land.title}</Text>
      <Text style={[font.small, { marginBottom: spacing.lg }]}>{land.reference}</Text>
      {blocks.length > 0 ? (
        <Banner
          tone={valid ? 'success' : 'danger'}
          icon={valid ? 'shield-checkmark' : 'warning'}
          text={valid ? t('history.integrityOk') : t('history.integrityBroken')}
        />
      ) : null}
      {blocks.length === 0 ? <EmptyState icon="cube-outline" text={t('history.empty')} /> : null}
      {blocks.map((block, i) => (
        <TimelineItem key={block.id} block={block} last={i === blocks.length - 1} partyName={partyName} />
      ))}
    </Screen>
  );
}

function Party({ label, party, wallet }: { label: string; party: { name: string; avatarUrl: string | null; id: string } | null; wallet: unknown }) {
  return (
    <Pressable onPress={() => party && router.push(`/user/${party.id}`)} style={{ marginTop: spacing.sm }}>
      <Text style={font.small}>{label}</Text>
      <Row>
        <Avatar url={party?.avatarUrl} name={party?.name ?? '?'} size={28} />
        <View style={{ flex: 1 }}>
          <Text style={font.body}>{party?.name ?? '—'}</Text>
          <Text style={[font.mono, { color: colors.textMuted }]}>{shortHash(String(wallet), 10)}</Text>
        </View>
      </Row>
    </Pressable>
  );
}

function TimelineItem({
  block,
  last,
  partyName,
}: {
  block: Block;
  last: boolean;
  partyName: (wallet: unknown) => { name: string; avatarUrl: string | null; id: string } | null;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const d = block.data;
  const isTransfer = block.type === 'OWNERSHIP_TRANSFERRED';
  const documents = Array.isArray(d.documents) ? (d.documents as { type: string; sha256: string }[]) : [];

  return (
    <View style={styles.item}>
      <View style={styles.rail}>
        <View style={[styles.dot, { backgroundColor: block.verified ? colors.chain : colors.danger }]}>
          <Ionicons
            name={
              isTransfer
                ? 'swap-horizontal'
                : block.type === 'PAYMENT_CONFIRMED'
                  ? 'cash-outline'
                  : block.type === 'REGISTRY_RECORDED'
                    ? 'library-outline'
                    : 'flag'
            }
            size={14}
            color="#fff"
          />
        </View>
        {!last ? <View style={styles.line} /> : null}
      </View>
      <View style={styles.card}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={font.h3}>{t(`blockType.${block.type}`)}</Text>
          <Badge
            label={block.verified ? t('history.verified') : t('history.tampered')}
            tone={block.verified ? 'success' : 'danger'}
            icon={block.verified ? 'checkmark' : 'close'}
          />
        </Row>
        <Text style={font.small}>
          {t('history.block', { index: block.index })} · {formatDate(block.timestamp, true)}
        </Text>

        {isTransfer ? (
          <>
            <Party label={t('history.from')} party={partyName(d.from)} wallet={d.from} />
            <Party label={t('history.to')} party={partyName(d.to)} wallet={d.to} />
            {d.price ? (
              <Text style={[font.h3, { marginTop: spacing.sm }]}>{formatMoney(String(d.price), String(d.currency ?? 'USD'))}</Text>
            ) : null}
          </>
        ) : block.type === 'PAYMENT_CONFIRMED' ? (
          <View style={{ marginTop: spacing.sm }}>
            <Text style={font.small}>{t(`stepType.${String(d.step) as 'DEPOSIT'}`)}</Text>
            {d.amount ? <Text style={font.h3}>{formatMoney(String(d.amount), String(d.currency ?? 'USD'))}</Text> : null}
            {d.receiptSha256 ? (
              <Text style={[font.mono, { color: colors.textMuted }]}>SHA-256 {shortHash(String(d.receiptSha256), 12)}</Text>
            ) : null}
          </View>
        ) : block.type === 'REGISTRY_RECORDED' ? (
          <>
            <Text style={[font.body, { marginTop: spacing.sm }]}>
              {t('history.registry')}: {String(d.registryReference)}
            </Text>
            <Party label={t('history.owner')} party={partyName(d.owner)} wallet={d.owner} />
          </>
        ) : (
          <Party label={t('history.owner')} party={partyName(d.owner)} wallet={d.owner} />
        )}

        <Pressable onPress={() => setOpen((o) => !o)} style={{ marginTop: spacing.md }}>
          <Text style={{ color: colors.chain, fontWeight: '600' }}>
            {open ? '▾' : '▸'} {t('history.rawData')}
          </Text>
        </Pressable>
        {open ? (
          <View style={{ marginTop: spacing.sm }}>
            <KeyValue label={t('history.hash')} value={shortHash(block.hash, 16)} mono />
            <KeyValue label={t('history.previousHash')} value={shortHash(block.previousHash, 16)} mono />
            <KeyValue label={t('history.dataHash')} value={shortHash(block.dataHash, 16)} mono />
            <KeyValue label={t('history.nonce')} value={String(block.nonce)} mono />
            <KeyValue label={t('history.signature')} value={shortHash(block.signature, 16)} mono />
            {block.signer ? <KeyValue label={t('history.signedBy')} value={`${block.signer.firstName} ${block.signer.lastName}`} /> : null}
            {block.anchorTxHash ? <KeyValue label={t('history.anchored')} value={shortHash(block.anchorTxHash, 12)} mono /> : null}
            {documents.length > 0 ? (
              <>
                <Text style={[font.small, { marginTop: spacing.sm }]}>{t('history.documents')}</Text>
                {documents.map((doc) => (
                  <Text key={doc.sha256} style={font.mono}>
                    {doc.type}: {shortHash(doc.sha256, 12)}
                  </Text>
                ))}
              </>
            ) : null}
            <Pressable onPress={() => router.push(`/chain/${block.hash}`)} style={{ marginTop: spacing.sm }}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('chain.explorer')} →</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', gap: spacing.md },
  rail: { alignItems: 'center', width: 28 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, width: 2, backgroundColor: colors.chainLight, marginVertical: 2 },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
