import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface AuditItem {
  id: string
  title: string
  audit_type: string
  auditor: string
  status: string
  findings: number
  start_date: string
  end_date?: string
}

export default function AuditScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.get<{ items: AuditItem[]; total: number }>('/audit'),
  })

  const items = data?.items ?? []
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <PageHeader title="审计管理" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="审计总数" value={String(items.length)} icon={{ name: 'search-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="发现数" value={String(items.reduce((s: number, a: AuditItem) => s + a.findings, 0))} icon={{ name: 'alert-circle-outline', color: Colors.warning }} color={Colors.warning} /></View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'search-outline' }} title="暂无审计记录" />}
        renderItem={({ item: a }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>{a.title}</Text>
              <Badge variant={a.status === 'completed' ? 'success' : a.status === 'in_progress' ? 'warning' : 'outline'}>
                {a.status === 'completed' ? '已完成' : a.status === 'in_progress' ? '进行中' : a.status}
              </Badge>
            </View>
            <Text style={styles.cardMeta}>{a.audit_type} · 审计人: {a.auditor}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardDate}>{a.start_date}{a.end_date ? ` → ${a.end_date}` : ''}</Text>
              <Badge variant={a.findings > 0 ? 'danger' : 'success'}>{a.findings}个发现</Badge>
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
  cardMeta: { fontSize: 12, color: IOS.label2, marginTop: 6 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: IOS.separator },
  cardDate: { fontSize: 11, color: IOS.label2 },
})
