import Ionicons from '@expo/vector-icons/Ionicons'
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, Badge, SectionHeader, EmptyState, KpiCard, PageHeader, SearchBar } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface Invoice {
  id: string
  invoice_no: string
  title: string
  invoice_type: string
  amount: number
  tax_amount: number
  status: string
  issue_date: string
  counterparty: string
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'outline' }> = {
  draft: { label: '草稿', variant: 'outline' },
  issued: { label: '已开具', variant: 'default' },
  received: { label: '已收到', variant: 'success' },
  cancelled: { label: '已作废', variant: 'danger' },
  pending: { label: '待处理', variant: 'warning' },
}

export default function InvoicesScreen() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['invoices', search],
    queryFn: () => api.get<{ items: Invoice[]; total: number }>(`/invoices?keyword=${search}`),
  })

  const invoices = data?.items ?? []
  const fmt = (v: number) => v >= 10000 ? `¥${(v / 10000).toFixed(1)}万` : `¥${v.toLocaleString()}`

  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <PageHeader title="发票管理" onBack={() => router.back()} />

      <View style={styles.kpiRow}>
        <View style={{ flex: 1 }}>
          <KpiCard title="发票总数" value={String(data?.total ?? 0)} icon={{ name: 'document-outline', color: Colors.primary }} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <KpiCard title="总金额" value={fmt(invoices.reduce((s: number, i: Invoice) => s + i.amount, 0))} icon={{ name: 'wallet-outline', color: Colors.success }} color={Colors.success} />
        </View>
      </View>

      <SearchBar value={search} onChangeText={setSearch} placeholder="搜索发票号、对方名称..." />

      <FlatList
        data={invoices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'document-outline' }} title="暂无发票" subtitle="发票记录为空" />}
        renderItem={({ item: inv }) => (
          <Card style={styles.invoiceCard}>
            <View style={styles.invoiceHeader}>
              <Text style={styles.invoiceTitle} numberOfLines={1}>{inv.title || inv.invoice_no}</Text>
              <Badge variant={STATUS_MAP[inv.status]?.variant ?? 'outline'}>
                {STATUS_MAP[inv.status]?.label ?? inv.status}
              </Badge>
            </View>
            <Text style={styles.invoiceNo}>{inv.invoice_no}</Text>
            <View style={styles.invoiceFooter}>
              <View>
                <Text style={styles.invoiceLabel}>金额</Text>
                <Text style={styles.invoiceAmount}>{fmt(inv.amount)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.invoiceLabel}>税额</Text>
                <Text style={styles.invoiceAmount}>{fmt(inv.tax_amount)}</Text>
              </View>
            </View>
            <Text style={styles.invoiceParty}>{inv.counterparty} · {inv.issue_date}</Text>
          </Card>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  kpiRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  invoiceCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  invoiceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  invoiceTitle: { fontSize: 15, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
  invoiceNo: { fontSize: 12, color: IOS.label2, fontFamily: 'SpaceMono', marginTop: 4 },
  invoiceFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: IOS.separator },
  invoiceLabel: { fontSize: 11, color: IOS.label2, marginBottom: 2 },
  invoiceAmount: { fontSize: 16, fontWeight: '800', color: IOS.label },
  invoiceParty: { fontSize: 11, color: IOS.label2, marginTop: 8 },
})
