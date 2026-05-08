import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader, SearchBar } from '../../src/components/DesignSystem'
import { Colors, IOS, Spacing, Radius } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface Supplier {
  id: string
  name: string
  category: string
  contact_name: string
  contact_phone: string
  total_orders: number
  total_amount: number
  rating: number
  status: string
}

export default function SuppliersScreen() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['suppliers', search],
    queryFn: () => api.get<{ items: Supplier[]; total: number }>(`/erp/suppliers?keyword=${search}`),
  })

  const suppliers = data?.items ?? []
  const fmt = (v: number) => v >= 10000 ? `¥${(v / 10000).toFixed(1)}万` : `¥${v.toLocaleString()}`
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <PageHeader title="供应商列表" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="供应商" value={String(suppliers.length)} icon={{ name: 'business-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="采购总额" value={fmt(suppliers.reduce((s: number, x: Supplier) => s + x.total_amount, 0))} icon={{ name: 'wallet-outline', color: Colors.success }} color={Colors.success} /></View>
      </View>

      <View style={styles.searchWrap}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="搜索供应商..." />
      </View>

      <FlatList
        data={suppliers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'business-outline' }} title="暂无供应商" />}
        renderItem={({ item: s }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardName} numberOfLines={1}>{s.name}</Text>
              <Badge variant={s.status === 'active' ? 'success' : 'outline'}>
                {s.status === 'active' ? '合作中' : s.status}
              </Badge>
            </View>
            <Text style={styles.cardCategory}>{s.category}</Text>
            <View style={styles.cardContact}>
              <Text style={styles.cardMeta}><Ionicons name="person-outline" size={12} color={IOS.label2} /> {s.contact_name} · {s.contact_phone}</Text>
            </View>
            <View style={styles.cardFooter}>
              <Text style={styles.cardMeta}>{s.total_orders}笔订单 · <Ionicons name="star" size={12} color="#F59E0B" /> {s.rating}</Text>
              <Text style={styles.cardAmount}>{fmt(s.total_amount)}</Text>
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
  searchWrap: { paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  card: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontSize: 15, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
  cardCategory: { fontSize: 12, color: IOS.label2, marginTop: 4 },
  cardContact: { marginTop: 6 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: IOS.separator },
  cardMeta: { fontSize: 12, color: IOS.label2 },
  cardAmount: { fontSize: 14, fontWeight: '800', color: IOS.label },
})
