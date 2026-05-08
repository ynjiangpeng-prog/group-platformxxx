import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, IOS, Spacing, Radius } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface ErpContract {
  id: string
  contract_no: string
  name: string
  contract_type: string
  supplier: string
  total_amount: number
  paid_amount: number
  status: string
  start_date: string
  end_date: string
}

export default function ErpContractsScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['erp-contracts'],
    queryFn: () => api.get<{ items: ErpContract[]; total: number }>('/erp/contracts'),
  })

  const contracts = data?.items ?? []
  const fmt = (v: number) => v >= 10000 ? `¥${(v / 10000).toFixed(1)}万` : `¥${v.toLocaleString()}`
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <PageHeader title="ERP合同" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="合同总数" value={String(contracts.length)} icon={{ name: 'document-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="合同总额" value={fmt(contracts.reduce((s: number, c: ErpContract) => s + c.total_amount, 0))} icon={{ name: 'wallet-outline', color: Colors.success }} color={Colors.success} /></View>
      </View>

      <FlatList
        data={contracts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'document-outline' }} title="暂无ERP合同" />}
        renderItem={({ item: c }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardName} numberOfLines={1}>{c.name}</Text>
              <Badge variant={c.status === 'active' ? 'default' : c.status === 'completed' ? 'success' : 'outline'}>
                {c.status === 'active' ? '执行中' : c.status === 'completed' ? '已完成' : c.status}
              </Badge>
            </View>
            <Text style={styles.cardNo}>{c.contract_no} · {c.supplier}</Text>
            <View style={styles.cardAmounts}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardLabel}>合同金额</Text>
                <Text style={styles.cardValue}>{fmt(c.total_amount)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardLabel}>已付金额</Text>
                <Text style={[styles.cardValue, { color: Colors.success }]}>{fmt(c.paid_amount)}</Text>
              </View>
            </View>
            <Text style={styles.cardDate}>{c.start_date} → {c.end_date}</Text>
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
  cardName: { fontSize: 15, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
  cardNo: { fontSize: 12, color: IOS.label2, marginTop: 4, fontFamily: 'SpaceMono' },
  cardAmounts: { flexDirection: 'row', gap: Spacing.lg, marginTop: 12 },
  cardLabel: { fontSize: 10, color: IOS.label2, marginBottom: 2 },
  cardValue: { fontSize: 14, fontWeight: '800', color: IOS.label },
  cardDate: { fontSize: 11, color: IOS.label2, marginTop: 8 },
})
