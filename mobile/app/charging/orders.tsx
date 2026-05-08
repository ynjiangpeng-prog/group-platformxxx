import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader, SearchBar } from '../../src/components/DesignSystem'
import { Colors, IOS, Spacing, Radius } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface ChargingOrder {
  id: string
  order_no: string
  station_name: string
  device_code: string
  start_time: string
  end_time?: string
  duration_min: number
  kwh: number
  amount: number
  status: string
  user_phone?: string
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'outline' }> = {
  charging: { label: '充电中', variant: 'default' },
  completed: { label: '已完成', variant: 'success' },
  cancelled: { label: '已取消', variant: 'outline' },
  refund: { label: '已退款', variant: 'danger' },
}

export default function ChargingOrdersScreen() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['charging-orders', search],
    queryFn: () => api.get<{ items: ChargingOrder[]; total: number; today_count: number; today_revenue: number }>(`/charging/orders?keyword=${search}`),
  })

  const orders = data?.items ?? []
  const fmt = (v: number) => v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <PageHeader title="充电订单" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="今日订单" value={String(data?.today_count ?? 0)} icon={{ name: 'battery-charging-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="今日营收" value={`¥${fmt(data?.today_revenue ?? 0)}`} icon={{ name: 'wallet-outline', color: Colors.success }} color={Colors.success} /></View>
      </View>

      <View style={{ paddingHorizontal: Spacing.xl, marginBottom: Spacing.md }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="搜索订单号、站点..." />
      </View>

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'battery-charging-outline' }} title="暂无订单" />}
        renderItem={({ item: o }) => (
          <Card style={styles.orderCard}>
            <View style={styles.orderHeader}>
              <Text style={styles.orderStation} numberOfLines={1}>{o.station_name}</Text>
              <Badge variant={STATUS_MAP[o.status]?.variant ?? 'outline'}>
                {STATUS_MAP[o.status]?.label ?? o.status}
              </Badge>
            </View>
            <Text style={styles.orderNo}>{o.order_no}</Text>
            <View style={styles.orderStats}>
              <View style={{ flex: 1 }}>
                <Text style={styles.orderLabel}>电量</Text>
                <Text style={styles.orderValue}>{o.kwh?.toFixed(1) ?? 0} kWh</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.orderLabel}>时长</Text>
                <Text style={styles.orderValue}>{o.duration_min}分钟</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.orderLabel}>金额</Text>
                <Text style={[styles.orderValue, { color: Colors.primary }]}>¥{o.amount?.toFixed(2)}</Text>
              </View>
            </View>
            <Text style={styles.orderTime}>{o.start_time}{o.end_time ? ` → ${o.end_time}` : ''}</Text>
          </Card>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  kpiRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  orderCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderStation: { fontSize: 15, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
  orderNo: { fontSize: 12, color: IOS.label2, fontFamily: 'SpaceMono', marginTop: 4 },
  orderStats: { flexDirection: 'row', gap: Spacing.md, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: IOS.separator },
  orderLabel: { fontSize: 10, color: IOS.label2, marginBottom: 2 },
  orderValue: { fontSize: 14, fontWeight: '800', color: IOS.label },
  orderTime: { fontSize: 11, color: IOS.label2, marginTop: 8 },
})
