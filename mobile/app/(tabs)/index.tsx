import { ScrollView, View, Text, StyleSheet, RefreshControl, Pressable, Dimensions } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { LinearGradient } from 'expo-linear-gradient'
import { Card, KpiCard, SectionHeader, ProgressBar, Badge, QuickAction, EmptyState } from '../../src/components/DesignSystem'
import { Colors, Gradients, IOS, Spacing, Radius, Shadows } from '../../src/theme/colors'
import { getAutopilotDashboard, getAlerts } from '../../src/api/services'
import type { Alert, AutopilotDashboard } from '../../src/api/types'

const { width: SCREEN_W } = Dimensions.get('window')

export default function DashboardScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data: dashboard, isLoading, refetch } = useQuery({
    queryKey: ['autopilot'],
    queryFn: getAutopilotDashboard,
  })

  const { data: alertsData } = useQuery({
    queryKey: ['alerts'],
    queryFn: getAlerts,
  })

  const onRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  if (isLoading || !dashboard) {
    return <LoadingSkeleton />
  }

  const m = dashboard.quick_metrics
  const fmt = (v: number) => v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()
  const alerts = alertsData?.alerts ?? []

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero Gradient Header */}
      <LinearGradient
        colors={Gradients.hero as unknown as [string, string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroGradient}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>经营仪表盘</Text>
            <Text style={styles.date}>
              {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}
            </Text>
          </View>
          <View style={[styles.statusChip, { backgroundColor: dashboard.company_status === 'green' ? 'rgba(5,150,105,0.2)' : 'rgba(220,38,38,0.2)' }]}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: dashboard.company_status === 'green' ? '#6EE7B7' : '#FCA5A5' }}>
              {dashboard.company_status === 'green' ? '● 一切正常' : '● 需要关注'}
            </Text>
          </View>
        </View>

        {/* Hero Stats */}
        <View style={styles.heroCard}>
          <View style={styles.heroGrid}>
            <View style={styles.heroItem}>
              <Text style={styles.heroLabel}>现金余额</Text>
              <Text style={[styles.heroValue, { color: m.cash_balance < 50000 ? '#FCA5A5' : '#6EE7B7' }]}>
                ¥{fmt(m.cash_balance)}
              </Text>
              <Text style={styles.heroSub}>今日收入 ¥{fmt(m.today_income)}</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroItem}>
              <Text style={styles.heroLabel}>本月利润</Text>
              <Text style={[styles.heroValue, { color: m.month_profit >= 0 ? '#6EE7B7' : '#FCA5A5' }]}>
                ¥{fmt(m.month_profit)}
              </Text>
              {m.income_change_pct !== undefined && (
                <View style={{ marginTop: 4 }}>
                  <Badge variant={m.income_change_pct >= 0 ? 'success' : 'danger'}>
                    {m.income_change_pct >= 0 ? '+' : ''}{m.income_change_pct}%
                  </Badge>
                </View>
              )}
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* KPI Grid */}
      <View style={styles.kpiGrid}>
        <View style={styles.kpiRow}>
          <View style={styles.kpiCell}>
            <KpiCard
              title="充电营收"
              value={`¥${fmt(dashboard.charging.this_month.revenue)}`}
              subtitle={`${dashboard.charging.this_month.orders}单`}
              icon={{ name: 'flash-outline', color: Colors.primary }}
              color={Colors.primary}
            />
          </View>
          <View style={styles.kpiCell}>
            <KpiCard
              title="待审批"
              value={String(dashboard.finance.arap.receivable.overdue_count)}
              subtitle="逾期应收"
              icon={{ name: 'clipboard-outline', color: Colors.warning }}
              color={Colors.warning}
            />
          </View>
        </View>
        <View style={styles.kpiRow}>
          <View style={styles.kpiCell}>
            <KpiCard
              title="应收余额"
              value={`¥${fmt(dashboard.finance.arap.receivable.remaining)}`}
              icon={{ name: 'stats-chart-outline', color: Colors.info }}
              color={Colors.info}
            />
          </View>
          <View style={styles.kpiCell}>
            <KpiCard
              title="项目预算"
              value={`¥${fmt(dashboard.projects.total_budget)}`}
              subtitle={`已用${dashboard.projects.budget_usage_pct}%`}
              icon={{ name: 'construct-outline', color: '#8B5CF6' }}
              color="#8B5CF6"
            />
          </View>
        </View>
      </View>

      {/* Alerts */}
      <SectionHeader title="智能告警" action="查看全部" onAction={() => router.push('/ai')} />
      <Card style={styles.alertCard}>
        {alerts.length === 0 ? (
          <EmptyState icon={{ name: 'checkmark-circle-outline' }} title="暂无告警" subtitle="系统运行正常" />
        ) : (
          alerts.slice(0, 3).map((a: Alert) => (
            <View key={a.id} style={styles.alertItem}>
              <View style={[styles.alertIconWrap, { backgroundColor: a.severity === 'critical' ? Colors.dangerBg : a.severity === 'warning' ? Colors.warningBg : Colors.infoBg }]}>
                <Ionicons
                  name={a.severity === 'critical' ? 'alert-circle' : a.severity === 'warning' ? 'warning' : 'information-circle'}
                  size={16}
                  color={a.severity === 'critical' ? Colors.danger : a.severity === 'warning' ? Colors.warning : Colors.info}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.alertTitle}>{a.title}</Text>
                <Text style={styles.alertMsg} numberOfLines={2}>{a.message}</Text>
              </View>
            </View>
          ))
        )}
      </Card>

      {/* Upcoming */}
      {dashboard.upcoming.items.length > 0 && (
        <>
          <SectionHeader title="即将到期" />
          <Card style={styles.alertCard}>
            {dashboard.upcoming.items.slice(0, 5).map((item, i) => (
              <View key={i} style={styles.alertItem}>
                <Badge variant={item.type.includes('receivable') ? 'default' : 'outline'}>
                  {item.type.includes('receivable') ? '应收' : item.type.includes('payable') ? '应付' : '合同'}
                </Badge>
                <Text style={{ flex: 1, fontSize: 13, marginLeft: 8, color: IOS.label }} numberOfLines={1}>{item.label}</Text>
                <Text style={{ fontSize: 11, color: IOS.label2 }}>{item.date}</Text>
              </View>
            ))}
          </Card>
        </>
      )}

      {/* Quick Actions */}
      <SectionHeader title="快捷操作" />
      <View style={styles.quickGrid}>
        <QuickAction icon={{ name: 'create-outline' }} title="写日志" color={Colors.primary} onPress={() => {}} />
        <QuickAction icon={{ name: 'wallet-outline' }} title="备用金" color={Colors.success} onPress={() => {}} />
        <QuickAction icon={{ name: 'stats-chart-outline' }} title="报表" color={Colors.info} onPress={() => {}} />
        <QuickAction icon={{ name: 'flash-outline' }} title="充电站" color={Colors.warning} onPress={() => {}} />
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

