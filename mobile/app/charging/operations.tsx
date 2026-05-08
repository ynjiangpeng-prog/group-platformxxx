import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, KpiCard, SectionHeader, Badge, ProgressBar, EmptyState, PageHeader } from '../../src/components/DesignSystem'
import { Colors, IOS, Spacing, Radius } from '../../src/theme/colors'
import { api } from '../../src/api/client'

export default function OperationsScreen() {
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['charging-operations'],
    queryFn: () => api.get<{
      realtime: { active_sessions: number; total_power_kw: number; today_kwh: number; today_revenue: number }
      stations: { name: string; online_devices: number; total_devices: number; status: string }[]
    }>('/charging/operations'),
  })

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const rt = data?.realtime ?? { active_sessions: 0, total_power_kw: 0, today_kwh: 0, today_revenue: 0 }
  const stations = data?.stations ?? []
  const fmt = (v: number) => v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <PageHeader title="运营监控" onBack={() => router.back()} right={
        <View style={styles.liveDot}><Text style={{ fontSize: 10, color: Colors.success, fontWeight: '700' }}>● LIVE</Text></View>
      } />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="实时会话" value={String(rt.active_sessions)} icon={{ name: 'flash-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="实时功率" value={`${rt.total_power_kw}kW`} icon={{ name: 'stats-chart-outline', color: Colors.warning }} color={Colors.warning} /></View>
      </View>
      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="今日电量" value={`${rt.today_kwh}kWh`} icon={{ name: 'battery-charging-outline', color: Colors.success }} color={Colors.success} /></View>
        <View style={{ flex: 1 }}><KpiCard title="今日营收" value={`¥${fmt(rt.today_revenue)}`} icon={{ name: 'wallet-outline', color: Colors.info }} color={Colors.info} /></View>
      </View>

      <SectionHeader title="站点状态" />
      {stations.length === 0 ? (
        <EmptyState icon={{ name: 'cellular-outline' }} title="暂无运营数据" />
      ) : (
        stations.map((s, i) => {
          const usage = s.total_devices > 0 ? (s.online_devices / s.total_devices) * 100 : 0
          return (
            <Card key={i} style={styles.stationCard}>
              <View style={styles.stationHeader}>
                <Text style={styles.stationName} numberOfLines={1}>{s.name}</Text>
                <Badge variant={s.status === 'active' ? 'success' : 'danger'}>
                  {s.status === 'active' ? '正常' : '异常'}
                </Badge>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <ProgressBar value={usage} color={Colors.primary} />
                <Text style={{ fontSize: 12, color: IOS.label2, fontWeight: '600' }}>
                  {s.online_devices}/{s.total_devices}
                </Text>
              </View>
            </Card>
          )
        })
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  liveDot: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, backgroundColor: Colors.successBg },
  kpiRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  stationCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  stationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stationName: { fontSize: 14, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
})
