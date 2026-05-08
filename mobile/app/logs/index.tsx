import Ionicons from '@expo/vector-icons/Ionicons'
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, Badge, SectionHeader, EmptyState, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface LogEntry {
  id: string
  action: string
  module: string
  user_name: string
  ip_address: string
  timestamp: string
  detail: string
  level: string
}

const LEVEL_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'outline' }> = {
  info: { label: 'INFO', variant: 'outline' },
  warning: { label: 'WARN', variant: 'warning' },
  error: { label: 'ERROR', variant: 'danger' },
  critical: { label: 'CRIT', variant: 'danger' },
}

export default function LogsScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['system-logs'],
    queryFn: () => api.get<{ items: LogEntry[]; total: number }>('/system/logs'),
  })

  const logs = data?.items ?? []
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <PageHeader title="操作日志" onBack={() => router.back()} />

      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'clipboard-outline' }} title="暂无日志" />}
        renderItem={({ item: log }) => (
          <Card style={styles.logCard}>
            <View style={styles.logHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.logAction} numberOfLines={1}>{log.action}</Text>
                <Text style={styles.logModule}>{log.module}</Text>
              </View>
              <Badge variant={LEVEL_MAP[log.level]?.variant ?? 'outline'}>
                {LEVEL_MAP[log.level]?.label ?? log.level}
              </Badge>
            </View>
            <Text style={styles.logDetail} numberOfLines={2}>{log.detail}</Text>
            <View style={styles.logFooter}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="person-outline" size={12} color={IOS.label2} />
                <Text style={styles.logMeta}>{log.user_name} · </Text>
                <Ionicons name="globe-outline" size={12} color={IOS.label2} />
                <Text style={styles.logMeta}> {log.ip_address}</Text>
              </View>
              <Text style={styles.logTime}>{log.timestamp}</Text>
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
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logAction: { fontSize: 14, fontWeight: '700', color: IOS.label },
  logModule: { fontSize: 12, color: IOS.label2, marginTop: 2 },
  logDetail: { fontSize: 12, color: IOS.label2, marginTop: 6, lineHeight: 18 },
  logFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: IOS.separator },
  logMeta: { fontSize: 11, color: IOS.label2 },
  logTime: { fontSize: 11, color: IOS.label2 },
})
