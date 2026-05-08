import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, IOS, Spacing, Radius } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface CounterpartyFlow {
  id: string
  counterparty: string
  direction: 'in' | 'out'
  amount: number
  balance: number
  category: string
  date: string
  description: string
}

export default function CounterpartyFlowScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['counterparty-flow'],
    queryFn: () => api.get<{ items: CounterpartyFlow[]; total: number }>('/erp/counterparty-flow'),
  })

  const items = data?.items ?? []
  const fmt = (v: number) => v >= 10000 ? `¥${(v / 10000).toFixed(1)}万` : `¥${v.toLocaleString()}`
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const totalIn = items.filter((i: CounterpartyFlow) => i.direction === 'in').reduce((s: number, i: CounterpartyFlow) => s + i.amount, 0)
  const totalOut = items.filter((i: CounterpartyFlow) => i.direction === 'out').reduce((s: number, i: CounterpartyFlow) => s + i.amount, 0)

  return (
    <View style={styles.container}>
      <PageHeader title="对手方流水" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="流入总额" value={fmt(totalIn)} icon={{ name: 'download-outline', color: Colors.success }} color={Colors.success} /></View>
        <View style={{ flex: 1 }}><KpiCard title="流出总额" value={fmt(totalOut)} icon={{ name: 'upload-outline', color: Colors.danger }} color={Colors.danger} /></View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'sync-outline' }} title="暂无流水记录" />}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardParty} numberOfLines={1}>{item.counterparty}</Text>
                <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text>
              </View>
              <Text style={[styles.cardAmount, { color: item.direction === 'in' ? Colors.success : Colors.danger }]}>
                {item.direction === 'in' ? '+' : '-'}{fmt(item.amount)}
              </Text>
            </View>
            <View style={styles.cardFooter}>
              <Text style={styles.cardMeta}>{item.category}</Text>
              <Text style={styles.cardMeta}>余额: {fmt(item.balance)}</Text>
            </View>
            <Text style={styles.cardDate}>{item.date}</Text>
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
  cardParty: { fontSize: 14, fontWeight: '700', color: IOS.label },
  cardDesc: { fontSize: 12, color: IOS.label2, marginTop: 2 },
  cardAmount: { fontSize: 16, fontWeight: '800' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  cardMeta: { fontSize: 11, color: IOS.label2 },
  cardDate: { fontSize: 11, color: IOS.label2, marginTop: 4 },
})
