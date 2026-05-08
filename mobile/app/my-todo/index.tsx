import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface Todo {
  id: string
  title: string
  category: string
  priority: string
  due_date: string
  status: string
  source: string
}

const PRIORITY_MAP: Record<string, { label: string; variant: 'danger' | 'warning' | 'default' }> = {
  high: { label: '紧急', variant: 'danger' },
  medium: { label: '一般', variant: 'warning' },
  low: { label: '低', variant: 'default' },
}

export default function MyTodoScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-todo'],
    queryFn: () => api.get<{ items: Todo[]; total: number }>('/my-todo'),
  })

  const items = data?.items ?? []
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const pendingCount = items.filter((t: Todo) => t.status !== 'done').length
  const overdueCount = items.filter((t: Todo) => t.status === 'overdue').length

  return (
    <View style={styles.container}>
      <PageHeader title="我的待办" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="待办数" value={String(pendingCount)} icon={{ name: 'checkmark-circle-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="已逾期" value={String(overdueCount)} icon={{ name: 'alert-circle-outline', color: Colors.danger }} color={Colors.danger} /></View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'checkmark-circle-outline' }} title="暂无待办" subtitle="所有任务已完成" />}
        renderItem={({ item: t }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>{t.title}</Text>
              <Badge variant={PRIORITY_MAP[t.priority]?.variant ?? 'default'}>
                {PRIORITY_MAP[t.priority]?.label ?? t.priority}
              </Badge>
            </View>
            <Text style={styles.cardCategory}>{t.category} · 来自: {t.source}</Text>
            <View style={styles.cardFooter}>
              <Text style={[styles.cardDue, t.status === 'overdue' && { color: Colors.danger }]}>
                {t.status === 'overdue' ? '已逾期' : `截止: ${t.due_date}`}
              </Text>
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
  cardTitle: { fontSize: 15, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
  cardCategory: { fontSize: 12, color: IOS.label2, marginTop: 4 },
  cardFooter: { marginTop: 8 },
  cardDue: { fontSize: 12, color: IOS.label2, fontWeight: '500' },
})