function LoadingSkeleton() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingTop: 60, paddingHorizontal: 16 }}>
      <View style={{ height: 20, width: 120, backgroundColor: IOS.fill, borderRadius: 6, marginBottom: 8 }} />
      <View style={{ height: 14, width: 80, backgroundColor: IOS.fill, borderRadius: 6, marginBottom: 24 }} />
      <View style={{ height: 120, backgroundColor: IOS.fill, borderRadius: Radius.lg, marginBottom: 16 }} />
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
        <View style={{ flex: 1, height: 90, backgroundColor: IOS.fill, borderRadius: Radius.lg }} />
        <View style={{ flex: 1, height: 90, backgroundColor: IOS.fill, borderRadius: Radius.lg }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
        <View style={{ flex: 1, height: 90, backgroundColor: IOS.fill, borderRadius: Radius.lg }} />
        <View style={{ flex: 1, height: 90, backgroundColor: IOS.fill, borderRadius: Radius.lg }} />
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: IOS.bg,
  },
  heroGradient: {
    paddingTop: 60,
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  date: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  heroCard: {
    marginHorizontal: Spacing.xl,
    padding: Spacing.xl,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
  },
  heroGrid: {
    flexDirection: 'row',
  },
  heroItem: {
    flex: 1,
  },
  heroDivider: {
    width: 0.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: Spacing.lg,
  },
  heroLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
    marginBottom: 4,
  },
  heroValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
  },
  heroSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
  },
  kpiGrid: {
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  kpiCell: {
    flex: 1,
  },
  alertCard: {
    marginHorizontal: Spacing.xl,
    padding: Spacing.md,
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  alertIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: IOS.label,
  },
  alertMsg: {
    fontSize: 11,
    color: IOS.label2,
    marginTop: 1,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
})
