import Ionicons from '@expo/vector-icons/Ionicons'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Card, Badge, SectionHeader, EmptyState, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface OrgNode {
  id: string
  name: string
  parent_id?: string
  head_name?: string
  member_count: number
  level: number
}

export default function OrganizationScreen() {
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['organization'],
    queryFn: () => api.get<{ departments: OrgNode[]; total_members: number; total_departments: number }>('/organization'),
  })

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const departments = data?.departments ?? []

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <PageHeader title="组织架构" onBack={() => router.back()} />

      <Card style={styles.summaryCard}>
        <View style={styles.summaryGrid}>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryLabel}>部门总数</Text>
            <Text style={styles.summaryValue}>{data?.total_departments ?? 0}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryLabel}>总人数</Text>
            <Text style={styles.summaryValue}>{data?.total_members ?? 0}</Text>
          </View>
        </View>
      </Card>

      <SectionHeader title="部门列表" />
      {departments.length === 0 ? (
        <EmptyState icon={{ name: 'business-outline' }} title="暂无组织数据" />
      ) : (
        departments.map((dept) => (
          <Card key={dept.id} style={styles.deptCard}>
            <View style={styles.deptHeader}>
              <View style={[styles.deptIcon, { backgroundColor: Colors.primaryBg }]}>
                <Ionicons name="business-outline" size={16} color={Colors.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.deptName}>{dept.name}</Text>
                {dept.head_name && <Text style={styles.deptHead}>负责人: {dept.head_name}</Text>}
              </View>
              <Badge variant="outline">{dept.member_count}人</Badge>
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
  summaryCard: { marginHorizontal: Spacing.xl, padding: Spacing.xl, marginBottom: Spacing.md },
  summaryGrid: { flexDirection: 'row' },
  summaryDivider: { width: 1, backgroundColor: IOS.separator, marginHorizontal: Spacing.lg },
  summaryLabel: { fontSize: 12, color: IOS.label2, fontWeight: '500', marginBottom: 4 },
  summaryValue: { fontSize: 24, fontWeight: '800', color: IOS.label },
  deptCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  deptHeader: { flexDirection: 'row', alignItems: 'center' },
  deptIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  deptName: { fontSize: 15, fontWeight: '700', color: IOS.label },
  deptHead: { fontSize: 12, color: IOS.label2, marginTop: 2 },
})
