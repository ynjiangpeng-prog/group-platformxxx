import Ionicons from '@expo/vector-icons/Ionicons'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Card, Badge, SectionHeader, EmptyState, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

export default function SystemScreen() {
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['system-config'],
    queryFn: () => api.get<{
      version: string
      environment: string
      features: { key: string; name: string; enabled: boolean }[]
    }>('/system/config'),
  })

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const features = data?.features ?? []

  const quickActions = [
    { icon: 'clipboard-outline' as const, title: '操作日志', path: '/logs' },
    { icon: 'business-outline' as const, title: '组织架构', path: '/organization' },
    { icon: 'sync-outline' as const, title: '审批流程', path: '/workflow-config' },
  ]

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <PageHeader title="系统配置" onBack={() => router.back()} />

      <Card style={styles.infoCard}>
        <SectionHeader title="系统信息" />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>版本</Text>
          <Text style={styles.infoValue}>{data?.version ?? '—'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>环境</Text>
          <Badge variant={data?.environment === 'production' ? 'success' : 'warning'}>
            {data?.environment ?? '—'}
          </Badge>
        </View>
      </Card>

      <Card style={styles.section}>
        <SectionHeader title="功能开关" />
        {features.length === 0 ? (
          <EmptyState icon={{ name: 'settings-outline' }} title="暂无配置" />
        ) : (
          features.map((f) => (
            <View key={f.key} style={styles.featureRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureName}>{f.name}</Text>
                <Text style={styles.featureKey}>{f.key}</Text>
              </View>
              <Badge variant={f.enabled ? 'success' : 'outline'}>
                {f.enabled ? '开启' : '关闭'}
              </Badge>
            </View>
          ))
        )}
      </Card>

      <Card style={styles.section}>
        <SectionHeader title="快捷操作" />
        {quickActions.map((item) => (
          <Pressable key={item.path} style={styles.actionRow} onPress={() => router.push(item.path as `/${string}`)}>
            <Ionicons name={item.icon} size={18} color={IOS.label2} style={{ marginRight: 12 }} />
            <Text style={styles.actionTitle}>{item.title}</Text>
            <Ionicons name="chevron-forward-outline" size={14} color={IOS.placeholder} style={{ marginLeft: 'auto' }} />
          </Pressable>
        ))}
      </Card>

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  infoCard: { marginHorizontal: Spacing.xl, padding: Spacing.lg, marginBottom: Spacing.md },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm },
  infoLabel: { fontSize: 13, color: IOS.label2 },
  infoValue: { fontSize: 13, color: IOS.label, fontWeight: '600' },
  section: { marginHorizontal: Spacing.xl, padding: Spacing.lg, marginBottom: Spacing.md },
  featureRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: IOS.separator },
  featureName: { fontSize: 14, fontWeight: '600', color: IOS.label },
  featureKey: { fontSize: 11, color: IOS.label2, marginTop: 2 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: IOS.separator },
  actionTitle: { fontSize: 15, fontWeight: '500', color: IOS.label },
})
