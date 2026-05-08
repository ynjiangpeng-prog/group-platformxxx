import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface Entity {
  id: string
  name: string
  entity_type: string
  tax_id: string
  legal_person: string
  status: string
  projects_count: number
  balance: number
}

export default function EntitiesScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['entities'],
    queryFn: () => api.get<{ items: Entity[]; total: number }>('/entities'),
  })

  const items = data?.items ?? []
  const fmt = (v: number) => v >= 10000 ? `¥${(v / 10000).toFixed(1)}万` : `¥${v.toLocaleString()}`
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <PageHeader title="实体管理" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="实体总数" value={String(items.length)} icon={{ name: 'business-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="项目总数" value={String(items.reduce((s: number, e: Entity) => s + e.projects_count, 0))} icon={{ name: 'folder-outline', color: Colors.info }} color={Colors.info} /></View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'business-outline' }} title="暂无实体" />}
        renderItem={({ item: e }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.entityIcon, { backgroundColor: Colors.primaryBg }]}>
                <Ionicons name="business-outline" size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.cardName}>{e.name}</Text>
                <Text style={styles.cardTax}>税号: {e.tax_id}</Text>
              </View>
              <Badge variant={e.status === 'active' ? 'success' : 'outline'}>
                {e.status === 'active' ? '正常' : e.status}
              </Badge>
            </View>
            <View style={styles.cardFooter}>
              <Text style={styles.cardMeta}>法人: {e.legal_person} · {e.entity_type} · {e.projects_count}个项目</Text>
              <Text style={styles.cardBalance}>{fmt(e.balance)}</Text>
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
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  entityIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cardName: { fontSize: 15, fontWeight: '700', color: IOS.label },
  cardTax: { fontSize: 11, color: IOS.label2, fontFamily: 'SpaceMono', marginTop: 2 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: IOS.separator, alignItems: 'center' },
  cardMeta: { fontSize: 11, color: IOS.label2, flex: 1 },
  cardBalance: { fontSize: 14, fontWeight: '800', color: IOS.label },
})
