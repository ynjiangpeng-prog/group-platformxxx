import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, KpiCard, SectionHeader, Badge, ProgressBar, EmptyState, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

export default function PredictionsScreen() {
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['predictions'],
    queryFn: () => api.get<{
      predictions: { id: string; metric: string; current: number; predicted: number; change_pct: number; confidence: number; trend: string }[]
    }>('/business-twin/predictions'),
  })

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const predictions = data?.predictions ?? []
  const fmt = (v: number) => v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <PageHeader title="预测中心" onBack={() => router.back()} />

      <Card style={styles.infoCard}>
        <Text style={styles.infoText}>基于历史数据和AI模型，预测未来30天的关键业务指标。</Text>
      </Card>

      {predictions.length === 0 ? (
        <EmptyState icon={{ name: 'trending-up-outline' }} title="暂无预测数据" />
      ) : (
        predictions.map((p) => (
          <Card key={p.id} style={styles.predictionCard}>
            <View style={styles.predHeader}>
              <Text style={styles.predMetric}>{p.metric}</Text>
              <Badge variant={p.change_pct >= 0 ? 'success' : 'danger'}>
                {p.change_pct >= 0 ? '↑' : '↓'} {Math.abs(p.change_pct).toFixed(1)}%
              </Badge>
            </View>
            <View style={styles.predValues}>
              <View style={{ flex: 1 }}>
                <Text style={styles.predLabel}>当前值</Text>
                <Text style={styles.predValue}>{fmt(p.current)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.predLabel}>预测值</Text>
                <Text style={[styles.predValue, { color: p.change_pct >= 0 ? Colors.success : Colors.danger }]}>{fmt(p.predicted)}</Text>
              </View>
            </View>
            <View style={styles.confidenceRow}>
              <Text style={styles.confidenceLabel}>置信度</Text>
              <View style={{ flex: 1, marginHorizontal: 8 }}>
                <ProgressBar value={p.confidence * 100} color={Colors.primary} />
              </View>
              <Text style={styles.confidenceValue}>{(p.confidence * 100).toFixed(0)}%</Text>
            </View>
            <Text style={styles.predTrend}>趋势: {p.trend}</Text>
          </Card>
        ))
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  infoCard: { marginHorizontal: Spacing.xl, padding: Spacing.md, marginBottom: Spacing.md },
  infoText: { fontSize: 13, color: IOS.label2, lineHeight: 20 },
  predictionCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.md, padding: Spacing.md },
  predHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  predMetric: { fontSize: 15, fontWeight: '700', color: IOS.label },
  predValues: { flexDirection: 'row', gap: Spacing.lg, marginTop: 12 },
  predLabel: { fontSize: 11, color: IOS.label2, marginBottom: 2 },
  predValue: { fontSize: 18, fontWeight: '800', color: IOS.label },
  confidenceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  confidenceLabel: { fontSize: 11, color: IOS.label2 },
  confidenceValue: { fontSize: 12, fontWeight: '700', color: Colors.primary, fontFamily: 'SpaceMono' },
  predTrend: { fontSize: 12, color: IOS.label2, marginTop: 8 },
})
