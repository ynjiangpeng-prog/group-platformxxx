import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface CrossEntityFlow {
  id: string
  from_entity: string
  to_entity: string
  amount: number
  flow_type: string
  description: string
  date: string
  status: string
}

export default function CrossEntityFlowScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['cross-entity-flow'],
    queryFn: () => api.get<{ items: CrossEntityFlow[]; total: number }>('/cross-entity-flow'),
  })

  const items = data?.items ?? []
  const fmt = (v: number) => v >= 10000 ? `¥${(v / 10000).toFixed(1)}万` : `¥${v.toLocaleString()}`
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <PageHeader title="跨实体流水" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="流水总数" value={String(items.length)} icon={{ name: 'shuffle-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="总金额" value={fmt(items.reduce((s: number, f: CrossEntityFlow) => s + f.amount, 0))} icon={{ name: 'wallet-outline', color: Colors.info }} color={Colors.info} /></View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'shuffle-outline' }} title="暂无跨实体流水" />}
        renderItem={({ item: f }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardFlow}>
                {f.from_entity} → {f.to_entity}
              </Text>
              <Text style={styles.cardAmount}>{fmt(f.amount)}</Text>
            </View>
            <Text style={styles.cardDesc} numberOfLines={2}>{f.description}</Text>
            <View style={styles.cardFooter}>
              <Badge variant="outline">{f.flow_type}</Badge>
              <Text style={styles.cardDate}>{f.date}</Text>
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
  cardFlow: { fontSize: 14, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
  cardAmount: { fontSize: 16, fontWeight: '800', color: Colors.primary },
  cardDesc: { fontSize: 12, color: IOS.label2, marginTop: 6, lineHeight: 18 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: IOS.separator },
  cardDate: { fontSize: 11, color: IOS.label2 },
})
