import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useQuery } from '@tanstack/react-query'
import { Card, KpiCard, SectionHeader, Badge } from '../../src/components/DesignSystem'
import { Colors, IOS, Spacing, Radius } from '../../src/theme/colors'
import { getDashboardStats } from '../../src/api/services'

const FINANCE_GROUPS = [
  {
    label: '收支概览',
    items: [
      { icon: 'stats-chart-outline', title: '收支总览', subtitle: '收入支出统计', path: '/finance/reports', color: Colors.primary },
    ],
  },
  {
    label: '应收应付',
    items: [
      { icon: 'wallet-outline', title: '应收应付', subtitle: '应收款与应付款管理', path: '/ar-ap', color: Colors.success },
      { icon: 'business-outline', title: '银行流水', subtitle: '银行账户交易明细', path: '/bank-transactions', color: Colors.info },
      { icon: 'receipt-outline', title: '发票管理', subtitle: '开票与收票记录', path: '/invoices', color: Colors.warning },
    ],
  },
  {
    label: '合同管理',
    items: [
      { icon: 'document-text-outline', title: '合同列表', subtitle: '所有合同与协议', path: '/contracts', color: Colors.primary },
    ],
  },
  {
    label: '财务报表',
    items: [
      { icon: 'trending-up-outline', title: '财务报表', subtitle: '利润表/资产负债表', path: '/finance/reports', color: Colors.success },
      { icon: 'target-outline', title: '预算管理', subtitle: '预算编制与跟踪', path: '/finance/budgets', color: Colors.warning },
      { icon: 'library-outline', title: '税务管理', subtitle: '税务申报与发票', path: '/finance/tax', color: Colors.danger },
    ],
  },
  {
    label: '备用金',
    items: [
      { icon: 'cash-outline', title: '我的备用金', subtitle: '个人备用金申请', path: '/my-petty-cash', color: Colors.success },
      { icon: 'lock-closed-outline', title: '备用金管理', subtitle: '备用金审批管理', path: '/petty-cash-admin', color: Colors.primary },
    ],
  },
  {
    label: '凭证管理',
    items: [
      { icon: 'book-outline', title: '凭证管理', subtitle: '会计凭证列表', path: '/vouchers', color: Colors.info },
    ],
  },
]

export default function FinanceScreen() {
  const router = useRouter()
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
  })

  const fmt = (v: number) => v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>财务管理</Text>
      </View>

      <Card style={styles.overviewCard}>
        <View style={styles.overviewRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.overviewLabel}>本月收入</Text>
            <Text style={[styles.overviewValue, { color: Colors.success }]}>
              ¥{fmt(stats?.monthly_revenue ?? 0)}
            </Text>
          </View>
          <View style={styles.overviewDivider} />
          <View style={{ flex: 1 }}>
            <Text style={styles.overviewLabel}>本月支出</Text>
            <Text style={[styles.overviewValue, { color: Colors.danger }]}>
              ¥{fmt(stats?.monthly_expense ?? 0)}
            </Text>
          </View>
        </View>
        <View style={[styles.overviewRow, { marginTop: 16, paddingTop: 16, borderTopWidth: 0.5, borderTopColor: IOS.separator }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.overviewLabel}>净利润</Text>
            <Text style={[styles.overviewValue, { color: (stats?.monthly_revenue ?? 0) - (stats?.monthly_expense ?? 0) >= 0 ? Colors.success : Colors.danger }]}>
              ¥{fmt((stats?.monthly_revenue ?? 0) - (stats?.monthly_expense ?? 0))}
            </Text>
          </View>
          <View style={styles.overviewDivider} />
          <View style={{ flex: 1 }}>
            <Text style={styles.overviewLabel}>应收余额</Text>
            <Text style={styles.overviewValue}>¥{fmt(stats?.total_ar ?? 0)}</Text>
          </View>
        </View>
      </Card>

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}>
          <KpiCard title="逾期应收" value={`¥${fmt(stats?.overdue_ar ?? 0)}`} icon={{ name: 'alert-circle-outline', color: Colors.danger }} color={Colors.danger} />
        </View>
        <View style={{ flex: 1 }}>
          <KpiCard title="待审批" value={String(stats?.pending_approvals ?? 0)} icon={{ name: 'clipboard-outline', color: Colors.warning }} color={Colors.warning} />
        </View>
      </View>

      {FINANCE_GROUPS.map((group) => (
        <View key={group.label}>
          <SectionHeader title={group.label} />
          <View style={styles.cardList}>
            {group.items.map((item) => (
              <Pressable key={item.path} onPress={() => router.push(item.path as `/${string}`)}>
                <Card style={styles.menuCard}>
                  <View style={styles.menuRow}>
                    <View style={[styles.menuIcon, { backgroundColor: `${item.color}12` }]}>
                      <Ionicons name={item.icon as any} size={20} color={item.color} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.menuTitle}>{item.title}</Text>
                      <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={IOS.label3} />
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  header: {
    paddingTop: 60, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md,
  },
  title: { fontSize: 28, fontWeight: '800', color: IOS.label, letterSpacing: -0.5 },
  overviewCard: {
    marginHorizontal: Spacing.xl,
    padding: Spacing.xl,
  },
  overviewRow: { flexDirection: 'row' },
  overviewDivider: {
    width: 0.5, backgroundColor: IOS.separator, marginHorizontal: Spacing.lg,
  },
  overviewLabel: {
    fontSize: 12, color: IOS.label2, fontWeight: '500', marginBottom: 4,
  },
  overviewValue: {
    fontSize: 22, fontWeight: '800', color: IOS.label, letterSpacing: -0.5,
  },
  kpiRow: {
    flexDirection: 'row', gap: Spacing.md,
    paddingHorizontal: Spacing.xl, marginTop: Spacing.md, marginBottom: Spacing.lg,
  },
  cardList: { paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  menuCard: { padding: Spacing.md },
  menuRow: { flexDirection: 'row', alignItems: 'center' },
  menuIcon: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  menuTitle: { fontSize: 16, fontWeight: '500', color: IOS.label },
  menuSubtitle: { fontSize: 12, color: IOS.label2, marginTop: 2 },
})
