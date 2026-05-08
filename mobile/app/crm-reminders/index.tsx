import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface Reminder {
  id: string
  title: string
  contact_name: string
  reminder_type: string
  due_date: string
  status: string
  notes?: string
}

export default function CrmRemindersScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['crm-reminders'],
    queryFn: () => api.get<{ items: Reminder[]; total: number }>('/crm/reminders'),
  })

  const items = data?.items ?? []
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const pendingCount = items.filter((r: Reminder) => r.status === 'pending').length
  const overdueCount = items.filter((r: Reminder) => r.status === 'overdue').length

  return (
    <View style={styles.container}>
      <PageHeader title="CRM提醒" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="待跟进" value={String(pendingCount)} icon={{ name: 'notifications-outline', color: Colors.warning }} color={Colors.warning} /></View>
        <View style={{ flex: 1 }}><KpiCard title="已逾期" value={String(overdueCount)} icon={{ name: 'alert-circle-outline', color: Colors.danger }} color={Colors.danger} /></View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'notifications-outline' }} title="暂无提醒" />}
        renderItem={({ item: r }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>{r.title}</Text>
              <Badge variant={r.status === 'overdue' ? 'danger' : r.status === 'pending' ? 'warning' : 'success'}>
                {r.status === 'overdue' ? '已逾期' : r.status === 'pending' ? '待跟进' : '已完成'}
              </Badge>
            </View>
            <Text style={styles.cardContact}>{r.contact_name} · {r.reminder_type}</Text>
            {r.notes && <Text style={styles.cardNotes} numberOfLines={2}>{r.notes}</Text>}
            <Text style={styles.cardDue}>到期: {r.due_date}</Text>
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
  cardTitle: { fontSize: 15, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
  cardContact: { fontSize: 13, color: IOS.label2, marginTop: 6 },
  cardNotes: { fontSize: 12, color: IOS.label2, marginTop: 4, fontStyle: 'italic' },
  cardDue: { fontSize: 12, color: IOS.label2, fontWeight: '600', marginTop: 8 },
})
