import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, IOS, Spacing, Radius } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface Receipt {
  id: string
  receipt_no: string
  order_no: string
  supplier: string
  items_received: number
  items_total: number
  received_by: string
  received_at: string
  status: string
  notes?: string
}

export default function ReceiptsScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['receipts'],
    queryFn: () => api.get<{ items: Receipt[]; total: number }>('/erp/receipts'),
  })

  const items = data?.items ?? []
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <PageHeader title="收货记录" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="收货总数" value={String(items.length)} icon={{ name: 'cube-outline', color: Colors.primary }} color={Colors.primary} /></View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'cube-outline' }} title="暂无收货记录" />}
        renderItem={({ item: r }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardNo}>{r.receipt_no}</Text>
              <Badge variant={r.status === 'completed' ? 'success' : 'warning'}>
                {r.status === 'completed' ? '已完成' : '部分收货'}
              </Badge>
            </View>
            <Text style={styles.cardOrder}>采购单: {r.order_no}</Text>
            <Text style={styles.cardSupplier}>{r.supplier}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardMeta}><Ionicons name="cube-outline" size={12} color={IOS.label2} /> {r.items_received}/{r.items_total}项 · <Ionicons name="person-outline" size={12} color={IOS.label2} /> {r.received_by}</Text>
              <Text style={styles.cardDate}>{r.received_at}</Text>
            </View>
            {r.notes && <Text style={styles.cardNotes} numberOfLines={2}>{r.notes}</Text>}
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
  cardNo: { fontSize: 14, fontWeight: '700', color: IOS.label, fontFamily: 'SpaceMono' },
  cardOrder: { fontSize: 12, color: IOS.label2, marginTop: 4, fontFamily: 'SpaceMono' },
  cardSupplier: { fontSize: 13, color: IOS.label, fontWeight: '500', marginTop: 4 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: IOS.separator },
  cardMeta: { fontSize: 11, color: IOS.label2 },
  cardDate: { fontSize: 11, color: IOS.label2 },
  cardNotes: { fontSize: 12, color: IOS.label2, marginTop: 6, fontStyle: 'italic' },
})
