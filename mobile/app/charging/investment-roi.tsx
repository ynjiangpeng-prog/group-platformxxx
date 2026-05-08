import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, KpiCard, SectionHeader, Badge, ProgressBar, EmptyState, PageHeader } from '../../src/components/DesignSystem'
import { Colors, IOS, Spacing, Radius } from '../../src/theme/colors'
import { api } from '../../src/api/client'

export default function InvestmentROIScreen() {
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['investment-roi'],
    queryFn: () => api.get<{
      summary: { total_invested: number; total_revenue: number; avg_roi: number; avg_payback_months: number }
      stations: { name: string; invested: number; revenue: number; roi: number; payback_months: number }[]
    }>('/charging/investment-roi'),
  })

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const summary = data?.summary ?? { total_invested: 0, total_revenue: 0, avg_roi: 0, avg_payback_months: 0 }
  const stations = data?.stations ?? []
  const fmt = (v: number) => v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <PageHeader title="投资回报" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="总投资" value={`¥${fmt(summary.total_invested)}`} icon={{ name: 'wallet-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="总收入" value={`¥${fmt(summary.total_revenue)}`} icon={{ name: 'trending-up-outline', color: Colors.success }} color={Colors.success} /></View>
      </View>
      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="平均ROI" value={`${summary.avg_roi.toFixed(1)}%`} icon={{ name: 'trending-up-outline', color: Colors.info }} color={Colors.info} /></View>
        <View style={{ flex: 1 }}><KpiCard title="平均回本" value={`${summary.avg_payback_months}月`} icon={{ name: 'time-outline', color: Colors.warning }} color={Colors.warning} /></View>
      </View>

      <SectionHeader title="站点投资回报" />
      {stations.length === 0 ? (
        <EmptyState icon={{ name: 'trending-up-outline' }} title="暂无投资数据" />
      ) : (
        stations.map((s, i) => (
          <Card key={i} style={styles.stationCard}>
            <View style={styles.stationHeader}>
              <Text style={styles.stationName} numberOfLines={1}>{s.name}</Text>
              <Badge variant={s.roi >= 0 ? 'success' : 'danger'}>
                ROI {s.roi >= 0 ? '+' : ''}{s.roi.toFixed(1)}%
              </Badge>
            </View>
            <View style={styles.stationRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.stationLabel}>投资额</Text>
                <Text style={styles.stationValue}>¥{fmt(s.invested)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stationLabel}>收入</Text>
                <Text style={styles.stationValue}>¥{fmt(s.revenue)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stationLabel}>回本</Text>
                <Text style={styles.stationValue}>{s.payback_months}月</Text>
              </View>
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
  stationCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  stationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stationName: { fontSize: 14, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
  stationRow: { flexDirection: 'row', gap: Spacing.md, marginTop: 12 },
  stationLabel: { fontSize: 10, color: IOS.label2, marginBottom: 2 },
  stationValue: { fontSize: 13, fontWeight: '800', color: IOS.label },
})
