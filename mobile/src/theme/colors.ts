// 品牌色系 — 靛蓝主色，与 Web 端 oklch hue 265 对齐
export const Colors = {
  primary: '#4338CA',
  primaryLight: '#6366F1',
  primaryDark: '#3730A3',
  primaryBg: 'rgba(67, 56, 202, 0.08)',

  success: '#059669',
  successBg: 'rgba(5, 150, 105, 0.08)',
  warning: '#D97706',
  warningBg: 'rgba(217, 119, 6, 0.08)',
  danger: '#DC2626',
  dangerBg: 'rgba(220, 38, 38, 0.08)',
  info: '#2563EB',
  infoBg: 'rgba(37, 99, 235, 0.08)',

  text: '#1E1B4B',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',

  background: '#FFFFFF',
  surface: '#F8F9FC',
  cardBorder: '#E5E7EB',

  chart: ['#4338CA', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444'],
}

// iOS 26 system tokens
export const IOS = {
  bg: '#F2F2F7',
  card: '#FFFFFF',
  label: '#1C1C1E',
  label2: '#8E8E93',
  label3: '#AEAEB2',
  placeholder: '#C7C7CC',
  separator: '#E5E5EA',
  fill: 'rgba(120,120,128,0.12)',
}

export const Gradients = {
  primary: ['#4338CA', '#6366F1'] as const,
  purple: ['#8B5CF6', '#A78BFA'] as const,
  amber: ['#F59E0B', '#FBBF24'] as const,
  green: ['#10B981', '#34D399'] as const,
  gray: ['#6B7280', '#9CA3AF'] as const,
  hero: ['#4338CA', '#6366F1', '#818CF8'] as const,
}

export const Spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
}

export const Radius = {
  sm: 6, md: 10, lg: 14, xl: 18, full: 9999,
}

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
}
