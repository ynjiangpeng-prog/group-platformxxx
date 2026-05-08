import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, IOS, Spacing, Radius } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface PurchaseOrder {
  id: string
  order_no: string
  supplier: string
  total_amount: number
  items_count: number
  status: string
  created_at: string
  expected_date?: string
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'outline' }> = {
  draft: { label: '草稿', variant: 'outline' },
  pending: { label: '待确认', variant: 'warning' },
  confirmed: { label: '已确认', variant: 'default' },
  shipped: { label: '已发货', variant: 'info' as unknown as 'default' },
  received: { label: '已收货', variant: 'success' },
  cancelled: { label: '已取消', variant: 'danger' },
}

export default function PurchaseOrdersScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => api.get<{ items: PurchaseOrder[]; total: number }>('/erp/purchase-orders'),
  })

  const orders = data?.items ?? []
  const fmt = (v: number) => v >= 10000 ? `¥${(v / 10000).toFixed(1)}万` : `¥${v.toLocaleString()}`
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <PageHeader title="采购订单" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="订单总数" value={String(orders.length)} icon={{ name: 'clipboard-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="总金额" value={fmt(orders.reduce((s: number, o: PurchaseOrder) => s + o.total_amount, 0))} icon={{ name: 'wallet-outline', color: Colors.success }} color={Colors.success} /></View>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'clipboard-outline' }} title="暂无采购订单" />}
        renderItem={({ item: o }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardNo}>{o.order_no}</Text>
              <Badge variant={STATUS_MAP[o.status]?.variant ?? 'outline'}>
                {STATUS_MAP[o.status]?.label ?? o.status}
              </Badge>
            </View>
            <Text style={styles.cardSupplier}>{o.supplier} · {o.items_count}项</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardDate}>{o.created_at}{o.expected_date ? ` → ${o.expected_date}` : ''}</Text>
              <Text style={styles.cardAmount}>{fmt(o.total_amount)}</Text>
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
  cardNo: { fontSize: 14, fontWeight: '700', color: IOS.label, fontFamily: 'SpaceMono' },
  cardSupplier: { fontSize: 13, color: IOS.label2, marginTop: 6 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: IOS.separator, alignItems: 'center' },
  cardDate: { fontSize: 11, color: IOS.label2 },
  cardAmount: { fontSize: 14, fontWeight: '800', color: IOS.label },
})
