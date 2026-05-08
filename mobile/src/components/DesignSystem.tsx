import React from 'react'
import { View, Text, StyleSheet, Pressable, ActivityIndicator, TextInput, type ViewStyle } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { LinearGradient } from 'expo-linear-gradient'
import { Colors, IOS, Radius, Shadows, Spacing } from '../theme/colors'

// ─── Icon Source Type ───
export type IconSource = string | { name: string; color?: string; size?: number }

function renderIcon(icon: IconSource | undefined, fallbackSize = 20, fallbackColor = IOS.label2) {
  if (!icon) return null
  if (typeof icon === 'string') return <Text style={{ fontSize: fallbackSize }}>{icon}</Text>
  return <Ionicons name={icon.name as any} size={icon.size ?? fallbackSize} color={icon.color ?? fallbackColor} />
}

// ─── Card ───
export function Card({ children, style, onPress }: {
  children: React.ReactNode
  style?: ViewStyle
  onPress?: () => void
}) {
  const Wrapper = onPress ? Pressable : View
  return <Wrapper onPress={onPress} style={[ds.card, style]}>{children}</Wrapper>
}

// ─── KPI Card ───
export function KpiCard({ title, value, subtitle, icon, color, trend }: {
  title: string
  value: string | number
  subtitle?: string
  icon?: IconSource
  color?: string
  trend?: { value: number; label?: string }
}) {
  const isPositive = trend && trend.value >= 0
  return (
    <Card style={ds.kpiCard}>
      <View style={ds.kpiHeader}>
        <Text style={ds.kpiTitle}>{title}</Text>
        {icon && (
          <View style={[ds.kpiIcon, { backgroundColor: color ? `${color}12` : IOS.fill }]}>
            {typeof icon === 'string' ? <Text style={{ fontSize: 14 }}>{icon}</Text>
              : <Ionicons name={icon.name as any} size={icon.size ?? 16} color={icon.color ?? color ?? Colors.primary} />}
          </View>
        )}
      </View>
      <Text style={[ds.kpiValue, color ? { color } : {}]}>{value}</Text>
      {subtitle && <Text style={ds.kpiSub}>{subtitle}</Text>}
      {trend !== undefined && (
        <Text style={[ds.kpiTrend, { color: isPositive ? Colors.success : Colors.danger }]}>
          {isPositive ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label ?? ''}
        </Text>
      )}
    </Card>
  )
}

// ─── Badge ───
export function Badge({ children, variant = 'default' }: {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline'
}) {
  const c = {
    default: { bg: Colors.primaryBg, text: Colors.primary },
    success: { bg: Colors.successBg, text: Colors.success },
    warning: { bg: Colors.warningBg, text: Colors.warning },
    danger: { bg: Colors.dangerBg, text: Colors.danger },
    info: { bg: Colors.infoBg, text: Colors.info },
    outline: { bg: 'transparent', text: IOS.label2 },
  }[variant]
  return (
    <View style={[ds.badge, { backgroundColor: c.bg }, variant === 'outline' && { borderWidth: 1, borderColor: IOS.separator }]}>
      <Text style={[ds.badgeText, { color: c.text }]}>{children}</Text>
    </View>
  )
}

// ─── Button ───
export function Button({ title, onPress, variant = 'primary', size = 'md', loading, disabled }: {
  title: string
  onPress: () => void
  variant?: 'primary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
}) {
  const bg = { primary: Colors.primary, outline: 'transparent', ghost: 'transparent', danger: Colors.danger }[variant]
  const tc = variant === 'primary' || variant === 'danger' ? '#FFF' : Colors.primary
  const py = { sm: 6, md: 10, lg: 14 }[size]
  const fs = { sm: 13, md: 15, lg: 17 }[size]
  return (
    <Pressable onPress={loading || disabled ? undefined : onPress}
      style={[ds.button, { backgroundColor: bg, paddingVertical: py, paddingHorizontal: py * 1.5 },
        variant === 'outline' && { borderWidth: 1.5, borderColor: Colors.primary },
        (disabled || loading) && { opacity: 0.5 }]}>
      {loading ? <ActivityIndicator color={tc} size="small" /> : <Text style={[ds.buttonText, { color: tc, fontSize: fs }]}>{title}</Text>}
    </Pressable>
  )
}

