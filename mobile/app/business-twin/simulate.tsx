import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, KpiCard, SectionHeader, Badge, ProgressBar, Button, EmptyState, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface Scenario {
  id: string
  name: string
  description: string
  impact_revenue: number
  impact_cost: number
  probability: number
}

export default function SimulateScreen() {
  const router = useRouter()
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null)
  const [simulating, setSimulating] = useState(false)
  const [result, setResult] = useState<{ roi: number; payback_months: number; risk_level: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['simulate-scenarios'],
    queryFn: () => api.get<{ scenarios: Scenario[] }>('/business-twin/simulate'),
  })

  const scenarios = data?.scenarios ?? []
  const fmt = (v: number) => v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()

  const runSimulation = async () => {
    if (!selectedScenario) return
    setSimulating(true)
    try {
      const res = await api.post<{ roi: number; payback_months: number; risk_level: string }>('/business-twin/simulate/run', { scenario_id: selectedScenario })
      setResult(res)
    } catch {
      setResult(null)
    } finally {
      setSimulating(false)
    }
  }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <PageHeader title="模拟沙盘" onBack={() => router.back()} />

      <Card style={styles.infoCard}>
        <Text style={styles.infoText}>选择一个业务场景，模拟其对公司收入、成本和风险的影响。</Text>
      </Card>

      <SectionHeader title="业务场景" />
      {scenarios.length === 0 ? (
        <EmptyState icon={{ name: 'dice-outline' }} title="暂无模拟场景" />
      ) : (
        scenarios.map((s) => (
          <Pressable key={s.id} onPress={() => { setSelectedScenario(s.id); setResult(null) }}>
            <Card style={[styles.scenarioCard, selectedScenario === s.id && styles.scenarioSelected]}>
              <View style={styles.scenarioHeader}>
                <Text style={styles.scenarioName}>{s.name}</Text>
                {selectedScenario === s.id && <Badge variant="default">已选</Badge>}
              </View>
              <Text style={styles.scenarioDesc} numberOfLines={2}>{s.description}</Text>
              <View style={styles.scenarioMeta}>
                <Text style={styles.scenarioMetaItem}>收入影响: {fmt(s.impact_revenue)}</Text>
                <Text style={styles.scenarioMetaItem}>成本影响: {fmt(s.impact_cost)}</Text>
              </View>
              <View style={styles.probabilityRow}>
                <Text style={styles.probLabel}>概率</Text>
                <View style={{ flex: 1, marginHorizontal: 8 }}>
                  <ProgressBar value={s.probability * 100} color={Colors.primary} />
                </View>
                <Text style={styles.probValue}>{(s.probability * 100).toFixed(0)}%</Text>
              </View>
            </Card>
          </Pressable>
        ))
      )}

      {selectedScenario && (
        <View style={styles.simulateSection}>
          <Button title={simulating ? '模拟中...' : '运行模拟'} onPress={runSimulation} loading={simulating} disabled={!selectedScenario} />
        </View>
      )}

      {result && (
        <Card style={styles.resultCard}>
          <SectionHeader title="模拟结果" />
          <View style={styles.resultGrid}>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultLabel}>ROI</Text>
              <Text style={[styles.resultValue, { color: result.roi >= 0 ? Colors.success : Colors.danger }]}>{result.roi.toFixed(1)}%</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultLabel}>回收周期</Text>
              <Text style={styles.resultValue}>{result.payback_months}个月</Text>
            </View>
          </View>
          <Badge variant={result.risk_level === 'low' ? 'success' : result.risk_level === 'medium' ? 'warning' : 'danger'}>
            风险等级: {result.risk_level === 'low' ? '低' : result.risk_level === 'medium' ? '中' : '高'}
          </Badge>
        </Card>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  infoCard: { marginHorizontal: Spacing.xl, padding: Spacing.md, marginBottom: Spacing.md },
  infoText: { fontSize: 13, color: IOS.label2, lineHeight: 20 },
  scenarioCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md, borderWidth: 2, borderColor: 'transparent' },
  scenarioSelected: { borderColor: Colors.primary },
  scenarioHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scenarioName: { fontSize: 15, fontWeight: '700', color: IOS.label },
  scenarioDesc: { fontSize: 13, color: IOS.label2, marginTop: 6, lineHeight: 18 },
  scenarioMeta: { flexDirection: 'row', gap: Spacing.lg, marginTop: 10 },
  scenarioMetaItem: { fontSize: 12, color: IOS.label2, fontWeight: '600' },
  probabilityRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  probLabel: { fontSize: 11, color: IOS.label2 },
  probValue: { fontSize: 12, fontWeight: '700', color: Colors.primary, fontFamily: 'SpaceMono' },
  simulateSection: { marginHorizontal: Spacing.xl, marginVertical: Spacing.md },
  resultCard: { marginHorizontal: Spacing.xl, padding: Spacing.md, marginBottom: Spacing.md },
  resultGrid: { flexDirection: 'row', gap: Spacing.lg, marginBottom: Spacing.md },
  resultLabel: { fontSize: 11, color: IOS.label2, marginBottom: 2 },
  resultValue: { fontSize: 22, fontWeight: '800', color: IOS.label },
})
