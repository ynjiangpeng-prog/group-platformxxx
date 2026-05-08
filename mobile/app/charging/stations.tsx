import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader, SearchBar } from '../../src/components/DesignSystem'
import { Colors, IOS, Spacing, Radius } from '../../src/theme/colors'
import { listStations } from '../../src/api/services'
import type { Station } from '../../src/api/types'

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'outline' }> = {
  active: { label: '运营中', variant: 'success' },
  building: { label: '建设中', variant: 'warning' },
  planning: { label: '规划中', variant: 'outline' },
  maintenance: { label: '维护中', variant: 'danger' },
  offline: { label: '离线', variant: 'outline' },
}

export default function StationsScreen() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['stations-mobile', search],
    queryFn: () => listStations({ page: 1, page_size: 50, keyword: search || undefined }),
  })

  const stations = data?.items ?? []
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const activeCount = stations.filter((s: Station) => s.status === 'active').length

  return (
    <View style={styles.container}>
      <PageHeader title="充电站管理" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="总站点" value={String(stations.length)} icon={{ name: 'location-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="运营中" value={String(activeCount)} icon={{ name: 'flash-outline', color: Colors.success }} color={Colors.success} /></View>
      </View>

      <View style={{ paddingHorizontal: Spacing.xl, marginBottom: Spacing.md }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="搜索站点名称..." />
      </View>

      <FlatList
        data={stations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'location-outline' }} title="暂无充电站" />}
        renderItem={({ item: s }) => (
          <Card style={styles.stationCard}>
            <View style={styles.stationHeader}>
              <View style={[styles.stationIcon, { backgroundColor: Colors.primaryBg }]}>
                <Ionicons name="flash" size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.stationName} numberOfLines={1}>{s.name}</Text>
                <Text style={styles.stationCode}>{s.station_code}</Text>
              </View>
              <Badge variant={STATUS_MAP[s.status]?.variant ?? 'outline'}>
                {STATUS_MAP[s.status]?.label ?? s.status}
              </Badge>
            </View>
            <View style={styles.stationInfo}>
              <Text style={styles.stationAddr} numberOfLines={1}><Ionicons name="location-outline" size={12} color={IOS.label2} /> {[s.province, s.city, s.address].filter(Boolean).join(' ')}</Text>
              <Text style={styles.stationParking}>车位: {s.total_parking ?? '-'}</Text>
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
  stationCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  stationHeader: { flexDirection: 'row', alignItems: 'center' },
  stationIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  stationName: { fontSize: 15, fontWeight: '700', color: IOS.label },
  stationCode: { fontSize: 12, color: IOS.label2, fontFamily: 'SpaceMono', marginTop: 2 },
  stationInfo: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: IOS.separator },
  stationAddr: { fontSize: 12, color: IOS.label2, flex: 1, marginRight: 8 },
  stationParking: { fontSize: 12, color: IOS.label2 },
})
