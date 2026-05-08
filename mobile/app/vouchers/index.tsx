import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader, SearchBar } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface Voucher {
  id: string
  voucher_no: string
  date: string
  debit_total: number
  credit_total: number
  entries_count: number
  status: string
  creator: string
  description: string
}

export default function VouchersScreen() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['vouchers', search],
    queryFn: () => api.get<{ items: Voucher[]; total: number }>(`/finance/vouchers?keyword=${search}`),
  })

  const vouchers = data?.items ?? []
  const fmt = (v: number) => v >= 10000 ? `¥${(v / 10000).toFixed(1)}万` : `¥${v.toLocaleString()}`
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <PageHeader title="凭证管理" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="凭证总数" value={String(vouchers.length)} icon={{ name: 'book-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="借方总额" value={fmt(vouchers.reduce((s: number, v: Voucher) => s + v.debit_total, 0))} icon={{ name: 'stats-chart-outline', color: Colors.info }} color={Colors.info} /></View>
      </View>

      <SearchBar value={search} onChangeText={setSearch} />

      <FlatList
        data={vouchers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'book-outline' }} title="暂无凭证" />}
        renderItem={({ item: v }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardNo}>{v.voucher_no}</Text>
              <Badge variant={v.status === 'posted' ? 'success' : v.status === 'draft' ? 'outline' : 'warning'}>
                {v.status === 'posted' ? '已过账' : v.status === 'draft' ? '草稿' : v.status}
              </Badge>
            </View>
            <Text style={styles.cardDesc} numberOfLines={1}>{v.description}</Text>
            <View style={styles.cardAmounts}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardLabel}>借方</Text>
                <Text style={styles.cardAmount}>{fmt(v.debit_total)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardLabel}>贷方</Text>
                <Text style={styles.cardAmount}>{fmt(v.credit_total)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardLabel}>分录</Text>
                <Text style={styles.cardAmount}>{v.entries_count}条</Text>
              </View>
            </View>
            <Text style={styles.cardDate}>{v.date} · {v.creator}</Text>
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
  cardDesc: { fontSize: 12, color: IOS.label2, marginTop: 6 },
  cardAmounts: { flexDirection: 'row', gap: Spacing.md, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: IOS.separator },
  cardLabel: { fontSize: 10, color: IOS.label2, marginBottom: 2 },
  cardAmount: { fontSize: 14, fontWeight: '800', color: IOS.label },
  cardDate: { fontSize: 11, color: IOS.label2, marginTop: 8 },
})
