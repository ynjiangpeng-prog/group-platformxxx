import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, IOS, Spacing, Radius } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface Procurement {
  id: string
  title: string
  supplier: string
  category: string
  amount: number
  status: string
  requester: string
  created_at: string
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'outline' }> = {
  draft: { label: '草稿', variant: 'outline' },
  pending: { label: '待审批', variant: 'warning' },
  approved: { label: '已审批', variant: 'success' },
  ordered: { label: '已下单', variant: 'default' },
  received: { label: '已收货', variant: 'success' },
  cancelled: { label: '已取消', variant: 'danger' },
}

export default function ProcurementScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['procurement'],
    queryFn: () => api.get<{ items: Procurement[]; total: number }>('/erp/procurement'),
  })

  const items = data?.items ?? []
  const fmt = (v: number) => v >= 10000 ? `¥${(v / 10000).toFixed(1)}万` : `¥${v.toLocaleString()}`
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const pendingCount = items.filter((i: Procurement) => i.status === 'pending').length

  return (
    <View style={styles.container}>
      <PageHeader title="采购管理" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="采购总数" value={String(items.length)} icon={{ name: 'cart-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="待审批" value={String(pendingCount)} icon={{ name: 'clipboard-outline', color: Colors.warning }} color={Colors.warning} /></View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'cart-outline' }} title="暂无采购记录" />}
        renderItem={({ item: p }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>{p.title}</Text>
              <Badge variant={STATUS_MAP[p.status]?.variant ?? 'outline'}>
                {STATUS_MAP[p.status]?.label ?? p.status}
              </Badge>
            </View>
            <Text style={styles.cardSupplier}><Ionicons name="business-outline" size={13} color={IOS.label2} /> {p.supplier} · {p.category}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardMeta}><Ionicons name="person-outline" size={12} color={IOS.label2} /> {p.requester} · {p.created_at}</Text>
              <Text style={styles.cardAmount}>{fmt(p.amount)}</Text>
            </View>
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
  cardSupplier: { fontSize: 13, color: IOS.label2, marginTop: 6 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: IOS.separator, alignItems: 'center' },
  cardMeta: { fontSize: 11, color: IOS.label2 },
  cardAmount: { fontSize: 14, fontWeight: '800', color: IOS.label },
})
