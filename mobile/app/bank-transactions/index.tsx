import Ionicons from '@expo/vector-icons/Ionicons'
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, Badge, SectionHeader, EmptyState, PageHeader, SearchBar } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface BankTransaction {
  id: string
  transaction_date: string
  amount: number
  direction: 'in' | 'out'
  counterparty: string
  description: string
  balance_after: number
  bank_account: string
}

export default function BankTransactionsScreen() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['bank-transactions', search],
    queryFn: () => api.get<{ items: BankTransaction[]; total: number }>(`/finance/bank-transactions?keyword=${search}`),
  })

  const transactions = data?.items ?? []
  const fmt = (v: number) => v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()

  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  if (isLoading && !data) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <PageHeader title="银行流水" onBack={() => router.back()} />

      <SearchBar value={search} onChangeText={setSearch} placeholder="搜索对方名称、摘要..." />

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon={{ name: 'business-outline' }} title="暂无流水" subtitle="银行流水记录为空" />}
        renderItem={({ item: txn }) => (
          <Card style={styles.txnCard}>
            <View style={styles.txnHeader}>
              <View style={[styles.txnDirection, { backgroundColor: txn.direction === 'in' ? Colors.successBg : Colors.dangerBg }]}>
                <Ionicons name={txn.direction === 'in' ? 'arrow-down-outline' : 'arrow-up-outline'} size={14} color={txn.direction === 'in' ? Colors.success : Colors.danger} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.txnCounterparty} numberOfLines={1}>{txn.counterparty}</Text>
                <Text style={styles.txnDesc} numberOfLines={1}>{txn.description}</Text>
              </View>
              <Text style={[styles.txnAmount, { color: txn.direction === 'in' ? Colors.success : Colors.danger }]}>
                {txn.direction === 'in' ? '+' : '-'}¥{fmt(txn.amount)}
              </Text>
            </View>
            <View style={styles.txnFooter}>
              <Text style={styles.txnMeta}>{txn.transaction_date} · {txn.bank_account}</Text>
              <Text style={styles.txnBalance}>余额 ¥{fmt(txn.balance_after)}</Text>
            </View>
          </Card>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  txnCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.md },
  txnHeader: { flexDirection: 'row', alignItems: 'center' },
  txnDirection: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  txnCounterparty: { fontSize: 14, fontWeight: '700', color: IOS.label },
  txnDesc: { fontSize: 12, color: IOS.label2, marginTop: 2 },
  txnAmount: { fontSize: 16, fontWeight: '800' },
  txnFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: IOS.separator },
  txnMeta: { fontSize: 11, color: IOS.label2 },
  txnBalance: { fontSize: 11, color: IOS.label2, fontWeight: '600' },
})
