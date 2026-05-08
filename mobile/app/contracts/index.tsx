import Ionicons from '@expo/vector-icons/Ionicons'
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Card, Badge, SectionHeader, EmptyState, PageHeader, SearchBar } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { listContracts } from '../../src/api/services'
import type { Contract } from '../../src/api/types'

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'outline' }> = {
  draft: { label: '草稿', variant: 'outline' },
  pending: { label: '待审批', variant: 'warning' },
  active: { label: '执行中', variant: 'default' },
  completed: { label: '已完成', variant: 'success' },
  terminated: { label: '已终止', variant: 'danger' },
}

const TYPE_MAP: Record<string, string> = {
  sales: '销售合同', purchase: '采购合同', service: '服务合同',
  construction: '施工合同', lease: '租赁合同', other: '其他',
}

export default function ContractsListScreen() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['contracts', search],
    queryFn: () => listContracts({ page: 1, page_size: 50, keyword: search || undefined }),
  })

  const contracts = data?.items ?? []
  const fmt = (v: number) => v >= 10000 ? `¥${(v / 10000).toFixed(1)}万` : `¥${v.toLocaleString()}`

  const onRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  if (isLoading && !data) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <PageHeader title="合同列表" onBack={() => router.back()} />

      <SearchBar value={search} onChangeText={setSearch} placeholder="搜索合同名称、编号..." />

      <View style={styles.statsRow}>
        <View style={[styles.statPill, { backgroundColor: Colors.primaryBg }]}>
          <Text style={[styles.statValue, { color: Colors.primary }]}>{contracts.length}</Text>
          <Text style={styles.statLabel}>全部</Text>
        </View>
        <View style={[styles.statPill, { backgroundColor: Colors.successBg }]}>
          <Text style={[styles.statValue, { color: Colors.success }]}>
            {contracts.filter((c: Contract) => c.status === 'active').length}
          </Text>
          <Text style={styles.statLabel}>执行中</Text>
        </View>
        <View style={[styles.statPill, { backgroundColor: Colors.warningBg }]}>
          <Text style={[styles.statValue, { color: Colors.warning }]}>
            {contracts.filter((c: Contract) => c.status === 'pending').length}
          </Text>
          <Text style={styles.statLabel}>待审批</Text>
        </View>
      </View>

      <FlatList
        data={contracts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'document-outline' }} title="暂无合同" subtitle="合同数据为空" />}
        renderItem={({ item: c }) => (
          <Pressable onPress={() => router.push(`/contracts/${c.id}`)}>
            <Card style={styles.contractCard}>
              <View style={styles.contractHeader}>
                <Text style={styles.contractName} numberOfLines={1}>{c.name}</Text>
                <Badge variant={STATUS_MAP[c.status]?.variant ?? 'outline'}>
                  {STATUS_MAP[c.status]?.label ?? c.status}
                </Badge>
              </View>
              <View style={styles.contractMeta}>
                <Text style={styles.contractNo}>{c.contract_no}</Text>
                <Badge variant="outline">{TYPE_MAP[c.contract_type] ?? c.contract_type}</Badge>
              </View>
              <View style={styles.contractFooter}>
                <View>
                  <Text style={styles.amountLabel}>合同金额</Text>
                  <Text style={styles.amountValue}>{fmt(c.total_amount ?? 0)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.amountLabel}>已付金额</Text>
                  <Text style={[styles.amountValue, { color: Colors.success }]}>{fmt(c.paid_amount)}</Text>
                </View>
              </View>
              {(c.party_a || c.party_b) && (
                <View style={styles.partyRow}>
                  <Text style={styles.partyText}>{c.party_a} → {c.party_b}</Text>
                </View>
              )}
            </Card>
          </Pressable>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  statPill: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.md },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 10, color: IOS.label2, marginTop: 2 },
  contractCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  contractHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  contractName: { fontSize: 15, fontWeight: '700', color: IOS.label, flex: 1, marginRight: 8 },
  contractMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  contractNo: { fontSize: 12, color: IOS.label2, fontFamily: 'SpaceMono' },
  contractFooter: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: IOS.separator,
  },
  amountLabel: { fontSize: 11, color: IOS.label2, marginBottom: 2 },
  amountValue: { fontSize: 16, fontWeight: '800', color: IOS.label },
  partyRow: { marginTop: 8 },
  partyText: { fontSize: 11, color: IOS.label2 },
})
