import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface PettyCashAdmin {
  id: string
  applicant: string
  title: string
  amount: number
  category: string
  status: string
  created_at: string
  department: string
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'outline' }> = {
  pending: { label: '待审批', variant: 'warning' },
  approved: { label: '已审批', variant: 'success' },
  rejected: { label: '已拒绝', variant: 'danger' },
  disbursed: { label: '已发放', variant: 'default' },
}

export default function PettyCashAdminScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['petty-cash-admin'],
    queryFn: () => api.get<{ items: PettyCashAdmin[]; total: number; pending_count: number }>('/petty-cash/admin'),
  })

  const items = data?.items ?? []
  const fmt = (v: number) => v >= 10000 ? `¥${(v / 10000).toFixed(1)}万` : `¥${v.toLocaleString()}`
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <PageHeader title="备用金管理" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="待审批" value={String(data?.pending_count ?? 0)} icon={{ name: 'clipboard-outline', color: Colors.warning }} color={Colors.warning} /></View>
        <View style={{ flex: 1 }}><KpiCard title="总申请" value={String(data?.total ?? 0)} icon={{ name: 'stats-chart-outline', color: Colors.primary }} color={Colors.primary} /></View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'lock-closed-outline' }} title="暂无备用金申请" />}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              <Badge variant={STATUS_MAP[item.status]?.variant ?? 'outline'}>
                {STATUS_MAP[item.status]?.label ?? item.status}
              </Badge>
            </View>
            <Text style={styles.cardApplicant}>{item.applicant} · {item.department}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardCategory}>{item.category}</Text>
              <Text style={styles.cardAmount}>{fmt(item.amount)}</Text>
            </View>
            <Text style={styles.cardDate}>{item.created_at}</Text>
          </Card>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  kpiRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  card: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
  cardApplicant: { fontSize: 13, color: IOS.label2, marginTop: 6 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, alignItems: 'center' },
  cardCategory: { fontSize: 12, color: IOS.label2 },
  cardAmount: { fontSize: 16, fontWeight: '800', color: IOS.label },
  cardDate: { fontSize: 11, color: IOS.label2, marginTop: 6 },
})
