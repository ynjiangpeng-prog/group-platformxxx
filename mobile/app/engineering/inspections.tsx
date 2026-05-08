import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface Inspection {
  id: string
  project_name: string
  inspection_date: string
  inspector: string
  result: string
  issues_count: number
  status: string
  category: string
}

const RESULT_MAP: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'outline' }> = {
  passed: { label: '合格', variant: 'success' },
  issues: { label: '有隐患', variant: 'warning' },
  failed: { label: '不合格', variant: 'danger' },
}

export default function InspectionsScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inspections'],
    queryFn: () => api.get<{ items: Inspection[]; total: number }>('/engineering/inspections'),
  })

  const items = data?.items ?? []
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const passedCount = items.filter((i: Inspection) => i.result === 'passed').length
  const issuesCount = items.filter((i: Inspection) => i.result === 'issues').length

  return (
    <View style={styles.container}>
      <PageHeader title="安全巡检" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="合格次数" value={String(passedCount)} icon={{ name: 'checkmark-circle-outline', color: Colors.success }} color={Colors.success} /></View>
        <View style={{ flex: 1 }}><KpiCard title="隐患次数" value={String(issuesCount)} icon={{ name: 'alert-circle-outline', color: Colors.warning }} color={Colors.warning} /></View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'shield-checkmark-outline' }} title="暂无巡检记录" />}
        renderItem={({ item: insp }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardProject} numberOfLines={1}>{insp.project_name}</Text>
              <Badge variant={RESULT_MAP[insp.result]?.variant ?? 'outline'}>
                {RESULT_MAP[insp.result]?.label ?? insp.result}
              </Badge>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>巡检类型</Text>
              <Text style={styles.cardValue}>{insp.category}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>巡检人</Text>
              <Text style={styles.cardValue}>{insp.inspector}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>发现问题</Text>
              <Text style={[styles.cardValue, { color: insp.issues_count > 0 ? Colors.danger : Colors.success }]}>{insp.issues_count}项</Text>
            </View>
            <Text style={styles.cardDate}>{insp.inspection_date}</Text>
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
  cardProject: { fontSize: 15, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, marginTop: 4 },
  cardLabel: { fontSize: 12, color: IOS.label2 },
  cardValue: { fontSize: 12, color: IOS.label, fontWeight: '600' },
  cardDate: { fontSize: 11, color: IOS.label2, marginTop: 8 },
})
