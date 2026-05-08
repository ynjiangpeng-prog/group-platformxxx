import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, KpiCard, SectionHeader, Badge, ProgressBar, EmptyState, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface Agent {
  id: string
  name: string
  role: string
  status: string
  capabilities: number
  tasks_completed: number
  success_rate: number
  evolution_level: number
}

export default function AgentEvolutionScreen() {
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['agent-evolution'],
    queryFn: () => api.get<{ agents: Agent[]; total_tasks: number; avg_success_rate: number }>('/agent-evolution'),
  })

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const agents = data?.agents ?? []

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <PageHeader title="智能进化" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="Agent数" value={String(agents.length)} icon={{ name: 'hardware-chip-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="总任务" value={String(data?.total_tasks ?? 0)} icon={{ name: 'clipboard-outline', color: Colors.info }} color={Colors.info} /></View>
      </View>
      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="平均成功率" value={`${(data?.avg_success_rate ?? 0).toFixed(0)}%`} icon={{ name: 'checkmark-circle-outline', color: Colors.success }} color={Colors.success} /></View>
      </View>

      <SectionHeader title="Agent列表" />
      {agents.length === 0 ? (
        <EmptyState icon={{ name: 'hardware-chip-outline' }} title="暂无Agent" />
      ) : (
        agents.map((agent) => (
          <Pressable key={agent.id} onPress={() => router.push(`/agent-evolution/agent/${agent.id}` as `/${string}`)}>
            <Card style={styles.agentCard}>
              <View style={styles.agentHeader}>
                <View style={[styles.agentIcon, { backgroundColor: Colors.primaryBg }]}>
                  <Ionicons name="hardware-chip-outline" size={18} color={Colors.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.agentName}>{agent.name}</Text>
                  <Text style={styles.agentRole}>{agent.role}</Text>
                </View>
                <Badge variant={agent.status === 'active' ? 'success' : 'outline'}>
                  {agent.status === 'active' ? '活跃' : agent.status}
                </Badge>
              </View>
              <View style={styles.agentStats}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.agentStatLabel}>进化等级</Text>
                  <Text style={styles.agentStatValue}>Lv.{agent.evolution_level}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.agentStatLabel}>完成任务</Text>
                  <Text style={styles.agentStatValue}>{agent.tasks_completed}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.agentStatLabel}>成功率</Text>
                  <Text style={styles.agentStatValue}>{agent.success_rate}%</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <ProgressBar value={agent.capabilities} color={Colors.primary} />
                <Text style={{ fontSize: 11, color: IOS.label2 }}>能力 {agent.capabilities}%</Text>
              </View>
            </Card>
          </Pressable>
        ))
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  kpiRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  agentCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  agentHeader: { flexDirection: 'row', alignItems: 'center' },
  agentIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  agentName: { fontSize: 15, fontWeight: '700', color: IOS.label },
  agentRole: { fontSize: 12, color: IOS.label2, marginTop: 2 },
  agentStats: { flexDirection: 'row', gap: Spacing.md, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: IOS.separator },
  agentStatLabel: { fontSize: 10, color: IOS.label2, marginBottom: 2 },
  agentStatValue: { fontSize: 14, fontWeight: '800', color: IOS.label },
})
