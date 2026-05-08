import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface Travel {
  id: string
  destination: string
  purpose: string
  start_date: string
  end_date: string
  budget: number
  actual_cost: number
  status: string
  applicant: string
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'outline' }> = {
  draft: { label: '草稿', variant: 'outline' },
  pending: { label: '待审批', variant: 'warning' },
  approved: { label: '已审批', variant: 'success' },
  in_progress: { label: '出差中', variant: 'default' },
  completed: { label: '已完成', variant: 'success' },
  rejected: { label: '已拒绝', variant: 'danger' },
}

export default function TravelScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['travel'],
    queryFn: () => api.get<{ items: Travel[]; total: number }>('/travel'),
  })

  const items = data?.items ?? []
  const fmt = (v: number) => v >= 10000 ? `¥${(v / 10000).toFixed(1)}万` : `¥${v.toLocaleString()}`
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <PageHeader title="差旅管理" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="差旅总数" value={String(items.length)} icon={{ name: 'airplane-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="总预算" value={fmt(items.reduce((s: number, t: Travel) => s + t.budget, 0))} icon={{ name: 'wallet-outline', color: Colors.info }} color={Colors.info} /></View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'airplane-outline' }} title="暂无差旅记录" />}
        renderItem={({ item: t }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardDest} numberOfLines={1}>{t.destination}</Text>
              <Badge variant={STATUS_MAP[t.status]?.variant ?? 'outline'}>
                {STATUS_MAP[t.status]?.label ?? t.status}
              </Badge>
            </View>
            <Text style={styles.cardPurpose} numberOfLines={2}>{t.purpose}</Text>
            <Text style={styles.cardDate}>{t.start_date} → {t.end_date}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardMeta}>{t.applicant}</Text>
              <Text style={styles.cardAmount}>预算 {fmt(t.budget)}</Text>
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
  cardDest: { fontSize: 15, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
  cardPurpose: { fontSize: 13, color: IOS.label2, marginTop: 6, lineHeight: 18 },
  cardDate: { fontSize: 12, color: IOS.label2, marginTop: 6, fontFamily: 'SpaceMono' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: IOS.separator },
  cardMeta: { fontSize: 11, color: IOS.label2 },
  cardAmount: { fontSize: 12, color: IOS.label, fontWeight: '600' },
})
