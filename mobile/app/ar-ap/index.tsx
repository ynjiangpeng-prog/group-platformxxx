import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface ArApItem {
  id: string
  type: 'receivable' | 'payable'
  counterparty: string
  amount: number
  paid_amount: number
  remaining: number
  due_date: string
  status: string
  contract_no?: string
}

export default function ArApScreen() {
  const router = useRouter()
  const [tab, setTab] = useState<'receivable' | 'payable'>('receivable')
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ar-ap', tab],
    queryFn: () => api.get<{ items: ArApItem[]; total: number }>(`/finance/ar-ap?type=${tab}`),
  })

  const items = data?.items ?? []
  const fmt = (v: number) => v >= 10000 ? `¥${(v / 10000).toFixed(1)}万` : `¥${v.toLocaleString()}`
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  const totalRemaining = items.reduce((s: number, i: ArApItem) => s + i.remaining, 0)
  const overdueCount = items.filter((i: ArApItem) => i.status === 'overdue').length

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <PageHeader title="应收应付" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}>
          <KpiCard title={tab === 'receivable' ? '应收余额' : '应付余额'} value={fmt(totalRemaining)} icon={{ name: 'wallet-outline', color: tab === 'receivable' ? Colors.primary : Colors.warning }} color={tab === 'receivable' ? Colors.primary : Colors.warning} />
        </View>
        <View style={{ flex: 1 }}>
          <KpiCard title="逾期笔数" value={String(overdueCount)} icon={{ name: 'alert-circle-outline', color: Colors.danger }} color={Colors.danger} />
        </View>
      </View>

      <View style={styles.tabRow}>
        <Pressable style={[styles.tab, tab === 'receivable' && styles.tabActive]} onPress={() => setTab('receivable')}>
          <Text style={[styles.tabText, tab === 'receivable' && styles.tabTextActive]}>应收款</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'payable' && styles.tabActive]} onPress={() => setTab('payable')}>
          <Text style={[styles.tabText, tab === 'payable' && styles.tabTextActive]}>应付款</Text>
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'wallet-outline' }} title={`暂无${tab === 'receivable' ? '应收' : '应付'}记录`} />}
        renderItem={({ item }) => (
          <Card style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemParty} numberOfLines={1}>{item.counterparty}</Text>
              <Badge variant={item.status === 'overdue' ? 'danger' : item.status === 'paid' ? 'success' : 'outline'}>
                {item.status === 'overdue' ? '逾期' : item.status === 'paid' ? '已结清' : '待收'}
              </Badge>
            </View>
            <View style={styles.itemAmounts}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemLabel}>总金额</Text>
                <Text style={styles.itemAmount}>{fmt(item.amount)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemLabel}>已收/付</Text>
                <Text style={[styles.itemAmount, { color: Colors.success }]}>{fmt(item.paid_amount)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemLabel}>剩余</Text>
                <Text style={[styles.itemAmount, { color: item.remaining > 0 ? Colors.danger : Colors.success }]}>{fmt(item.remaining)}</Text>
              </View>
            </View>
            <Text style={styles.itemDue}>到期日: {item.due_date}{item.contract_no ? ` · 合同: ${item.contract_no}` : ''}</Text>
          </Card>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  kpiRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  tabRow: { flexDirection: 'row', marginHorizontal: Spacing.xl, marginBottom: Spacing.md, backgroundColor: '#FFFFFF', borderRadius: Radius.md, padding: 3, borderWidth: 1, borderColor: IOS.separator },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.sm },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: IOS.label2 },
  tabTextActive: { color: '#FFFFFF' },
  itemCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemParty: { fontSize: 15, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
  itemAmounts: { flexDirection: 'row', gap: Spacing.md, marginTop: 12 },
  itemLabel: { fontSize: 10, color: IOS.label2, marginBottom: 2 },
  itemAmount: { fontSize: 14, fontWeight: '800', color: IOS.label },
  itemDue: { fontSize: 11, color: IOS.label2, marginTop: 8 },
})
