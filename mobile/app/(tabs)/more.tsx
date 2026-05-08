import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { LinearGradient } from 'expo-linear-gradient'
import { Colors, Gradients, IOS, Spacing, Radius } from '../../src/theme/colors'

const MENU_GROUPS = [
  {
    label: '工程数据',
    gradient: Gradients.primary,
    items: [
      { title: '施工日志', icon: 'create-outline', path: '/engineering/logs' },
      { title: '工单管理', icon: 'build-outline', path: '/engineering/tickets' },
      { title: '安全巡检', icon: 'shield-checkmark-outline', path: '/engineering/inspections' },
    ],
  },
  {
    label: '充电运营',
    gradient: Gradients.green,
    items: [
      { title: '站点管理', icon: 'location-outline', path: '/charging/stations' },
      { title: '设备管理', icon: 'plug-outline', path: '/charging/devices' },
      { title: '运营监控', icon: 'cellular-outline', path: '/charging/operations' },
      { title: '充电订单', icon: 'battery-charging-outline', path: '/charging/orders' },
      { title: '场地线索', icon: 'search-outline', path: '/charging/leads' },
      { title: '运营策略', icon: 'target-outline', path: '/charging/strategy' },
      { title: '运营备忘', icon: 'document-text-outline', path: '/charging/operation-memo' },
      { title: '投资回报', icon: 'trending-up-outline', path: '/charging/investment-roi' },
    ],
  },
  {
    label: '采购与供应链',
    gradient: Gradients.amber,
    items: [
      { title: '供应商列表', icon: 'business-outline', path: '/erp/suppliers' },
      { title: '对手方流水', icon: 'sync-outline', path: '/erp/counterparty-flow' },
      { title: '采购管理', icon: 'cart-outline', path: '/erp/procurement' },
      { title: '采购订单', icon: 'clipboard-outline', path: '/erp/purchase-orders' },
      { title: '收货记录', icon: 'cube-outline', path: '/erp/receipts' },
      { title: 'ERP合同', icon: 'document-outline', path: '/erp/contracts' },
    ],
  },
  {
    label: '资产数据',
    gradient: Gradients.gray,
    items: [
      { title: '仓库管理', icon: 'business-outline', path: '/warehouse' },
      { title: '固定资产', icon: 'desktop-outline', path: '/fixed-assets' },
    ],
  },
  {
    label: '业务管理',
    gradient: Gradients.purple,
    items: [
      { title: '差旅管理', icon: 'airplane-outline', path: '/travel' },
      { title: '我的待办', icon: 'checkmark-circle-outline', path: '/my-todo' },
      { title: '业务报销', icon: 'cash-outline', path: '/business' },
      { title: 'CRM提醒', icon: 'notifications-outline', path: '/crm-reminders' },
      { title: '审计管理', icon: 'search-outline', path: '/audit' },
      { title: '实体管理', icon: 'business-outline', path: '/entities' },
      { title: '跨实体流水', icon: 'shuffle-outline', path: '/cross-entity-flow' },
    ],
  },
  {
    label: '数字孪生',
    gradient: Gradients.primary,
    items: [
      { title: '业务时间轴', icon: 'calendar-outline', path: '/business-twin' },
      { title: '知识图谱', icon: 'link-outline', path: '/business-twin/graph' },
      { title: '预测中心', icon: 'stats-chart-outline', path: '/business-twin/predictions' },
      { title: '模拟沙盘', icon: 'dice-outline', path: '/business-twin/simulate' },
      { title: 'AI业务助手', icon: 'hardware-chip-outline', path: '/business-twin/assistant' },
    ],
  },
  {
    label: '智能进化',
    gradient: Gradients.purple,
    items: [
      { title: '进化仪表盘', icon: 'bulb-outline', path: '/agent-evolution' },
      { title: '工作流列表', icon: 'sync-outline', path: '/agent-evolution/workflows' },
      { title: '进化审批', icon: 'checkmark-done-outline', path: '/agent-evolution/approvals' },
    ],
  },
  {
    label: '系统管理',
    gradient: Gradients.gray,
    items: [
      { title: '组织架构', icon: 'business-outline', path: '/organization' },
      { title: '审批流程配置', icon: 'git-branch-outline', path: '/workflow-config' },
      { title: '系统配置', icon: 'settings-outline', path: '/system' },
      { title: '操作日志', icon: 'list-outline', path: '/logs' },
      { title: '高管看板', icon: 'crown-outline', path: '/executive' },
    ],
  },
]

export default function MoreScreen() {
  const router = useRouter()

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>更多功能</Text>
      </View>

      {MENU_GROUPS.map((group) => (
        <View key={group.label} style={styles.group}>
          <View style={styles.groupHeader}>
            <LinearGradient
              colors={group.gradient as unknown as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.groupIcon}
            >
              <Ionicons
                name={getGroupIcon(group.label) as any}
                size={14}
                color="#FFF"
              />
            </LinearGradient>
            <Text style={styles.groupLabel}>{group.label}</Text>
          </View>
          <View style={styles.groupContent}>
            {group.items.map((item, idx) => (
              <Pressable
                key={item.path}
                style={[styles.menuRow, idx < group.items.length - 1 && styles.menuRowBorder]}
                onPress={() => router.push(item.path as `/${string}`)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Ionicons name={item.icon as any} size={20} color={IOS.label} />
                  <Text style={styles.menuRowTitle}>{item.title}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={IOS.label3} />
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

function getGroupIcon(label: string): string {
  const map: Record<string, string> = {
    '工程数据': 'construct-outline',
    '充电运营': 'flash-outline',
    '采购与供应链': 'cube-outline',
    '资产数据': 'grid-outline',
    '业务管理': 'briefcase-outline',
    '数字孪生': 'analytics-outline',
    '智能进化': 'hardware-chip-outline',
    '系统管理': 'settings-outline',
  }
  return map[label] ?? 'apps-outline'
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  header: {
    paddingTop: 60, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.lg,
  },
  title: { fontSize: 28, fontWeight: '800', color: IOS.label, letterSpacing: -0.5 },
  group: {
    marginBottom: Spacing.md,
    marginHorizontal: Spacing.xl,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    gap: 8,
  },
  groupIcon: {
    width: 22, height: 22, borderRadius: 6, justifyContent: 'center', alignItems: 'center',
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: IOS.label2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  groupContent: {
    backgroundColor: IOS.card,
    borderRadius: 14,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
  },
  menuRowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: IOS.separator,
  },
  menuRowTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: IOS.label,
  },
})
