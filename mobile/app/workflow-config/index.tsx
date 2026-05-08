import Ionicons from '@expo/vector-icons/Ionicons'
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface Workflow {
  id: string
  name: string
  trigger_type: string
  steps_count: number
  status: string
  last_triggered?: string
  description?: string
}

export default function WorkflowConfigScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['workflow-config'],
    queryFn: () => api.get<{ items: Workflow[]; total: number }>('/workflow-config'),
  })

  const workflows = data?.items ?? []
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <PageHeader title="审批流程配置" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="流程总数" value={String(workflows.length)} icon={{ name: 'sync-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="启用中" value={String(workflows.filter((w: Workflow) => w.status === 'active').length)} icon={{ name: 'checkmark-circle-outline', color: Colors.success }} color={Colors.success} /></View>
      </View>

      <FlatList
        data={workflows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'sync-outline' }} title="暂无审批流程" subtitle="点击新建创建审批流程" />}
        renderItem={({ item: w }) => (
          <Card style={styles.workflowCard}>
            <View style={styles.workflowHeader}>
              <Text style={styles.workflowName} numberOfLines={1}>{w.name}</Text>
              <Badge variant={w.status === 'active' ? 'success' : 'outline'}>
                {w.status === 'active' ? '已启用' : '已停用'}
              </Badge>
            </View>
            <Text style={styles.workflowDesc} numberOfLines={2}>{w.description ?? '无描述'}</Text>
            <View style={styles.workflowFooter}>
              <Text style={styles.workflowMeta}>触发: {w.trigger_type} · {w.steps_count}步</Text>
              <Text style={styles.workflowDate}>{w.last_triggered ?? '未触发'}</Text>
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
  workflowCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  workflowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  workflowName: { fontSize: 15, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
  workflowDesc: { fontSize: 12, color: IOS.label2, marginTop: 6, lineHeight: 18 },
  workflowFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: IOS.separator },
  workflowMeta: { fontSize: 11, color: IOS.label2 },
  workflowDate: { fontSize: 11, color: IOS.label2 },
})
