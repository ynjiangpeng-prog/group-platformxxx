import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface ConstructionLog {
  id: string
  project_name: string
  log_date: string
  weather: string
  workers_count: number
  content: string
  recorder: string
  status: string
}

export default function EngineeringLogsScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['construction-logs'],
    queryFn: () => api.get<{ items: ConstructionLog[]; total: number }>('/engineering/logs'),
  })

  const logs = data?.items ?? []
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <PageHeader title="施工日志" onBack={() => router.back()} />

      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'document-text-outline' }} title="暂无施工日志" subtitle="施工日志记录为空" />}
        renderItem={({ item: log }) => (
          <Card style={styles.logCard}>
            <View style={styles.logHeader}>
              <Text style={styles.logProject} numberOfLines={1}>{log.project_name}</Text>
              <Badge variant="outline">{log.log_date}</Badge>
            </View>
            <Text style={styles.logContent} numberOfLines={3}>{log.content}</Text>
            <View style={styles.logFooter}>
              <Text style={styles.logMeta}><Ionicons name="hard-hat-outline" size={12} color={IOS.label2} /> {log.workers_count}人 · <Ionicons name="partly-sunny-outline" size={12} color={IOS.label2} /> {log.weather}</Text>
              <Text style={styles.logMeta}>记录人: {log.recorder}</Text>
            </View>
          </Card>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  logCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logProject: { fontSize: 15, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
  logContent: { fontSize: 13, color: IOS.label2, lineHeight: 20, marginTop: 8 },
  logFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: IOS.separator },
  logMeta: { fontSize: 11, color: IOS.label2 },
})
