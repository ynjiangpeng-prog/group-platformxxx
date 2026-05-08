import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, KpiCard, SectionHeader, Badge, ProgressBar, EmptyState, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

export default function ExecutiveScreen() {
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['executive-dashboard'],
    queryFn: () => api.get<{
      company_health: number
      revenue: { this_month: number; last_month: number; change_pct: number }
      profit: { this_month: number; margin_pct: number }
      projects: { active: number; delayed: number; total_budget: number; budget_usage_pct: number }
      stations: { active: number; total: number; monthly_revenue: number }
      finance: { cash: number; ar: number; ap: number; overdue_ar: number }
      alerts: { level: string; title: string }[]
    }>('/executive/dashboard'),
  })

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const d = data!
  const fmt = (v: number) => v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <PageHeader title="高管看板" onBack={() => router.back()} />

      {/* Company Health */}
      <Card style={styles.healthCard}>
        <View style={styles.healthTop}>
          <Text style={styles.healthLabel}>企业健康指数</Text>
          <Badge variant={d?.company_health ?? 0 >= 80 ? 'success' : d?.company_health ?? 0 >= 60 ? 'warning' : 'danger'}>
            {d?.company_health ?? 0}分
          </Badge>
        </View>
        <ProgressBar value={d?.company_health ?? 0} color={d?.company_health ?? 0 >= 80 ? Colors.success : d?.company_health ?? 0 >= 60 ? Colors.warning : Colors.danger} />
      </Card>

      {/* Revenue & Profit */}
      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}>
          <KpiCard
            title="本月营收"
            value={d ? `¥${fmt(d.revenue.this_month)}` : '—'}
            icon={{ name: 'wallet-outline', color: Colors.success }}
            color={Colors.success}
            trend={d ? { value: d.revenue.change_pct, label: 'vs 上月' } : undefined}
          />
        </View>
        <View style={{ flex: 1 }}>
          <KpiCard
            title="净利润"
            value={d ? `¥${fmt(d.profit.this_month)}` : '—'}
            icon={{ name: 'stats-chart-outline', color: Colors.info }}
            color={Colors.info}
            subtitle={d ? `利润率 ${d.profit.margin_pct}%` : undefined}
          />
        </View>
      </View>

      {/* Projects */}
      <Card style={styles.section}>
        <SectionHeader title="项目概览" />
        <View style={styles.statGrid}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>进行中</Text>
            <Text style={styles.statValue}>{d?.projects.active ?? 0}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>延期</Text>
            <Text style={[styles.statValue, { color: Colors.danger }]}>{d?.projects.delayed ?? 0}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>预算使用</Text>
            <Text style={styles.statValue}>{d?.projects.budget_usage_pct ?? 0}%</Text>
          </View>
        </View>
      </Card>

      {/* Stations */}
      <Card style={styles.section}>
        <SectionHeader title="充电站" />
        <View style={styles.statGrid}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>运营中</Text>
            <Text style={styles.statValue}>{d?.stations.active ?? 0}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>站点总数</Text>
            <Text style={styles.statValue}>{d?.stations.total ?? 0}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>月营收</Text>
            <Text style={styles.statValue}>¥{fmt(d?.stations.monthly_revenue ?? 0)}</Text>
          </View>
        </View>
      </Card>

      {/* Finance */}
      <Card style={styles.section}>
        <SectionHeader title="财务状况" />
        <View style={styles.statGrid}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>现金</Text>
            <Text style={[styles.statValue, { color: Colors.success }]}>¥{fmt(d?.finance.cash ?? 0)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>应收</Text>
            <Text style={styles.statValue}>¥{fmt(d?.finance.ar ?? 0)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>应付</Text>
            <Text style={styles.statValue}>¥{fmt(d?.finance.ap ?? 0)}</Text>
          </View>
        </View>
        {(d?.finance.overdue_ar ?? 0) > 0 && (
          <View style={styles.warningRow}>
            <Ionicons name="alert-circle-outline" size={14} color={Colors.danger} />
            <Text style={{ fontSize: 12, color: Colors.danger, fontWeight: '600', marginLeft: 4 }}>
              逾期应收 ¥{fmt(d?.finance.overdue_ar ?? 0)}
            </Text>
          </View>
        )}
      </Card>

      {/* Alerts */}
      {(d?.alerts?.length ?? 0) > 0 && (
        <Card style={styles.section}>
          <SectionHeader title="重要告警" />
          {d!.alerts.slice(0, 5).map((alert, i) => (
            <View key={i} style={styles.alertRow}>
              <Badge variant={alert.level === 'critical' ? 'danger' : alert.level === 'warning' ? 'warning' : 'info'}>
                {alert.level === 'critical' ? '严重' : alert.level === 'warning' ? '警告' : '信息'}
              </Badge>
              <Text style={styles.alertTitle} numberOfLines={1}>{alert.title}</Text>
            </View>
          ))}
        </Card>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  healthCard: { marginHorizontal: Spacing.xl, padding: Spacing.xl },
  healthTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  healthLabel: { fontSize: 14, fontWeight: '700', color: IOS.label },
  kpiRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  section: { marginHorizontal: Spacing.xl, marginBottom: Spacing.md },
  statGrid: { flexDirection: 'row', gap: Spacing.lg },
  statLabel: { fontSize: 11, color: IOS.label2, marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: '800', color: IOS.label },
  warningRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.dangerBg, borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.md },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: IOS.separator },
  alertTitle: { fontSize: 13, color: IOS.label, flex: 1, marginLeft: 4 },
})
