import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, KpiCard, SectionHeader, Badge, EmptyState, PageHeader } from '../../src/components/DesignSystem'
import { Colors, IOS, Spacing, Radius } from '../../src/theme/colors'
import { api } from '../../src/api/client'

export default function StrategyScreen() {
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['charging-strategy'],
    queryFn: () => api.get<{
      strategies: { id: string; name: string; type: string; status: string; description: string; revenue_impact: number }[]
    }>('/charging/strategy'),
  })

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const strategies = data?.strategies ?? []
  const fmt = (v: number) => v >= 10000 ? `¥${(v / 10000).toFixed(1)}万` : `¥${v.toLocaleString()}`

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <PageHeader title="运营策略" onBack={() => router.back()} />

      <Card style={styles.infoCard}>
        <Text style={styles.infoText}>制定充电站运营定价、促销和分时策略以优化营收。</Text>
      </Card>

      {strategies.length === 0 ? (
        <EmptyState icon={{ name: 'target-outline' }} title="暂无运营策略" />
      ) : (
        strategies.map((s) => (
          <Card key={s.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{s.name}</Text>
                <Badge variant="outline" >{s.type}</Badge>
              </View>
              <Badge variant={s.status === 'active' ? 'success' : 'outline'}>
                {s.status === 'active' ? '启用中' : '已停用'}
              </Badge>
            </View>
            <Text style={styles.cardDesc} numberOfLines={2}>{s.description}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardMeta}>收入影响</Text>
              <Text style={[styles.cardImpact, { color: s.revenue_impact >= 0 ? Colors.success : Colors.danger }]}>
                {s.revenue_impact >= 0 ? '+' : ''}{fmt(s.revenue_impact)}
              </Text>
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
  infoCard: { marginHorizontal: Spacing.xl, padding: Spacing.md, marginBottom: Spacing.md },
  infoText: { fontSize: 13, color: IOS.label2, lineHeight: 20 },
  card: { marginHorizontal: Spacing.xl, marginBottom: Spacing.md, padding: Spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardName: { fontSize: 15, fontWeight: '700', color: IOS.label, marginBottom: 4 },
  cardDesc: { fontSize: 13, color: IOS.label2, marginTop: 8, lineHeight: 18 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: IOS.separator, alignItems: 'center' },
  cardMeta: { fontSize: 12, color: IOS.label2 },
  cardImpact: { fontSize: 16, fontWeight: '800' },
})
