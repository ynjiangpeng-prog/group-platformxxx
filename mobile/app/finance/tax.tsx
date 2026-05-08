import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, KpiCard, SectionHeader, Badge, EmptyState, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface TaxItem {
  id: string
  tax_type: string
  period: string
  amount: number
  status: string
  due_date: string
}

export default function TaxScreen() {
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['tax'],
    queryFn: () => api.get<{ items: TaxItem[]; total_tax: number; pending_count: number; paid_total: number }>('/finance/tax'),
  })

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const items = data?.items ?? []
  const fmt = (v: number) => v >= 10000 ? `¥${(v / 10000).toFixed(1)}万` : `¥${v.toLocaleString()}`

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <PageHeader title="税务管理" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="应缴总额" value={fmt(data?.total_tax ?? 0)} icon={{ name: 'business-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="待申报" value={String(data?.pending_count ?? 0)} icon={{ name: 'clipboard-outline', color: Colors.warning }} color={Colors.warning} /></View>
      </View>
      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="已缴总额" value={fmt(data?.paid_total ?? 0)} icon={{ name: 'checkmark-circle-outline', color: Colors.success }} color={Colors.success} /></View>
      </View>

      <SectionHeader title="税务记录" />
      {items.length === 0 ? (
        <EmptyState icon={{ name: 'business-outline' }} title="暂无税务记录" />
      ) : (
        items.map((item) => (
          <Card key={item.id} style={styles.taxCard}>
            <View style={styles.taxHeader}>
              <Text style={styles.taxType}>{item.tax_type}</Text>
              <Badge variant={item.status === 'paid' ? 'success' : item.status === 'overdue' ? 'danger' : 'warning'}>
                {item.status === 'paid' ? '已缴纳' : item.status === 'overdue' ? '逾期' : '待申报'}
              </Badge>
            </View>
            <View style={styles.taxRow}>
              <Text style={styles.taxLabel}>应缴金额</Text>
              <Text style={styles.taxAmount}>{fmt(item.amount)}</Text>
            </View>
            <View style={styles.taxRow}>
              <Text style={styles.taxLabel}>税款期间</Text>
              <Text style={styles.taxMeta}>{item.period}</Text>
            </View>
            <View style={styles.taxRow}>
              <Text style={styles.taxLabel}>截止日期</Text>
              <Text style={styles.taxMeta}>{item.due_date}</Text>
            </View>
          </Card>
        ))
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  kpiRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  taxCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  taxHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  taxType: { fontSize: 15, fontWeight: '700', color: IOS.label },
  taxRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  taxLabel: { fontSize: 12, color: IOS.label2 },
  taxAmount: { fontSize: 14, fontWeight: '700', color: IOS.label },
  taxMeta: { fontSize: 12, color: IOS.label2 },
})
