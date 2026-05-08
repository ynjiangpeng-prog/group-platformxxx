import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface Ticket {
  id: string
  title: string
  project_name: string
  priority: string
  status: string
  assignee: string
  created_at: string
  category: string
}

const PRIORITY_MAP: Record<string, { label: string; variant: 'danger' | 'warning' | 'default' }> = {
  high: { label: '高', variant: 'danger' },
  medium: { label: '中', variant: 'warning' },
  low: { label: '低', variant: 'default' },
}
const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'outline' }> = {
  open: { label: '待处理', variant: 'warning' },
  in_progress: { label: '处理中', variant: 'default' },
  resolved: { label: '已解决', variant: 'success' },
  closed: { label: '已关闭', variant: 'outline' },
}

export default function EngineeringTicketsScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['engineering-tickets'],
    queryFn: () => api.get<{ items: Ticket[]; total: number }>('/engineering/tickets'),
  })

  const tickets = data?.items ?? []
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const openCount = tickets.filter((t: Ticket) => t.status === 'open').length
  const progressCount = tickets.filter((t: Ticket) => t.status === 'in_progress').length

  return (
    <View style={styles.container}>
      <PageHeader title="工单管理" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="待处理" value={String(openCount)} icon={{ name: 'clipboard-outline', color: Colors.warning }} color={Colors.warning} /></View>
        <View style={{ flex: 1 }}><KpiCard title="处理中" value={String(progressCount)} icon={{ name: 'build-outline', color: Colors.primary }} color={Colors.primary} /></View>
      </View>

      <FlatList
        data={tickets}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'build-outline' }} title="暂无工单" />}
        renderItem={({ item: t }) => (
          <Card style={styles.ticketCard}>
            <View style={styles.ticketHeader}>
              <Text style={styles.ticketTitle} numberOfLines={1}>{t.title}</Text>
              <Badge variant={PRIORITY_MAP[t.priority]?.variant ?? 'default'}>
                {PRIORITY_MAP[t.priority]?.label ?? t.priority}
              </Badge>
            </View>
            <Text style={styles.ticketProject}>{t.project_name} · {t.category}</Text>
            <View style={styles.ticketFooter}>
              <Badge variant={STATUS_MAP[t.status]?.variant ?? 'outline'}>
                {STATUS_MAP[t.status]?.label ?? t.status}
              </Badge>
              <Text style={styles.ticketMeta}><Ionicons name="person-outline" size={12} color={IOS.label2} /> {t.assignee} · {t.created_at}</Text>
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
  ticketCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  ticketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  ticketTitle: { fontSize: 15, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
  ticketProject: { fontSize: 12, color: IOS.label2, marginTop: 4 },
  ticketFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: IOS.separator },
  ticketMeta: { fontSize: 11, color: IOS.label2 },
})