// ─── Section Header ───
export function SectionHeader({ title, action, onAction }: {
  title: string
  action?: string
  onAction?: () => void
}) {
  return (
    <View style={ds.sectionHeader}>
      <Text style={ds.sectionTitle}>{title}</Text>
      {action && <Pressable onPress={onAction}><Text style={ds.sectionAction}>{action}</Text></Pressable>}
    </View>
  )
}

// ─── Progress Bar ───
export function ProgressBar({ value, color }: { value: number; color?: string }) {
  return (
    <View style={ds.progressBg}>
      <View style={[ds.progressFill, { width: `${Math.min(Math.max(value, 0), 100)}%`, backgroundColor: color ?? Colors.primary }]} />
    </View>
  )
}

// ─── Empty State ───
export function EmptyState({ icon, title, subtitle }: {
  icon: IconSource
  title: string
  subtitle?: string
}) {
  return (
    <View style={ds.emptyState}>
      {typeof icon === 'string' ? <Text style={ds.emptyIconEmoji}>{icon}</Text> : (
        <View style={ds.emptyIconWrap}>
          <Ionicons name={icon.name as any} size={32} color={icon.color ?? IOS.label2} />
        </View>
      )}
      <Text style={ds.emptyTitle}>{title}</Text>
      {subtitle && <Text style={ds.emptySub}>{subtitle}</Text>}
    </View>
  )
}

// ─── Quick Action Grid ───
export function QuickAction({ icon, title, subtitle, onPress, color }: {
  icon: IconSource
  title: string
  subtitle?: string
  color?: string
  onPress: () => void
}) {
  return (
    <Pressable onPress={onPress} style={[ds.quickAction, { backgroundColor: color ? `${color}08` : IOS.card }]}>
      {typeof icon === 'string' ? <Text style={ds.quickActionIconEmoji}>{icon}</Text> : (
        <View style={[ds.quickActionIconWrap, { backgroundColor: color ? `${color}12` : IOS.fill }]}>
          <Ionicons name={icon.name as any} size={icon.size ?? 22} color={icon.color ?? color ?? Colors.primary} />
        </View>
      )}
      <Text style={ds.quickActionTitle}>{title}</Text>
      {subtitle && <Text style={ds.quickActionSub}>{subtitle}</Text>}
    </Pressable>
  )
}

// ═══════════════════════════════════════════
// NEW iOS 26 Components
// ═══════════════════════════════════════════

// ─── Page Header (replaces ‹ 返回 pattern) ───
export function PageHeader({ title, onBack, right }: {
  title: string
  onBack?: () => void
  right?: React.ReactNode
}) {
  return (
    <View style={ds.pageHeader}>
      <View style={ds.pageHeaderRow}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12} style={ds.pageBackBtn}>
            <Ionicons name="chevron-back" size={22} color={Colors.primary} />
          </Pressable>
        ) : <View style={{ width: 32 }} />}
        <Text style={ds.pageTitle} numberOfLines={1}>{title}</Text>
        <View style={{ width: 32, alignItems: 'flex-end' }}>{right}</View>
      </View>
    </View>
  )
}

// ─── Search Bar ───
export function SearchBar({ value, onChangeText, placeholder = '搜索...' }: {
  value: string
  onChangeText: (t: string) => void
  placeholder?: string
}) {
  return (
    <View style={ds.searchWrap}>
      <Ionicons name="search" size={16} color={IOS.label2} />
      <TextInput style={ds.searchInput} value={value} onChangeText={onChangeText}
        placeholder={placeholder} placeholderTextColor={IOS.placeholder} />
    </View>
  )
}

