import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface Workflow {
  id: string
  name: string
  trigger: string
  steps_count: number
  runs_count: number
  success_rate: number
  status: string
  last_run?: string
}

export default function WorkflowsScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['evolution-workflows'],
    queryFn: () => api.get<{ items: Workflow[]; total: number }>('/agent-evolution/workflows'),
  })

  const workflows = data?.items ?? []
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <PageHeader title="工作流列表" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="工作流" value={String(workflows.length)} icon={{ name: 'sync-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="总执行" value={String(workflows.reduce((s: number, w: Workflow) => s + w.runs_count, 0))} icon={{ name: 'play-outline', color: Colors.info }} color={Colors.info} /></View>
      </View>

      <FlatList
        data={workflows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'sync-outline' }} title="暂无工作流" />}
        renderItem={({ item: w }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardName} numberOfLines={1}>{w.name}</Text>
              <Badge variant={w.status === 'active' ? 'success' : 'outline'}>
                {w.status === 'active' ? '启用' : '停用'}
              </Badge>
            </View>
            <Text style={styles.cardTrigger}>触发: {w.trigger} · {w.steps_count}步</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardMeta}>执行 {w.runs_count}次 · 成功率 {w.success_rate}%</Text>
              <Text style={styles.cardDate}>{w.last_run ?? '未执行'}</Text>
            </View>
          </Card>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  kpiRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  card: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontSize: 15, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
  cardTrigger: { fontSize: 12, color: IOS.label2, marginTop: 6 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: IOS.separator },
  cardMeta: { fontSize: 11, color: IOS.label2 },
  cardDate: { fontSize: 11, color: IOS.label2 },
})
