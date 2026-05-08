import Ionicons from '@expo/vector-icons/Ionicons'
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface WarehouseItem {
  id: string
  name: string
  category: string
  quantity: number
  unit: string
  warehouse: string
  min_stock: number
  status: string
}

export default function WarehouseScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['warehouse'],
    queryFn: () => api.get<{ items: WarehouseItem[]; total: number }>('/warehouse'),
  })

  const items = data?.items ?? []
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const lowStock = items.filter((i: WarehouseItem) => i.quantity <= i.min_stock).length

  return (
    <View style={styles.container}>
      <PageHeader title="仓库管理" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="物料总数" value={String(items.length)} icon={{ name: 'cube-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="低库存" value={String(lowStock)} icon={{ name: 'warning-outline', color: Colors.danger }} color={Colors.danger} /></View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'business-outline' }} title="暂无库存" />}
        renderItem={({ item }) => (
          <Card style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
              <Badge variant={item.quantity <= item.min_stock ? 'danger' : 'success'}>
                {item.quantity <= item.min_stock ? '低库存' : '正常'}
              </Badge>
            </View>
            <View style={styles.itemRow}>
              <Text style={styles.itemLabel}>分类</Text>
              <Text style={styles.itemValue}>{item.category}</Text>
            </View>
            <View style={styles.itemRow}>
              <Text style={styles.itemLabel}>库存</Text>
              <Text style={[styles.itemValue, { color: item.quantity <= item.min_stock ? Colors.danger : IOS.label }]}>
                {item.quantity} {item.unit}
              </Text>
            </View>
            <View style={styles.itemRow}>
              <Text style={styles.itemLabel}>最低库存</Text>
              <Text style={styles.itemValue}>{item.min_stock} {item.unit}</Text>
            </View>
            <Text style={styles.itemWarehouse}>仓库: {item.warehouse}</Text>
          </Card>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  kpiRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  itemCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { fontSize: 15, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, marginTop: 4 },
  itemLabel: { fontSize: 12, color: IOS.label2 },
  itemValue: { fontSize: 12, color: IOS.label, fontWeight: '600' },
  itemWarehouse: { fontSize: 11, color: IOS.label2, marginTop: 6 },
})
