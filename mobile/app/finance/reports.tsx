import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, KpiCard, SectionHeader, Badge, EmptyState, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

export default function FinanceReportsScreen() {
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['finance-reports'],
    queryFn: () => api.get<{
      revenue: number; expense: number; profit: number;
      receivable: number; payable: number; cash: number;
      revenue_change: number; profit_change: number;
    }>('/finance/reports'),
  })

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const fmt = (v: number) => v >= 10000 ? `¥${(v / 10000).toFixed(1)}万` : `¥${v.toLocaleString()}`
  const d = data ?? { revenue: 0, expense: 0, profit: 0, receivable: 0, payable: 0, cash: 0, revenue_change: 0, profit_change: 0 }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <PageHeader title="财务报表" onBack={() => router.back()} />

      <Card style={styles.summaryCard}>
        <SectionHeader title="利润概览" />
        <View style={styles.summaryGrid}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>营业收入</Text>
            <Text style={[styles.summaryValue, { color: Colors.success }]}>{fmt(d.revenue)}</Text>
            <Badge variant={d.revenue_change >= 0 ? 'success' : 'danger'}>{d.revenue_change >= 0 ? '+' : ''}{d.revenue_change}%</Badge>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>营业成本</Text>
            <Text style={[styles.summaryValue, { color: Colors.danger }]}>{fmt(d.expense)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>净利润</Text>
            <Text style={[styles.summaryValue, { color: d.profit >= 0 ? Colors.success : Colors.danger }]}>{fmt(d.profit)}</Text>
            <Badge variant={d.profit_change >= 0 ? 'success' : 'danger'}>{d.profit_change >= 0 ? '+' : ''}{d.profit_change}%</Badge>
          </View>
        </View>
      </Card>

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}>
          <KpiCard title="现金余额" value={fmt(d.cash)} icon={{ name: 'business-outline', color: Colors.primary }} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <KpiCard title="应收余额" value={fmt(d.receivable)} icon={{ name: 'download-outline', color: Colors.info }} color={Colors.info} />
        </View>
      </View>
      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}>
          <KpiCard title="应付余额" value={fmt(d.payable)} icon={{ name: 'upload-outline', color: Colors.warning }} color={Colors.warning} />
        </View>
        <View style={{ flex: 1 }}>
          <KpiCard title="利润率" value={d.revenue > 0 ? `${((d.profit / d.revenue) * 100).toFixed(1)}%` : '0%'} icon={{ name: 'stats-chart-outline', color: Colors.success }} color={Colors.success} />
        </View>
      </View>

      <Card style={styles.section}>
        <SectionHeader title="报表类型" />
        {[
          { icon: 'stats-chart-outline' as const, title: '利润表', sub: '收入成本利润分析' },
          { icon: 'clipboard-outline' as const, title: '资产负债表', sub: '资产与负债状况' },
          { icon: 'wallet-outline' as const, title: '现金流量表', sub: '资金流入流出分析' },
        ].map((item) => (
          <View key={item.title} style={styles.reportRow}>
            <Ionicons name={item.icon} size={22} color={Colors.primary} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.reportTitle}>{item.title}</Text>
              <Text style={styles.reportSub}>{item.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={IOS.label3} />
          </View>
        ))}
      </Card>

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  summaryCard: { marginHorizontal: Spacing.xl, padding: Spacing.xl },
  summaryGrid: { flexDirection: 'row' },
  summaryItem: { flex: 1 },
  summaryDivider: { width: 1, backgroundColor: IOS.separator, marginHorizontal: Spacing.md },
  summaryLabel: { fontSize: 12, color: IOS.label2, fontWeight: '500', marginBottom: 4 },
  summaryValue: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  kpiRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  section: { marginHorizontal: Spacing.xl, marginBottom: Spacing.md },
  reportRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: IOS.separator },
  reportTitle: { fontSize: 14, fontWeight: '600', color: IOS.label },
  reportSub: { fontSize: 12, color: IOS.label2, marginTop: 2 },
})
