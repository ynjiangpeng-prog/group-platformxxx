import Ionicons from '@expo/vector-icons/Ionicons'
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface PettyCash {
  id: string
  title: string
  amount: number
  category: string
  status: string
  created_at: string
  approved_by?: string
  description?: string
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'outline' }> = {
  pending: { label: '待审批', variant: 'warning' },
  approved: { label: '已审批', variant: 'success' },
  rejected: { label: '已拒绝', variant: 'danger' },
  disbursed: { label: '已发放', variant: 'default' },
  reconciled: { label: '已核销', variant: 'success' },
}

export default function MyPettyCashScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-petty-cash'],
    queryFn: () => api.get<{ items: PettyCash[]; total: number; balance: number }>('/petty-cash/my'),
  })

  const items = data?.items ?? []
  const fmt = (v: number) => v >= 10000 ? `¥${(v / 10000).toFixed(1)}万` : `¥${v.toLocaleString()}`
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <PageHeader title="我的备用金" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="当前余额" value={fmt(data?.balance ?? 0)} icon={{ name: 'wallet-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="申请数" value={String(data?.total ?? 0)} icon={{ name: 'clipboard-outline', color: Colors.warning }} color={Colors.warning} /></View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'wallet-outline' }} title="暂无备用金记录" />}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              <Badge variant={STATUS_MAP[item.status]?.variant ?? 'outline'}>
                {STATUS_MAP[item.status]?.label ?? item.status}
              </Badge>
            </View>
            <Text style={styles.cardCategory}>{item.category}</Text>
            <View style={styles.cardAmountRow}>
              <Text style={styles.cardLabel}>金额</Text>
              <Text style={styles.cardAmount}>{fmt(item.amount)}</Text>
            </View>
            {item.approved_by && <Text style={styles.cardApprover}>审批人: {item.approved_by}</Text>}
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
  cardCategory: { fontSize: 12, color: IOS.label2, marginTop: 4 },
  cardAmountRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  cardLabel: { fontSize: 12, color: IOS.label2 },
  cardAmount: { fontSize: 16, fontWeight: '800', color: IOS.label },
  cardApprover: { fontSize: 11, color: IOS.label2, marginTop: 6 },
  cardDate: { fontSize: 11, color: IOS.label2, marginTop: 4 },
})
