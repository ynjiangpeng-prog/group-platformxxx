import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, IOS, Spacing, Radius } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface Memo {
  id: string
  title: string
  station_name: string
  category: string
  priority: string
  author: string
  created_at: string
  content: string
}

export default function OperationMemoScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['operation-memo'],
    queryFn: () => api.get<{ items: Memo[]; total: number }>('/charging/operation-memo'),
  })

  const memos = data?.items ?? []
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <PageHeader title="运营备忘" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="备忘总数" value={String(memos.length)} icon={{ name: 'document-text-outline', color: Colors.primary }} color={Colors.primary} /></View>
      </View>

      <FlatList
        data={memos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'document-text-outline' }} title="暂无备忘" />}
        renderItem={({ item: m }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>{m.title}</Text>
              <Badge variant={m.priority === 'high' ? 'danger' : m.priority === 'medium' ? 'warning' : 'outline'}>
                {m.priority === 'high' ? '紧急' : m.priority === 'medium' ? '一般' : '低'}
              </Badge>
            </View>
            <Text style={styles.cardContent} numberOfLines={3}>{m.content}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardMeta}>{m.station_name} · {m.category} · {m.author}</Text>
              <Text style={styles.cardDate}>{m.created_at}</Text>
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
  cardContent: { fontSize: 13, color: IOS.label2, marginTop: 8, lineHeight: 20 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: IOS.separator },
  cardMeta: { fontSize: 11, color: IOS.label2, flex: 1 },
  cardDate: { fontSize: 11, color: IOS.label2 },
})
