import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, KpiCard, SectionHeader, Badge, ProgressBar, EmptyState, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

export default function BusinessTwinScreen() {
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['business-twin-timeline'],
    queryFn: () => api.get<{
      events: { id: string; date: string; title: string; type: string; description: string }[]
      kpis: { total_events: number; revenue_impact: number; active_projects: number }
    }>('/business-twin/timeline'),
  })

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const events = data?.events ?? []
  const kpis = data?.kpis ?? { total_events: 0, revenue_impact: 0, active_projects: 0 }
  const fmt = (v: number) => v >= 10000 ? `¥${(v / 10000).toFixed(1)}万` : `¥${v.toLocaleString()}`

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <PageHeader title="业务时间轴" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="事件总数" value={String(kpis.total_events)} icon={{ name: 'calendar-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="收入影响" value={fmt(kpis.revenue_impact)} icon={{ name: 'wallet-outline', color: Colors.success }} color={Colors.success} /></View>
      </View>

      <SectionHeader title="时间轴" />
      {events.length === 0 ? (
        <EmptyState icon={{ name: 'calendar-outline' }} title="暂无业务事件" />
      ) : (
        events.map((event, i) => (
          <Card key={event.id} style={styles.eventCard}>
            <View style={styles.timelineRow}>
              <View style={styles.timelineDot}>
                <View style={[styles.dot, { backgroundColor: i === 0 ? Colors.primary : '#D1D5DB' }]} />
                {i < events.length - 1 && <View style={styles.timelineLine} />}
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Badge variant="outline">{event.type}</Badge>
                </View>
                <Text style={styles.eventDesc} numberOfLines={2}>{event.description}</Text>
                <Text style={styles.eventDate}>{event.date}</Text>
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
  eventCard: { marginHorizontal: Spacing.xl, marginBottom: 0, padding: Spacing.md, borderBottomWidth: 0 },
  timelineRow: { flexDirection: 'row' },
  timelineDot: { width: 20, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  timelineLine: { width: 2, flex: 1, backgroundColor: '#E5E7EB', marginTop: 4 },
  eventTitle: { fontSize: 14, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
  eventDesc: { fontSize: 12, color: IOS.label2, marginTop: 4, lineHeight: 18 },
  eventDate: { fontSize: 11, color: IOS.label2, marginTop: 4 },
})
