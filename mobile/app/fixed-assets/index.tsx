import Ionicons from '@expo/vector-icons/Ionicons'
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface FixedAsset {
  id: string
  name: string
  asset_code: string
  category: string
  purchase_date: string
  original_value: number
  current_value: number
  department: string
  custodian: string
  status: string
}

export default function FixedAssetsScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['fixed-assets'],
    queryFn: () => api.get<{ items: FixedAsset[]; total: number; total_value: number }>('/fixed-assets'),
  })

  const assets = data?.items ?? []
  const fmt = (v: number) => v >= 10000 ? `¥${(v / 10000).toFixed(1)}万` : `¥${v.toLocaleString()}`
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <PageHeader title="固定资产" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="资产总数" value={String(assets.length)} icon={{ name: 'desktop-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="总价值" value={fmt(data?.total_value ?? 0)} icon={{ name: 'wallet-outline', color: Colors.success }} color={Colors.success} /></View>
      </View>

      <FlatList
        data={assets}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'desktop-outline' }} title="暂无固定资产" />}
        renderItem={({ item: a }) => (
          <Card style={styles.assetCard}>
            <View style={styles.assetHeader}>
              <Text style={styles.assetName} numberOfLines={1}>{a.name}</Text>
              <Badge variant={a.status === 'in_use' ? 'success' : 'outline'}>
                {a.status === 'in_use' ? '使用中' : a.status === 'idle' ? '闲置' : a.status}
              </Badge>
            </View>
            <Text style={styles.assetCode}>{a.asset_code}</Text>
            <View style={styles.assetRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.assetLabel}>原值</Text>
                <Text style={styles.assetValue}>{fmt(a.original_value)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.assetLabel}>净值</Text>
                <Text style={styles.assetValue}>{fmt(a.current_value)}</Text>
              </View>
            </View>
            <Text style={styles.assetMeta}>{a.department} · {a.custodian} · {a.purchase_date}</Text>
          </Card>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  kpiRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  assetCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  assetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  assetName: { fontSize: 15, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
  assetCode: { fontSize: 12, color: IOS.label2, fontFamily: 'SpaceMono', marginTop: 4 },
  assetRow: { flexDirection: 'row', gap: Spacing.lg, marginTop: 10 },
  assetLabel: { fontSize: 10, color: IOS.label2, marginBottom: 2 },
  assetValue: { fontSize: 14, fontWeight: '800', color: IOS.label },
  assetMeta: { fontSize: 11, color: IOS.label2, marginTop: 8 },
})
