import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, KpiCard, SectionHeader, Badge, ProgressBar, EmptyState, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface Budget {
  id: string
  name: string
  department: string
  total_budget: number
  used_amount: number
  period: string
  status: string
}

export default function BudgetsScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['budgets'],
    queryFn: () => api.get<{ items: Budget[]; total: number }>('/finance/budgets'),
  })

  const budgets = data?.items ?? []
  const fmt = (v: number) => v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  const totalBudget = budgets.reduce((s: number, b: Budget) => s + b.total_budget, 0)
  const totalUsed = budgets.reduce((s: number, b: Budget) => s + b.used_amount, 0)

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <PageHeader title="预算管理" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="总预算" value={`¥${fmt(totalBudget)}`} icon={{ name: 'target-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="已使用" value={`¥${fmt(totalUsed)}`} icon={{ name: 'wallet-outline', color: Colors.warning }} color={Colors.warning} /></View>
      </View>

      <FlatList
        data={budgets}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'target-outline' }} title="暂无预算" subtitle="预算数据为空" />}
        renderItem={({ item: b }) => {
          const pct = b.total_budget > 0 ? (b.used_amount / b.total_budget) * 100 : 0
          return (
            <Card style={styles.budgetCard}>
              <View style={styles.budgetHeader}>
                <Text style={styles.budgetName} numberOfLines={1}>{b.name}</Text>
                <Badge variant={pct > 90 ? 'danger' : pct > 70 ? 'warning' : 'success'}>
                  {pct.toFixed(0)}%
                </Badge>
              </View>
              <Text style={styles.budgetMeta}>{b.department} · {b.period}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <ProgressBar value={pct} color={pct > 90 ? Colors.danger : pct > 70 ? Colors.warning : Colors.primary} />
              </View>
              <View style={styles.budgetFooter}>
                <Text style={styles.budgetAmount}>已用 ¥{fmt(b.used_amount)}</Text>
                <Text style={styles.budgetAmount}>预算 ¥{fmt(b.total_budget)}</Text>
              </View>
            </Card>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  kpiRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  budgetCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  budgetName: { fontSize: 15, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
  budgetMeta: { fontSize: 12, color: IOS.label2, marginTop: 4 },
  budgetFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  budgetAmount: { fontSize: 12, color: IOS.label2, fontWeight: '600' },
})
