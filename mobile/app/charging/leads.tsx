import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, IOS, Spacing, Radius } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface Lead {
  id: string
  contact_name: string
  contact_phone: string
  location: string
  parking_count: number
  source: string
  status: string
  created_at: string
  notes?: string
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'outline' }> = {
  new: { label: '新线索', variant: 'default' },
  contacted: { label: '已联系', variant: 'info' as unknown as 'default' },
  visiting: { label: '已踏勘', variant: 'warning' },
  negotiating: { label: '谈判中', variant: 'default' },
  won: { label: '已签约', variant: 'success' },
  lost: { label: '已流失', variant: 'danger' },
}

export default function LeadsScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['charging-leads'],
    queryFn: () => api.get<{ items: Lead[]; total: number }>('/charging/leads'),
  })

  const leads = data?.items ?? []
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const newCount = leads.filter((l: Lead) => l.status === 'new').length

  return (
    <View style={styles.container}>
      <PageHeader title="场地线索" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="线索总数" value={String(leads.length)} icon={{ name: 'search-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="新线索" value={String(newCount)} icon={{ name: 'sparkles-outline', color: Colors.warning }} color={Colors.warning} /></View>
      </View>

      <FlatList
        data={leads}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'search-outline' }} title="暂无线索" />}
        renderItem={({ item: l }) => (
          <Card style={styles.leadCard}>
            <View style={styles.leadHeader}>
              <Text style={styles.leadContact}>{l.contact_name}</Text>
              <Badge variant={STATUS_MAP[l.status]?.variant ?? 'outline'}>
                {STATUS_MAP[l.status]?.label ?? l.status}
              </Badge>
            </View>
            <Text style={styles.leadPhone}>{l.contact_phone}</Text>
            <Text style={styles.leadLocation}><Ionicons name="location-outline" size={13} color={IOS.label2} /> {l.location}</Text>
            <View style={styles.leadFooter}>
              <Text style={styles.leadMeta}>车位: {l.parking_count} · 来源: {l.source}</Text>
              <Text style={styles.leadDate}>{l.created_at}</Text>
            </View>
            {l.notes && <Text style={styles.leadNotes} numberOfLines={2}>{l.notes}</Text>}
          </Card>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  kpiRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  leadCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  leadHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  leadContact: { fontSize: 15, fontWeight: '700', color: IOS.label },
  leadPhone: { fontSize: 13, color: IOS.label2, marginTop: 4, fontFamily: 'SpaceMono' },
  leadLocation: { fontSize: 13, color: IOS.label2, marginTop: 4 },
  leadFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: IOS.separator },
  leadMeta: { fontSize: 11, color: IOS.label2 },
  leadDate: { fontSize: 11, color: IOS.label2 },
  leadNotes: { fontSize: 12, color: IOS.label2, marginTop: 8, fontStyle: 'italic' },
})
