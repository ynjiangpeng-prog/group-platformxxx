import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, Button, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface Approval {
  id: string
  agent_name: string
  evolution_type: string
  description: string
  status: string
  requested_at: string
  risk_level: string
}

export default function ApprovalsScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['evolution-approvals'],
    queryFn: () => api.get<{ items: Approval[]; total: number }>('/agent-evolution/approvals'),
  })

  const items = data?.items ?? []
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const pendingCount = items.filter((a: Approval) => a.status === 'pending').length

  return (
    <View style={styles.container}>
      <PageHeader title="进化审批" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="待审批" value={String(pendingCount)} icon={{ name: 'clipboard-outline', color: Colors.warning }} color={Colors.warning} /></View>
        <View style={{ flex: 1 }}><KpiCard title="总申请" value={String(items.length)} icon={{ name: 'stats-chart-outline', color: Colors.primary }} color={Colors.primary} /></View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'checkmark-circle-outline' }} title="暂无审批" />}
        renderItem={({ item: a }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardAgent}>{a.agent_name}</Text>
              <Badge variant={a.status === 'pending' ? 'warning' : a.status === 'approved' ? 'success' : 'danger'}>
                {a.status === 'pending' ? '待审批' : a.status === 'approved' ? '已通过' : '已拒绝'}
              </Badge>
            </View>
            <Text style={styles.cardType}>进化类型: {a.evolution_type}</Text>
            <Text style={styles.cardDesc} numberOfLines={2}>{a.description}</Text>
            <View style={styles.cardFooter}>
              <Badge variant={a.risk_level === 'low' ? 'success' : a.risk_level === 'medium' ? 'warning' : 'danger'}>
                风险: {a.risk_level === 'low' ? '低' : a.risk_level === 'medium' ? '中' : '高'}
              </Badge>
              <Text style={styles.cardDate}>{a.requested_at}</Text>
            </View>
            {a.status === 'pending' && (
              <View style={styles.actionRow}>
                <Button title="拒绝" variant="danger" size="sm" onPress={() => {}} />
                <Button title="批准" variant="primary" size="sm" onPress={() => {}} />
              </View>
            )}
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
  cardAgent: { fontSize: 15, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
  cardType: { fontSize: 13, color: Colors.primary, fontWeight: '600', marginTop: 6 },
  cardDesc: { fontSize: 12, color: IOS.label2, marginTop: 6, lineHeight: 18 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  cardDate: { fontSize: 11, color: IOS.label2 },
  actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, justifyContent: 'flex-end' },
})
