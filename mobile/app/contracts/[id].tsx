import Ionicons from '@expo/vector-icons/Ionicons'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Card, Badge, SectionHeader, ProgressBar, EmptyState, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'outline' }> = {
  draft: { label: '草稿', variant: 'outline' },
  pending: { label: '待审批', variant: 'warning' },
  active: { label: '执行中', variant: 'default' },
  completed: { label: '已完成', variant: 'success' },
  terminated: { label: '已终止', variant: 'danger' },
}

export default function ContractDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const { data: contract, isLoading } = useQuery({
    queryKey: ['contract', id],
    queryFn: () => api.get<{
      id: string; contract_no: string; name: string; contract_type: string;
      status: string; total_amount?: number; paid_amount: number;
      start_date?: string; end_date?: string; party_a?: string; party_b?: string;
      description?: string;
    }>(`/contracts/${id}`),
    enabled: !!id,
  })

  if (isLoading || !contract) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    )
  }

  const fmt = (v: number) => v >= 10000 ? `¥${(v / 10000).toFixed(1)}万` : `¥${v.toLocaleString()}`
  const total = contract.total_amount ?? 0
  const paid = contract.paid_amount ?? 0
  const payProgress = total > 0 ? (paid / total) * 100 : 0
  const statusInfo = STATUS_MAP[contract.status] ?? { label: contract.status, variant: 'outline' as const }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <PageHeader title="合同详情" onBack={() => router.back()} />

      <Card style={styles.heroCard}>
        <Text style={styles.contractName}>{contract.name}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          <Badge variant="outline">{contract.contract_type}</Badge>
        </View>
        <Text style={styles.contractNo}>{contract.contract_no}</Text>
      </Card>

      <Card style={styles.section}>
        <SectionHeader title="付款进度" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}><ProgressBar value={payProgress} color={Colors.primary} /></View>
          <Text style={styles.progressText}>{payProgress.toFixed(0)}%</Text>
        </View>
        <View style={styles.amountGrid}>
          <View style={{ flex: 1 }}>
            <Text style={styles.amountLabel}>合同金额</Text>
            <Text style={styles.amountValue}>{fmt(total)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.amountLabel}>已付金额</Text>
            <Text style={[styles.amountValue, { color: Colors.success }]}>{fmt(paid)}</Text>
          </View>
        </View>
      </Card>

      <Card style={styles.section}>
        <SectionHeader title="基本信息" />
        <InfoRow label="合同编号" value={contract.contract_no || '-'} />
        <InfoRow label="甲方" value={contract.party_a ?? '-'} />
        <InfoRow label="乙方" value={contract.party_b ?? '-'} />
        <InfoRow label="开始日期" value={contract.start_date ?? '-'} />
        <InfoRow label="结束日期" value={contract.end_date ?? '-'} />
        {contract.description && <InfoRow label="描述" value={contract.description} />}
      </Card>

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  heroCard: { marginHorizontal: Spacing.xl, padding: Spacing.xl },
  contractName: { fontSize: 20, fontWeight: '800', color: IOS.label },
  contractNo: { fontSize: 13, color: IOS.label2, fontFamily: 'SpaceMono', marginTop: 6 },
  section: { marginHorizontal: Spacing.xl, marginBottom: Spacing.md },
  progressText: { fontSize: 14, fontWeight: '800', color: Colors.primary, fontFamily: 'SpaceMono' },
  amountGrid: { flexDirection: 'row', gap: Spacing.lg, marginTop: 12 },
  amountLabel: { fontSize: 11, color: IOS.label2, marginBottom: 2 },
  amountValue: { fontSize: 18, fontWeight: '800', color: IOS.label },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: IOS.separator,
  },
  infoLabel: { fontSize: 13, color: IOS.label2, fontWeight: '500' },
  infoValue: { fontSize: 13, color: IOS.label, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: 20 },
})
