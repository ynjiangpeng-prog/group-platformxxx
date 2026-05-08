import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, ProgressBar, SectionHeader, EmptyState, SearchBar } from '../../src/components/DesignSystem'
import { Colors, IOS, Spacing, Radius } from '../../src/theme/colors'
import { listProjects } from '../../src/api/services'
import type { Project } from '../../src/api/types'

const TYPE_MAP: Record<string, string> = {
  pure_epc: '纯工程EPC', hv_epc: '高压EPC', lv_epc: '低压EPC',
  equipment_sale: '设备销售', co_invest: '合作共投', full_invest: '全投',
  construction: '施工', charging_epc: '充电站EPC',
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'outline' }> = {
  planning: { label: '规划中', variant: 'outline' },
  in_progress: { label: '进行中', variant: 'default' },
  active: { label: '进行中', variant: 'default' },
  completed: { label: '已完成', variant: 'success' },
  on_hold: { label: '暂停', variant: 'danger' },
  paused: { label: '暂停', variant: 'danger' },
  closed: { label: '已关闭', variant: 'outline' },
}

export default function ProjectsScreen() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['projects-mobile', search],
    queryFn: () => listProjects({ page: 1, page_size: 50, keyword: search || undefined }),
  })

  const projects = data?.items ?? []

  const onRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  const active = projects.filter((p: Project) => p.status === 'in_progress' || p.status === 'active').length
  const completed = projects.filter((p: Project) => p.status === 'completed').length
  const totalBudget = projects.reduce((s: number, p: Project) => s + (p.total_budget ?? 0), 0)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>项目管理</Text>
        <Pressable style={styles.createBtn} onPress={() => router.push('/project/create')}>
          <Ionicons name="add" size={18} color="#FFF" />
          <Text style={styles.createBtnText}>新建</Text>
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="搜索项目名称、编号..." />
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statPill, { backgroundColor: Colors.primaryBg }]}>
          <Text style={[styles.statValue, { color: Colors.primary }]}>{active}</Text>
          <Text style={styles.statLabel}>进行中</Text>
        </View>
        <View style={[styles.statPill, { backgroundColor: Colors.successBg }]}>
          <Text style={[styles.statValue, { color: Colors.success }]}>{completed}</Text>
          <Text style={styles.statLabel}>已完成</Text>
        </View>
        <View style={[styles.statPill, { backgroundColor: Colors.warningBg }]}>
          <Text style={[styles.statValue, { color: Colors.warning }]}>{projects.length}</Text>
          <Text style={styles.statLabel}>总项目</Text>
        </View>
        <View style={[styles.statPill, { backgroundColor: Colors.infoBg }]}>
          <Text style={[styles.statValue, { color: Colors.info }]}>{(totalBudget / 10000).toFixed(0)}万</Text>
          <Text style={styles.statLabel}>总预算</Text>
        </View>
      </View>

      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={
          isLoading ? null : <EmptyState icon={{ name: 'folder-outline' }} title="暂无项目" subtitle="点击右上角创建" />
        }
        renderItem={({ item: p }) => (
          <Pressable onPress={() => router.push(`/project/${p.id}`)}>
            <Card style={styles.projectCard}>
              <View style={styles.projectHeader}>
                <View style={styles.projectIcon}>
                  <Ionicons name="folder-outline" size={18} color={Colors.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.projectName} numberOfLines={1}>{p.name}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                    <Badge variant="outline">{TYPE_MAP[p.project_type] ?? p.project_type}</Badge>
                    <Badge variant={STATUS_MAP[p.status]?.variant ?? 'outline'}>
                      {STATUS_MAP[p.status]?.label ?? p.status}
                    </Badge>
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: IOS.label2, fontWeight: '600' }}>
                  {p.progress}%
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <ProgressBar value={p.progress} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ fontSize: 11, color: IOS.label2 }}>
                  {p.province ?? ''}{p.city ?? ''}
                </Text>
                <Text style={{ fontSize: 11, color: IOS.label2, fontWeight: '600', fontFamily: 'SpaceMono' }}>
                  ¥{(p.total_budget ?? 0).toLocaleString()}
                </Text>
              </View>
            </Card>
          </Pressable>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 60, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md,
  },
  title: { fontSize: 28, fontWeight: '800', color: IOS.label, letterSpacing: -0.5 },
  createBtn: {
    backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  createBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  searchWrap: { paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  statsRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.xl, marginBottom: Spacing.md,
  },
  statPill: {
    flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.md,
  },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 10, color: IOS.label2, marginTop: 2 },
  projectCard: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  projectHeader: {
    flexDirection: 'row', alignItems: 'center',
  },
  projectIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primaryBg,
    justifyContent: 'center', alignItems: 'center',
  },
  projectName: {
    fontSize: 15, fontWeight: '700', color: IOS.label,
  },
})
