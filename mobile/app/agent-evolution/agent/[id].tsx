import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, ProgressBar, EmptyState, KpiCard, PageHeader } from '../../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../../src/theme/colors'
import { api } from '../../../src/api/client'

export default function AgentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const { data: agent, isLoading } = useQuery({
    queryKey: ['agent', id],
    queryFn: () => api.get<{
      id: string; name: string; role: string; status: string
      capabilities: number; tasks_completed: number; success_rate: number
      evolution_level: number; created_at: string; last_active: string
      skills: { name: string; level: number }[]
      recent_tasks: { id: string; name: string; status: string; completed_at: string }[]
    }>(`/agent-evolution/agent/${id}`),
    enabled: !!id,
  })

  if (isLoading || !agent) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <PageHeader title="Agent详情" onBack={() => router.back()} />

      <Card style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={[styles.agentAvatar, { backgroundColor: Colors.primaryBg }]}>
            <Ionicons name="hardware-chip-outline" size={32} color={Colors.primary} />
          </View>
          <View style={{ flex: 1, marginLeft: 16 }}>
            <Text style={styles.agentName}>{agent.name}</Text>
            <Text style={styles.agentRole}>{agent.role}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
              <Badge variant={agent.status === 'active' ? 'success' : 'outline'}>
                {agent.status === 'active' ? '活跃' : agent.status}
              </Badge>
              <Badge variant="default">Lv.{agent.evolution_level}</Badge>
            </View>
          </View>
        </View>
      </Card>

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="完成任务" value={String(agent.tasks_completed)} icon={{ name: 'clipboard-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="成功率" value={`${agent.success_rate}%`} icon={{ name: 'checkmark-circle-outline', color: Colors.success }} color={Colors.success} /></View>
      </View>

      <Card style={styles.section}>
        <SectionHeader title="技能" />
        {agent.skills.map((skill) => (
          <View key={skill.name} style={styles.skillRow}>
            <Text style={styles.skillName}>{skill.name}</Text>
            <View style={{ flex: 1, marginHorizontal: 8 }}>
              <ProgressBar value={skill.level} color={Colors.primary} />
            </View>
            <Text style={styles.skillLevel}>{skill.level}%</Text>
          </View>
        ))}
      </Card>

      <Card style={styles.section}>
        <SectionHeader title="最近任务" />
        {agent.recent_tasks.length === 0 ? (
          <EmptyState icon={{ name: 'clipboard-outline' }} title="暂无任务记录" />
        ) : (
          agent.recent_tasks.map((task) => (
            <View key={task.id} style={styles.taskRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.taskName} numberOfLines={1}>{task.name}</Text>
                <Text style={styles.taskDate}>{task.completed_at}</Text>
              </View>
              <Badge variant={task.status === 'completed' ? 'success' : 'warning'}>
                {task.status === 'completed' ? '完成' : '处理中'}
              </Badge>
            </View>
          ))
        )}
      </Card>

      <Card style={styles.section}>
        <SectionHeader title="基本信息" />
        <InfoRow label="创建时间" value={agent.created_at} />
        <InfoRow label="最后活跃" value={agent.last_active} />
        <InfoRow label="综合能力" value={`${agent.capabilities}%`} />
      </Card>

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: IOS.separator }}>
      <Text style={{ fontSize: 13, color: IOS.label2 }}>{label}</Text>
      <Text style={{ fontSize: 13, color: IOS.label, fontWeight: '600' }}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  heroCard: { marginHorizontal: Spacing.xl, padding: Spacing.xl },
  heroTop: { flexDirection: 'row', alignItems: 'center' },
  agentAvatar: { width: 64, height: 64, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  agentName: { fontSize: 20, fontWeight: '800', color: IOS.label },
  agentRole: { fontSize: 13, color: IOS.label2, marginTop: 2 },
  kpiRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  section: { marginHorizontal: Spacing.xl, marginBottom: Spacing.md },
  skillRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  skillName: { fontSize: 12, color: IOS.label, fontWeight: '500', width: 80 },
  skillLevel: { fontSize: 12, color: Colors.primary, fontWeight: '700', fontFamily: 'SpaceMono' },
  taskRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: IOS.separator },
  taskName: { fontSize: 13, fontWeight: '600', color: IOS.label },
  taskDate: { fontSize: 11, color: IOS.label2, marginTop: 2 },
})
