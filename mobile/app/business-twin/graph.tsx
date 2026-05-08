import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, KpiCard, SectionHeader, Badge, EmptyState, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

export default function KnowledgeGraphScreen() {
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['knowledge-graph'],
    queryFn: () => api.get<{
      nodes: { id: string; name: string; type: string; connections: number }[]
      total_nodes: number
      total_edges: number
    }>('/business-twin/graph'),
  })

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const nodes = data?.nodes ?? []
  const typeColors: Record<string, string> = {
    company: Colors.primary, person: Colors.success, project: Colors.warning,
    contract: Colors.info, station: '#8B5CF6', device: Colors.danger,
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <PageHeader title="知识图谱" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="实体节点" value={String(data?.total_nodes ?? 0)} icon={{ name: 'link-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="关系边数" value={String(data?.total_edges ?? 0)} icon={{ name: 'swap-horizontal-outline', color: Colors.info }} color={Colors.info} /></View>
      </View>

      <SectionHeader title="实体列表" />
      {nodes.length === 0 ? (
        <EmptyState icon={{ name: 'link-outline' }} title="暂无图谱数据" />
      ) : (
        nodes.map((node) => (
          <Card key={node.id} style={styles.nodeCard}>
            <View style={styles.nodeRow}>
              <View style={[styles.nodeTypeDot, { backgroundColor: typeColors[node.type] ?? Colors.primary }]} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.nodeName}>{node.name}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                  <Badge variant="outline">{node.type}</Badge>
                  <Badge variant="default">{node.connections} 关联</Badge>
                </View>
              </View>
            </View>
          </Card>
        ))
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  kpiRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  nodeCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  nodeRow: { flexDirection: 'row', alignItems: 'center' },
  nodeTypeDot: { width: 12, height: 12, borderRadius: 6 },
  nodeName: { fontSize: 15, fontWeight: '700', color: IOS.label },
})
