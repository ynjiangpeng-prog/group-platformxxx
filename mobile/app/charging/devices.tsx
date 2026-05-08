import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader } from '../../src/components/DesignSystem'
import { Colors, IOS, Spacing, Radius } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface Device {
  id: string
  device_code: string
  station_name: string
  device_type: string
  power_kw: number
  status: string
  last_heartbeat: string
  total_kwh: number
}

const DEVICE_STATUS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'outline' }> = {
  online: { label: '在线', variant: 'success' },
  charging: { label: '充电中', variant: 'default' },
  offline: { label: '离线', variant: 'danger' },
  fault: { label: '故障', variant: 'danger' },
  maintenance: { label: '维护中', variant: 'warning' },
}

export default function DevicesScreen() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['charging-devices'],
    queryFn: () => api.get<{ items: Device[]; total: number }>('/charging/devices'),
  })

  const devices = data?.items ?? []
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  const onlineCount = devices.filter((d: Device) => d.status === 'online' || d.status === 'charging').length
  const faultCount = devices.filter((d: Device) => d.status === 'fault').length

  return (
    <View style={styles.container}>
      <PageHeader title="设备管理" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}><KpiCard title="设备总数" value={String(devices.length)} icon={{ name: 'plug-outline', color: Colors.primary }} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><KpiCard title="在线" value={String(onlineCount)} icon={{ name: 'checkmark-circle-outline', color: Colors.success }} color={Colors.success} /></View>
      </View>
      {faultCount > 0 && (
        <View style={styles.kpiRow}>
          <View style={{ flex: 1 }}><KpiCard title="故障设备" value={String(faultCount)} icon={{ name: 'alert-circle-outline', color: Colors.danger }} color={Colors.danger} /></View>
        </View>
      )}

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'plug-outline' }} title="暂无设备" />}
        renderItem={({ item: d }) => (
          <Card style={styles.deviceCard}>
            <View style={styles.deviceHeader}>
              <View style={styles.deviceIcon}>
                <Ionicons name="plug-outline" size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.deviceCode}>{d.device_code}</Text>
                <Text style={styles.deviceStation}>{d.station_name}</Text>
              </View>
              <Badge variant={DEVICE_STATUS[d.status]?.variant ?? 'outline'}>
                {DEVICE_STATUS[d.status]?.label ?? d.status}
              </Badge>
            </View>
            <View style={styles.deviceMeta}>
              <Text style={styles.deviceInfo}>{d.device_type} · {d.power_kw}kW</Text>
              <Text style={styles.deviceInfo}>累计 {d.total_kwh?.toFixed(0) ?? 0} kWh</Text>
            </View>
            <Text style={styles.deviceHeartbeat}>最后心跳: {d.last_heartbeat ?? '-'}</Text>
          </Card>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  kpiRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  deviceCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  deviceHeader: { flexDirection: 'row', alignItems: 'center' },
  deviceIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primaryBg, justifyContent: 'center', alignItems: 'center' },
  deviceCode: { fontSize: 14, fontWeight: '700', color: IOS.label, fontFamily: 'SpaceMono' },
  deviceStation: { fontSize: 12, color: IOS.label2, marginTop: 2 },
  deviceMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  deviceInfo: { fontSize: 12, color: IOS.label2 },
  deviceHeartbeat: { fontSize: 11, color: IOS.label2, marginTop: 6 },
})