// ─── List Item (iOS Settings style) ───
export function ListItem({ icon, title, subtitle, onPress, trailing, iconColor }: {
  icon?: { name: string; color?: string } | string
  title: string
  subtitle?: string
  onPress?: () => void
  trailing?: React.ReactNode
  iconColor?: string
}) {
  const content = (
    <View style={ds.listItem}>
      {icon && (
        typeof icon === 'string' ? (
          <View style={[ds.listIconCircle, { backgroundColor: IOS.fill }]}>
            <Ionicons name={icon as any} size={18} color={iconColor ?? IOS.label} />
          </View>
        ) : (
          <View style={[ds.listIconCircle, { backgroundColor: icon.color ? `${icon.color}15` : IOS.fill }]}>
            <Ionicons name={icon.name as any} size={18} color={icon.color ?? iconColor ?? Colors.primary} />
          </View>
        )
      )}
      <View style={{ flex: 1, marginLeft: icon ? 12 : 0 }}>
        <Text style={ds.listTitle} numberOfLines={1}>{title}</Text>
        {subtitle && <Text style={ds.listSub} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {trailing ?? <Ionicons name="chevron-forward" size={18} color={IOS.label3} />}
    </View>
  )
  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content
}

// ─── Icon Card (for menu grids) ───
export function IconCard({ icon, title, subtitle, onPress, color }: {
  icon: { name: string; color?: string }
  title: string
  subtitle?: string
  onPress?: () => void
  color?: string
}) {
  return (
    <Pressable onPress={onPress} style={[ds.iconCard, color ? { backgroundColor: `${color}08` } : {}]}>
      <View style={[ds.iconCardCircle, { backgroundColor: icon.color ? `${icon.color}12` : IOS.fill }]}>
        <Ionicons name={icon.name as any} size={22} color={icon.color ?? color ?? Colors.primary} />
      </View>
      <Text style={ds.iconCardTitle} numberOfLines={1}>{title}</Text>
      {subtitle && <Text style={ds.iconCardSub} numberOfLines={1}>{subtitle}</Text>}
    </Pressable>
  )
}

// ─── Gradient Icon (for menu rows, like AI page) ───
export function GradientIcon({ icon, colors }: {
  icon: string
  colors: readonly [string, string]
}) {
  return (
    <LinearGradient colors={colors as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={ds.gradientIcon}>
      <Ionicons name={icon as any} size={18} color="#FFF" />
    </LinearGradient>
  )
}

// ═══════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════

const ds = StyleSheet.create({
  card: { backgroundColor: IOS.card, borderRadius: 16, padding: Spacing.lg, ...Shadows.sm },
  kpiCard: { padding: Spacing.md },
  kpiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  kpiTitle: { fontSize: 12, color: IOS.label2, fontWeight: '500' },
  kpiIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  kpiValue: { fontSize: 24, fontWeight: '700', color: IOS.label, letterSpacing: -0.5 },
  kpiSub: { fontSize: 11, color: IOS.label2, marginTop: 2 },
  kpiTrend: { fontSize: 11, fontWeight: '600', marginTop: 4 },

  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, alignSelf: 'flex-start' },
  badgeText: { fontSize: 10, fontWeight: '600' },

  button: { borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  buttonText: { fontWeight: '600' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: IOS.label },
  sectionAction: { fontSize: 13, color: Colors.primary, fontWeight: '500' },

  progressBg: { height: 5, borderRadius: 2.5, backgroundColor: IOS.separator, overflow: 'hidden', flex: 1 },
  progressFill: { height: '100%', borderRadius: 2.5 },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyIconEmoji: { fontSize: 40, marginBottom: 8, opacity: 0.4 },
  emptyIconWrap: { width: 56, height: 56, borderRadius: 16, backgroundColor: IOS.fill, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: IOS.label2 },
  emptySub: { fontSize: 12, color: IOS.label3, marginTop: 4 },

  quickAction: { borderRadius: 16, padding: Spacing.md, alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 80 },
  quickActionIconEmoji: { fontSize: 22, marginBottom: 4 },
  quickActionIconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  quickActionTitle: { fontSize: 12, fontWeight: '600', color: IOS.label },
  quickActionSub: { fontSize: 10, color: IOS.label2, marginTop: 2 },

  // New components
  pageHeader: { paddingTop: 56, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, backgroundColor: IOS.card, borderBottomWidth: 0.5, borderBottomColor: IOS.separator },
  pageHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pageBackBtn: { width: 32, height: 32, justifyContent: 'center', alignItems: 'flex-start' },
  pageTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: IOS.label, textAlign: 'center', marginHorizontal: 8 },

  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: IOS.fill, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, color: IOS.label, paddingVertical: 0 },

  listItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: IOS.separator },
  listIconCircle: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  listTitle: { fontSize: 16, fontWeight: '500', color: IOS.label },
  listSub: { fontSize: 12, color: IOS.label2, marginTop: 2 },

  iconCard: { backgroundColor: IOS.card, borderRadius: 16, padding: Spacing.md, alignItems: 'center', ...Shadows.sm },
  iconCardCircle: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  iconCardTitle: { fontSize: 13, fontWeight: '600', color: IOS.label },
  iconCardSub: { fontSize: 10, color: IOS.label2, marginTop: 2 },

  gradientIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
})
