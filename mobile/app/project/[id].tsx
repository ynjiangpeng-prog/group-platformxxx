import Ionicons from '@expo/vector-icons/Ionicons'
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Card, Badge, ProgressBar, SectionHeader, EmptyState, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { getProject } from '../../src/api/services'

const TYPE_MAP: Record<string, string> = {
  pure_epc: '纯工程EPC', hv_epc: '高压EPC', lv_epc: '低压EPC',
  equipment_sale: '设备销售', co_invest: '合作共投', full_invest: '全投',
  construction: '施工', charging_epc: '充电站EPC',
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  planning: { label: '规划中', color: IOS.label2 },
  in_progress: { label: '进行中', color: Colors.primary },
  active: { label: '进行中', color: Colors.primary },
  completed: { label: '已完成', color: Colors.success },
  on_hold: { label: '暂停', color: Colors.danger },
  paused: { label: '暂停', color: Colors.danger },
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => getProject(id),
    enabled: !!id,
  })

  if (isLoading || !project) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: IOS.label2 }}>加载中...</Text>
      </View>
    )
  }

  const statusInfo = STATUS_MAP[project.status] ?? { label: project.status, color: IOS.label2 }
  const budget = project.total_budget ?? 0
  const spent = project.actual_cost ?? 0
  const usage = budget > 0 ? (spent / budget) * 100 : 0

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <PageHeader title="项目详情" onBack={() => router.back()} />

      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.projectName}>{project.name}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Badge variant="outline">{TYPE_MAP[project.project_type] ?? project.project_type}</Badge>
          <Text style={{ fontSize: 12, color: statusInfo.color, fontWeight: '700' }}>● {statusInfo.label}</Text>
        </View>
        {project.province && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            <Ionicons name="location-outline" size={14} color={IOS.label2} />
            <Text style={styles.location}>{[project.province, project.city].filter(Boolean).join(' ')}</Text>
          </View>
        )}
      </View>

      {/* Progress Card */}
      <Card style={styles.progressCard}>
        <Text style={styles.progressLabel}>项目进度</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <ProgressBar value={project.progress} />
          </View>
          <Text style={styles.progressValue}>{project.progress}%</Text>
        </View>
      </Card>

      {/* Budget */}
      <Card style={styles.section}>
        <SectionHeader title="预算概览" />
        <View style={styles.budgetGrid}>
          <View style={styles.budgetItem}>
            <Text style={styles.budgetLabel}>总预算</Text>
            <Text style={styles.budgetValue}>¥{(budget / 10000).toFixed(1)}万</Text>
          </View>
          <View style={styles.budgetItem}>
            <Text style={styles.budgetLabel}>已花费</Text>
            <Text style={[styles.budgetValue, { color: Colors.danger }]}>¥{(spent / 10000).toFixed(1)}万</Text>
          </View>
          <View style={styles.budgetItem}>
            <Text style={styles.budgetLabel}>使用率</Text>
            <Text style={[styles.budgetValue, { color: usage > 80 ? Colors.danger : Colors.success }]}>{usage.toFixed(0)}%</Text>
          </View>
        </View>
        {usage > 80 && (
          <View style={styles.budgetWarning}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="warning-outline" size={14} color={Colors.danger} />
              <Text style={{ fontSize: 12, color: Colors.danger, fontWeight: '600' }}>
                预算使用率已达 {usage.toFixed(0)}%，请注意控制成本
              </Text>
            </View>
          </View>
        )}
      </Card>

      {/* Info */}
      <Card style={styles.section}>
        <SectionHeader title="基本信息" />
        <InfoRow label="项目编号" value={project.project_code || '-'} />
        <InfoRow label="开始日期" value={project.start_date ?? '-'} />
        <InfoRow label="结束日期" value={project.end_date ?? '-'} />
        {project.description && <InfoRow label="描述" value={project.description} />}
      </Card>

      {/* Quick Actions */}
      <View style={styles.actionsGrid}>
        <Pressable style={styles.actionBtn}>
          <Ionicons name="create-outline" size={20} color={Colors.primary} />
          <Text style={styles.actionLabel}>写日志</Text>
        </Pressable>
        <Pressable style={styles.actionBtn}>
          <Ionicons name="camera-outline" size={20} color={Colors.primary} />
          <Text style={styles.actionLabel}>拍照记录</Text>
        </Pressable>
        <Pressable style={styles.actionBtn}>
          <Ionicons name="wallet-outline" size={20} color={Colors.primary} />
          <Text style={styles.actionLabel}>备用金</Text>
        </Pressable>
        <Pressable style={styles.actionBtn}>
          <Ionicons name="clipboard-outline" size={20} color={Colors.primary} />
          <Text style={styles.actionLabel}>采购申请</Text>
        </Pressable>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  hero: {
    paddingTop: 8,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  projectName: {
    fontSize: 22,
    fontWeight: '800',
    color: IOS.label,
    letterSpacing: -0.5,
  },
  location: {
    fontSize: 13,
    color: IOS.label2,
    marginLeft: 4,
  },
  progressCard: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
  },
  progressLabel: {
    fontSize: 12,
    color: IOS.label2,
    fontWeight: '500',
    marginBottom: 8,
  },
  progressValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.primary,
    fontFamily: 'SpaceMono',
  },
  section: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
  },
  budgetGrid: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  budgetItem: {
    flex: 1,
  },
  budgetLabel: {
    fontSize: 11,
    color: IOS.label2,
    marginBottom: 2,
  },
  budgetValue: {
    fontSize: 18,
    fontWeight: '800',
    color: IOS.label,
    fontFamily: 'SpaceMono',
  },
  budgetWarning: {
    backgroundColor: Colors.dangerBg,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: IOS.separator,
  },
  infoLabel: {
    fontSize: 13,
    color: IOS.label2,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 13,
    color: IOS.label,
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
    marginLeft: 20,
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: IOS.card,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: IOS.separator,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: IOS.label,
    marginTop: 4,
  },
})
