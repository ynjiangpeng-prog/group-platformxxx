import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  FlatList, Modal, ActivityIndicator, Dimensions, Platform,
} from 'react-native'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useState, useRef } from 'react'
import { LinearGradient } from 'expo-linear-gradient'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Colors, Spacing, Radius, Shadows } from '../../src/theme/colors'
import * as aiApi from '../../src/api/ai'
import { listProjects } from '../../src/api/services'
import type { Project } from '../../src/api/types'

const FORM_TYPES = [
  { value: 'petty_cash_expense', label: '备用金核销' },
  { value: 'invoice', label: '发票录入' },
  { value: 'payment_doc', label: '付款依据存档' },
  { value: 'construction_log', label: '施工日志' },
  { value: 'construction_cost_record', label: '施工费用记录' },
  { value: 'work_hours_record', label: '工时记录' },
  { value: 'delivery_note', label: '送货单' },
  { value: 'material_list', label: '材料清单' },
]

const INSIGHT_ITEMS = [
  { key: 'insights', label: 'AI 洞察', icon: 'bulb-outline', iconFill: 'bulb', color: '#F59E0B', fn: aiApi.getInsights },
  { key: 'recommendations', label: '智能建议', icon: 'star-outline', iconFill: 'star', color: '#8B5CF6', fn: aiApi.getRecommendations },
  { key: 'riskAlerts', label: '风险预警', icon: 'warning-outline', iconFill: 'warning', color: '#EF4444', fn: aiApi.getRiskAlerts },
  { key: 'projectRisk', label: '项目风险', icon: 'analytics-outline', iconFill: 'analytics', color: '#4338CA', fn: aiApi.getProjectRisk },
  { key: 'stationRevenue', label: '站点收入', icon: 'bar-chart-outline', iconFill: 'bar-chart', color: '#10B981', fn: aiApi.getStationRevenue },
  { key: 'financeHealth', label: '财务健康', icon: 'heart-outline', iconFill: 'heart', color: '#EC4899', fn: aiApi.getFinanceHealth },
  { key: 'procurement', label: '采购分析', icon: 'cart-outline', iconFill: 'cart', color: '#F97316', fn: aiApi.getProcurementAnalysis },
  { key: 'deviceHealth', label: '设备健康', icon: 'phone-portrait-outline', iconFill: 'phone-portrait', color: '#06B6D4', fn: aiApi.getDeviceHealth },
  { key: 'customerChurn', label: '客户流失', icon: 'people-outline', iconFill: 'people', color: '#6366F1', fn: aiApi.getCustomerChurn },
  { key: 'crossBusiness', label: '跨业务分析', icon: 'git-branch-outline', iconFill: 'git-branch', color: '#14B8A6', fn: aiApi.getCrossBusiness },
]

type QeStep = 'input' | 'result' | 'done'
interface HistoryEntry { id: string; type: string; input: string; result: string; time: string }

// ─── Shared icon helper ───
function Icon({ name, size = 22, color = Colors.primary }: { name: keyof typeof Ionicons.glyphMap; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />
}

export default function AIScreen() {
  const { data: briefing, isLoading: briefingLoading } = useQuery({ queryKey: ['daily-briefing'], queryFn: aiApi.getDailyBriefing })
  const { data: projectsData } = useQuery({ queryKey: ['ai-projects'], queryFn: () => listProjects({ page: 1, page_size: 50 }) })
  const projects: Project[] = (projectsData as Record<string, unknown> | undefined)?.items as Project[] ?? []

  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([])
  const [chatInput, setChatInput] = useState('')

  const [qeVisible, setQeVisible] = useState(false)
  const [qeStep, setQeStep] = useState<QeStep>('input')
  const [qeText, setQeText] = useState('')
  const [qeFormType, setQeFormType] = useState('petty_cash_expense')
  const [qeFields, setQeFields] = useState<Record<string, unknown>>({})
  const [qeConfidence, setQeConfidence] = useState(0)
  const [qeFormTypeLabel, setQeFormTypeLabel] = useState('')
  const [qePossibleTypes, setQePossibleTypes] = useState<{ value: string; label: string; recommended: boolean }[]>([])
  const [qeProject, setQeProject] = useState('')
  const [qeProjectHint, setQeProjectHint] = useState('')

  const [briefingOpen, setBriefingOpen] = useState(false)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [insightOpen, setInsightOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  const [detailVisible, setDetailVisible] = useState(false)
  const [detailTitle, setDetailTitle] = useState('')
  const [detailData, setDetailData] = useState<unknown>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [taskType, setTaskType] = useState('create_alert')
  const taskMut = useMutation({ mutationFn: aiApi.executeAiTask })

  const analyzeMut = useMutation({
    mutationFn: async () => qeText.trim() ? aiApi.quickEntryAnalyzeText(qeText.trim()) : null,
    onSuccess: (data) => {
      if (!data) return
      const r = data as Record<string, unknown>
      const conf = (r.confidence as number) ?? 0
      const ftl = (r.form_type_label as string) ?? (r.form_type as string) ?? ''
      const pt = (r.possible_form_types as { value: string; label: string; recommended: boolean }[]) ?? []
      const rec = pt.find(t => t.recommended)
      setQeConfidence(conf); setQeFormTypeLabel(ftl); setQePossibleTypes(pt)
      if (rec?.value) setQeFormType(rec.value); else if (r.form_type) setQeFormType(r.form_type as string)
      setQeFields((r.extracted_fields as Record<string, unknown>) ?? {})
      setQeProjectHint((r.suggested_project_name as string) ?? '')
      if (r.suggested_project_id) setQeProject(r.suggested_project_id as string)
      setQeStep('result')
      addHistory('识别', qeText.trim(), `识别为${ftl}，置信度${Math.round(conf * 100)}%`)
    },
  })

  const submitMut = useMutation({
    mutationFn: () => aiApi.quickEntrySubmit({
      form_type: qeFormType, form_data: { ...qeFields, project_id: qeProject || undefined }, project_id: qeProject || undefined,
    }),
    onSuccess: () => { setQeStep('done'); addHistory('提交', FORM_TYPES.find(f => f.value === qeFormType)?.label ?? '', '提交成功') },
  })

  const addHistory = (type: string, input: string, result: string) => {
    setHistory(prev => [{ id: Date.now().toString(), type, input, result,
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    }, ...prev].slice(0, 30))
  }

  const resetQe = () => {
    setQeText(''); setQeFormType('petty_cash_expense'); setQeFields({})
    setQeConfidence(0); setQeFormTypeLabel(''); setQePossibleTypes([])
    setQeProject(''); setQeProjectHint(''); setQeStep('input')
  }

  const openDetail = async (label: string, fn: () => Promise<unknown>) => {
    setDetailTitle(label); setDetailData(null); setDetailLoading(true); setDetailVisible(true)
    try { setDetailData(await fn()) } catch { setDetailData({ error: '获取数据失败' }) } finally { setDetailLoading(false) }
  }

  const selectProject = async (p: Project) => {
    setSelectedProject(p); setAnalysisLoading(true); setChatMessages([])
    try { const r = await aiApi.getProjectAnalysis(p.id); setChatMessages([{ role: 'assistant', content: typeof r === 'string' ? r : JSON.stringify(r, null, 2) }]) }
    catch { setChatMessages([{ role: 'assistant', content: '分析加载失败' }]) } finally { setAnalysisLoading(false) }
  }

  const sendChat = async () => {
    if (!chatInput.trim() || !selectedProject) return
    const msg = chatInput.trim(); setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: msg }])
    try { const r = await aiApi.getProjectRisk({ project_id: selectedProject.id, question: msg }); setChatMessages(prev => [...prev, { role: 'assistant', content: typeof r === 'string' ? r : JSON.stringify(r, null, 2) }]) }
    catch { setChatMessages(prev => [...prev, { role: 'assistant', content: '请求失败' }]) }
  }

  const fmtData = (d: unknown): string => {
    if (!d) return '暂无数据'; if (typeof d === 'string') return d
    if (typeof d === 'object' && d !== null) {
      const o = d as Record<string, unknown>
      if (o.error) return `错误: ${o.error}`
      if (Array.isArray(o.items)) return o.items.map((it: Record<string, unknown>, i: number) => `--- ${i + 1} ---\n` + Object.entries(it).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')}`).join('\n')).join('\n\n')
      if (o.content) return String(o.content); if (o.summary) return String(o.summary)
    }
    return JSON.stringify(d, null, 2)
  }

  const MENU = [
    { key: 'briefing', icon: 'newspaper-outline' as const, iconActive: 'newspaper' as const, title: '每日简报', sub: 'AI 生成每日业务摘要', gradient: ['#4338CA', '#6366F1'] as const },
    { key: 'analysis', icon: 'folder-open-outline' as const, iconActive: 'folder-open' as const, title: '项目分析', sub: '选择项目进行 AI 对话分析', gradient: ['#8B5CF6', '#A78BFA'] as const },
    { key: 'insights', icon: 'sparkles-outline' as const, iconActive: 'sparkles' as const, title: 'AI 智能洞察', sub: '10 项业务智能分析', gradient: ['#F59E0B', '#FBBF24'] as const },
    { key: 'tasks', icon: 'flash-outline' as const, iconActive: 'flash' as const, title: 'AI 任务执行', sub: '预警 · 报告 · 摘要', gradient: ['#10B981', '#34D399'] as const },
    { key: 'history', icon: 'time-outline' as const, iconActive: 'time' as const, title: 'AI 提交记录', sub: `${history.length} 条记录`, gradient: ['#6B7280', '#9CA3AF'] as const },
  ]

  return (
    <View style={s.container}>
      <FlatList data={[1]} keyExtractor={() => '_'} renderItem={() => (
        <View>
          {/* ─── Header ─── */}
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.headerTitle}>AI 智能中心</Text>
              <Text style={s.headerSub}>流程表单识别 · 智能分析</Text>
            </View>
            <LinearGradient colors={['#4338CA', '#6366F1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.statusPill}>
              <View style={s.statusDotLive} />
              <Text style={s.statusText}>在线</Text>
            </LinearGradient>
          </View>

          {/* ═══ Hero: AI 智能流程表单识别 ═══ */}
          <LinearGradient colors={['#4338CA', '#6366F1', '#818CF8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
            <View style={s.heroContent}>
              <View style={s.heroBadge}>
                <Ionicons name="sparkles" size={12} color="#4338CA" />
                <Text style={s.heroBadgeText}>AI</Text>
              </View>
              <Text style={s.heroTitle}>智能流程表单识别</Text>
              <Text style={s.heroDesc}>拍照 · 语音 · 文字 — AI 自动分类并提取数据</Text>
            </View>
            <View style={s.heroActions}>
              <Pressable style={s.heroBtn} onPress={() => { resetQe(); setQeVisible(true) }}
                android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}>
                <View style={s.heroBtnIconWrap}>
                  <Ionicons name="camera-outline" size={20} color="#4338CA" />
                </View>
                <Text style={s.heroBtnLabel}>拍照</Text>
              </Pressable>
              <Pressable style={s.heroBtn} onPress={() => { resetQe(); setQeText('报销材料费500元'); setQeVisible(true) }}>
                <View style={s.heroBtnIconWrap}>
                  <Ionicons name="mic-outline" size={20} color="#4338CA" />
                </View>
                <Text style={s.heroBtnLabel}>语音</Text>
              </Pressable>
              <Pressable style={s.heroBtn} onPress={() => { resetQe(); setQeVisible(true) }}>
                <View style={s.heroBtnIconWrap}>
                  <Ionicons name="create-outline" size={20} color="#4338CA" />
                </View>
                <Text style={s.heroBtnLabel}>文字</Text>
              </Pressable>
            </View>
            {/* Quick commands */}
            <View style={s.heroChips}>
              {['报销差旅500元', '记工时8小时', '申请备用金3000元'].map(cmd => (
                <Pressable key={cmd} style={s.heroChip}
                  onPress={() => { resetQe(); setQeText(cmd); setQeVisible(true) }}>
                  <Ionicons name="sparkles-outline" size={10} color="rgba(255,255,255,0.9)" />
                  <Text style={s.heroChipText}>{cmd}</Text>
                </Pressable>
              ))}
            </View>
          </LinearGradient>

          {/* ═══ Tool Menu ═══ */}
          <View style={s.menuSection}>
            <Text style={s.menuSectionLabel}>AI 工具箱</Text>
            <View style={s.menuCard}>
              {MENU.map((item, idx) => (
                <Pressable key={item.key} style={[s.menuRow, idx < MENU.length - 1 && s.menuRowBorder]}
                  onPress={() => {
                    if (item.key === 'briefing') setBriefingOpen(true)
                    if (item.key === 'analysis') setAnalysisOpen(true)
                    if (item.key === 'insights') setInsightOpen(true)
                    if (item.key === 'tasks') setTaskOpen(true)
                    if (item.key === 'history') setHistoryOpen(true)
                  }}>
                  <View style={s.menuRowLeft}>
                    <LinearGradient colors={item.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.menuIcon}>
                      <Ionicons name={item.iconActive} size={18} color="#FFFFFF" />
                    </LinearGradient>
                    <View style={{ marginLeft: 12 }}>
                      <Text style={s.menuTitle}>{item.title}</Text>
                      <Text style={s.menuSub}>{item.sub}</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
                </Pressable>
              ))}
            </View>
          </View>
          <View style={{ height: 40 }} />
        </View>
      )} showsVerticalScrollIndicator={false} />

      {/* ═════════════════════════════════════════
          Modal: Quick Entry
      ═════════════════════════════════════════ */}
      <Modal visible={qeVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalNav}>
            <Text style={s.modalNavTitle}>AI 快速录入</Text>
            <Pressable onPress={() => { setQeVisible(false); resetQe() }} hitSlop={12}>
              <View style={s.modalCloseBtn}><Ionicons name="close" size={18} color={Colors.textSecondary} /></View>
            </Pressable>
          </View>
          <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
            {qeStep === 'input' && (
              <View style={{ gap: 20 }}>
                {/* Methods */}
                <View style={s.qeMethodRow}>
                  <Pressable style={s.qeMethodCard}>
                    <View style={[s.qeMethodCircle, { backgroundColor: '#EEF2FF' }]}>
                      <Ionicons name="camera-outline" size={26} color={Colors.primary} />
                    </View>
                    <Text style={s.qeMethodLabel}>拍照识别</Text>
                    <Text style={s.qeMethodHint}>发票 · 收据 · 合同</Text>
                  </Pressable>
                  <Pressable style={s.qeMethodCard}>
                    <View style={[s.qeMethodCircle, { backgroundColor: '#ECFDF5' }]}>
                      <Ionicons name="mic-outline" size={26} color={Colors.success} />
                    </View>
                    <Text style={s.qeMethodLabel}>语音输入</Text>
                    <Text style={s.qeMethodHint}>说一句话即可</Text>
                  </Pressable>
                </View>
                {/* Textarea */}
                <View>
                  <Text style={s.fieldLabel}>描述内容</Text>
                  <TextInput style={s.textarea} value={qeText} onChangeText={setQeText}
                    placeholder="如：报销差旅费500元、材料采购发票..."
                    placeholderTextColor="#C7C7CC" multiline numberOfLines={4} textAlignVertical="top" />
                </View>
                {/* Quick chips */}
                <View style={s.chipRow}>
                  {['报销材料费500元', '差旅报销1200元', '工时8小时'].map(c => (
                    <Pressable key={c} style={s.chip} onPress={() => setQeText(c)}>
                      <Ionicons name="sparkles-outline" size={10} color={Colors.primary} />
                      <Text style={s.chipText}>{c}</Text>
                    </Pressable>
                  ))}
                </View>
                {/* Form type */}
                <View>
                  <Text style={s.fieldLabel}>表单类型</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                    {FORM_TYPES.map(ft => (
                      <Pressable key={ft.value}
                        style={[s.ftChip, qeFormType === ft.value && s.ftChipActive]}
                        onPress={() => setQeFormType(ft.value)}>
                        <Text style={[s.ftChipText, qeFormType === ft.value && { color: '#FFF' }]}>{ft.label}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
                {/* CTA */}
                <Pressable style={[s.cta, (!qeText.trim() || analyzeMut.isPending) && { opacity: 0.5 }]}
                  onPress={() => analyzeMut.mutate()} disabled={!qeText.trim() || analyzeMut.isPending}>
                  <LinearGradient colors={['#4338CA', '#6366F1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.ctaGradient}>
                    {analyzeMut.isPending ? <ActivityIndicator color="#FFF" /> : (
                      <><Ionicons name="sparkles" size={18} color="#FFF" /><Text style={s.ctaText}>AI 识别</Text></>
                    )}
                  </LinearGradient>
                </Pressable>
              </View>
            )}
            {qeStep === 'result' && (
              <View style={{ gap: 20 }}>
                {/* Result header */}
                <View style={s.resultBar}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <LinearGradient colors={['#4338CA', '#6366F1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.resultBadge}>
                      <Text style={s.resultBadgeText}>{qeFormTypeLabel || FORM_TYPES.find(f => f.value === qeFormType)?.label}</Text>
                    </LinearGradient>
                    <Text style={{ fontSize: 12, color: Colors.textTertiary }}>{Math.round(qeConfidence * 100)}%</Text>
                  </View>
                  <Pressable onPress={() => setQeStep('input')}><Text style={s.linkText}>重新识别</Text></Pressable>
                </View>
                {/* Possible types */}
                {qePossibleTypes.length > 1 && (
                  <View style={s.typeSelectRow}>
                    {qePossibleTypes.map(t => (
                      <Pressable key={t.value} style={[s.typeOpt, qeFormType === t.value && s.typeOptActive]}
                        onPress={() => setQeFormType(t.value)}>
                        <Text style={[s.typeOptText, qeFormType === t.value && { color: '#FFF' }]}>{t.label}</Text>
                        {t.recommended && <View style={s.recDot} />}
                      </Pressable>
                    ))}
                  </View>
                )}
                {/* Fields */}
                <View>
                  <Text style={s.fieldLabel}>识别结果</Text>
                  {Object.entries(qeFields).length === 0 ? (
                    <Text style={{ color: Colors.textTertiary, fontSize: 13 }}>未提取到字段</Text>
                  ) : Object.entries(qeFields).map(([k, v]) => (
                    <View key={k} style={s.fieldRow}>
                      <Text style={s.fieldKey}>{k}</Text>
                      <TextInput style={s.fieldInput} value={String(v ?? '')}
                        onChangeText={val => setQeFields(p => ({ ...p, [k]: val }))} placeholder={k} placeholderTextColor="#C7C7CC" />
                    </View>
                  ))}
                </View>
                {/* Project */}
                <View>
                  <Text style={s.fieldLabel}>关联项目</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                    <Pressable style={[s.projChip, !qeProject && s.projChipActive]} onPress={() => setQeProject('')}>
                      <Text style={{ fontSize: 12, color: !qeProject ? Colors.primary : Colors.textSecondary }}>不关联</Text>
                    </Pressable>
                    {projects.slice(0, 10).map(p => (
                      <Pressable key={p.id} style={[s.projChip, qeProject === p.id && s.projChipActive]}
                        onPress={() => setQeProject(p.id)}>
                        <Text style={{ fontSize: 12, color: qeProject === p.id ? Colors.primary : Colors.textSecondary }} numberOfLines={1}>{p.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  {!!qeProjectHint && <Text style={{ fontSize: 11, color: Colors.textTertiary, marginTop: 4 }}>AI 建议: {qeProjectHint}</Text>}
                </View>
                <Pressable style={[s.cta, submitMut.isPending && { opacity: 0.5 }]}
                  onPress={() => submitMut.mutate()} disabled={submitMut.isPending}>
                  <LinearGradient colors={['#059669', '#10B981']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.ctaGradient}>
                    {submitMut.isPending ? <ActivityIndicator color="#FFF" /> : (
                      <><Ionicons name="checkmark-circle" size={18} color="#FFF" /><Text style={s.ctaText}>确认提交</Text></>
                    )}
                  </LinearGradient>
                </Pressable>
              </View>
            )}
            {qeStep === 'done' && (
              <View style={s.doneWrap}>
                <View style={s.doneCircle}><Ionicons name="checkmark-circle" size={48} color={Colors.success} /></View>
                <Text style={s.doneTitle}>提交成功</Text>
                <Text style={s.doneSub}>记录已保存，等待审批</Text>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
                  <Pressable style={s.doneBtnOutline} onPress={resetQe}><Text style={s.doneBtnOutlineText}>继续录入</Text></Pressable>
                  <Pressable style={s.doneBtnFill} onPress={() => { setQeVisible(false); resetQe() }}><Text style={s.doneBtnFillText}>关闭</Text></Pressable>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ═══ 每日简报 ═══ */}
      <Modal visible={briefingOpen} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalNav}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <LinearGradient colors={['#4338CA', '#6366F1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.navIcon}>
                <Ionicons name="newspaper" size={14} color="#FFF" />
              </LinearGradient>
              <Text style={s.modalNavTitle}>每日简报</Text>
            </View>
            <Pressable onPress={() => setBriefingOpen(false)} hitSlop={12}>
              <View style={s.modalCloseBtn}><Ionicons name="close" size={18} color={Colors.textSecondary} /></View>
            </Pressable>
          </View>
          <ScrollView style={s.modalBody}>
            {briefingLoading ? (
              <View style={{ alignItems: 'center', padding: 40 }}><ActivityIndicator size="large" color={Colors.primary} /></View>
            ) : (
              <View style={s.briefingCard}>
                <Text style={s.briefingText}>
                  {(briefing as Record<string, unknown>)?.content ? String((briefing as Record<string, unknown>).content)
                    : (briefing as Record<string, unknown>)?.summary ? String((briefing as Record<string, unknown>).summary) : '暂无简报数据'}
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ═══ 项目分析 ═══ */}
      <Modal visible={analysisOpen} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalNav}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <LinearGradient colors={['#8B5CF6', '#A78BFA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.navIcon}>
                <Ionicons name="folder-open" size={14} color="#FFF" />
              </LinearGradient>
              <Text style={s.modalNavTitle}>项目分析</Text>
            </View>
            <Pressable onPress={() => { setAnalysisOpen(false); setSelectedProject(null); setChatMessages([]) }} hitSlop={12}>
              <View style={s.modalCloseBtn}><Ionicons name="close" size={18} color={Colors.textSecondary} /></View>
            </Pressable>
          </View>
          <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
            {!selectedProject ? (
              <View style={{ gap: 8 }}>
                <Text style={s.fieldLabel}>选择项目开始分析</Text>
                {projects.slice(0, 20).map(p => (
                  <Pressable key={p.id} style={s.projRow} onPress={() => selectProject(p)}>
                    <Ionicons name="folder" size={18} color={Colors.primary} />
                    <Text style={s.projRowName} numberOfLines={1}>{p.name}</Text>
                    <Text style={s.projRowProg}>{p.progress ?? 0}%</Text>
                  </Pressable>
                ))}
                {projects.length === 0 && (
                  <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                    <Ionicons name="folder-open-outline" size={40} color="#D1D5DB" />
                    <Text style={{ color: Colors.textTertiary, marginTop: 8 }}>暂无项目</Text>
                  </View>
                )}
              </View>
            ) : (
              <View>
                <View style={s.analysisHead}>
                  <Text style={s.analysisName}>{selectedProject.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <Text style={{ fontSize: 11, color: Colors.textTertiary }}>进度 {selectedProject.progress ?? 0}%</Text>
                    <View style={s.progressBg}><View style={[s.progressFill, { width: `${selectedProject.progress ?? 0}%` }]} /></View>
                  </View>
                </View>
                {analysisLoading ? (
                  <View style={{ padding: 24, alignItems: 'center' }}><ActivityIndicator color={Colors.primary} /></View>
                ) : chatMessages.map((m, i) => (
                  <View key={i} style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleAI]}>
                    {m.role === 'assistant' && <Text style={s.bubbleAIlabel}>AI</Text>}
                    <Text style={[s.bubbleText, m.role === 'user' && { color: '#FFF' }]}>{m.content}</Text>
                  </View>
                ))}
                <View style={s.chatBar}>
                  <TextInput style={s.chatInput} placeholder="提问..." placeholderTextColor="#C7C7CC"
                    value={chatInput} onChangeText={setChatInput} onSubmitEditing={sendChat} returnKeyType="send" />
                  <Pressable style={s.chatSend} onPress={sendChat}>
                    <Ionicons name="arrow-up" size={18} color="#FFF" />
                  </Pressable>
                </View>
                <Pressable onPress={() => { setSelectedProject(null); setChatMessages([]) }} style={{ marginTop: 8 }}>
                  <Text style={[s.linkText, { textAlign: 'center' }]}>返回项目列表</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ═══ AI 洞察 ═══ */}
      <Modal visible={insightOpen} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalNav}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <LinearGradient colors={['#F59E0B', '#FBBF24']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.navIcon}>
                <Ionicons name="sparkles" size={14} color="#FFF" />
              </LinearGradient>
              <Text style={s.modalNavTitle}>AI 智能洞察</Text>
            </View>
            <Pressable onPress={() => setInsightOpen(false)} hitSlop={12}>
              <View style={s.modalCloseBtn}><Ionicons name="close" size={18} color={Colors.textSecondary} /></View>
            </Pressable>
          </View>
          <ScrollView style={s.modalBody}>
            <View style={s.insightGrid}>
              {INSIGHT_ITEMS.map(c => (
                <Pressable key={c.key} style={s.insightCard} onPress={() => openDetail(c.label, c.fn)}>
                  <View style={[s.insightIcon, { backgroundColor: `${c.color}15` }]}>
                    <Ionicons name={c.iconFill as any} size={22} color={c.color} />
                  </View>
                  <Text style={s.insightLabel}>{c.label}</Text>
                  <Ionicons name="chevron-forward" size={14} color="#D1D5DB" style={{ marginTop: 2 }} />
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ═══ 任务执行 ═══ */}
      <Modal visible={taskOpen} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalNav}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <LinearGradient colors={['#10B981', '#34D399']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.navIcon}>
                <Ionicons name="flash" size={14} color="#FFF" />
              </LinearGradient>
              <Text style={s.modalNavTitle}>AI 任务执行</Text>
            </View>
            <Pressable onPress={() => setTaskOpen(false)} hitSlop={12}>
              <View style={s.modalCloseBtn}><Ionicons name="close" size={18} color={Colors.textSecondary} /></View>
            </Pressable>
          </View>
          <ScrollView style={s.modalBody}>
            <Text style={s.fieldLabel}>任务类型</Text>
            <View style={s.taskRow}>
              {([['create_alert', '预警', 'alert-circle-outline'], ['generate_report', '报告', 'document-text-outline'], ['summarize_module', '摘要', 'reader-outline']] as const).map(([t, label, ic]) => (
                <Pressable key={t} style={[s.taskBtn, taskType === t && s.taskBtnActive]} onPress={() => setTaskType(t)}>
                  <Ionicons name={ic as any} size={16} color={taskType === t ? '#FFF' : Colors.primary} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: taskType === t ? '#FFF' : Colors.primary, marginLeft: 4 }}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={[s.cta, taskMut.isPending && { opacity: 0.5 }]}
              onPress={() => taskMut.mutate({ task_type: taskType })} disabled={taskMut.isPending}>
              <LinearGradient colors={['#10B981', '#34D399']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.ctaGradient}>
                {taskMut.isPending ? <ActivityIndicator color="#FFF" /> : (
                  <><Ionicons name="play" size={16} color="#FFF" /><Text style={s.ctaText}>执行任务</Text></>
                )}
              </LinearGradient>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* ═══ 提交记录 ═══ */}
      <Modal visible={historyOpen} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalNav}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <LinearGradient colors={['#6B7280', '#9CA3AF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.navIcon}>
                <Ionicons name="time" size={14} color="#FFF" />
              </LinearGradient>
              <Text style={s.modalNavTitle}>提交记录</Text>
            </View>
            <Pressable onPress={() => setHistoryOpen(false)} hitSlop={12}>
              <View style={s.modalCloseBtn}><Ionicons name="close" size={18} color={Colors.textSecondary} /></View>
            </Pressable>
          </View>
          <ScrollView style={s.modalBody}>
            {history.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Ionicons name="time-outline" size={40} color="#D1D5DB" />
                <Text style={{ color: Colors.textTertiary, marginTop: 8 }}>暂无记录</Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                  <Pressable onPress={() => setHistory([])}><Text style={{ fontSize: 12, color: Colors.danger }}>清空</Text></Pressable>
                </View>
                {history.map(e => (
                  <View key={e.id} style={s.histRow}>
                    <View style={[s.histDot, { backgroundColor: e.type === '提交' ? Colors.success : Colors.primary }]} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '500', color: Colors.text }} numberOfLines={1}>{e.input}</Text>
                      <Text style={{ fontSize: 11, color: Colors.textTertiary, marginTop: 2 }} numberOfLines={1}>{e.result}</Text>
                    </View>
                    <Text style={{ fontSize: 10, color: Colors.textTertiary }}>{e.time}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ═══ Detail (洞察详情子弹窗) ═══ */}
      <Modal visible={detailVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalNav}>
            <Text style={s.modalNavTitle}>{detailTitle}</Text>
            <Pressable onPress={() => setDetailVisible(false)} hitSlop={12}>
              <View style={s.modalCloseBtn}><Ionicons name="close" size={18} color={Colors.textSecondary} /></View>
            </Pressable>
          </View>
          <ScrollView style={s.modalBody}>
            {detailLoading ? (
              <View style={{ alignItems: 'center', padding: 40 }}><ActivityIndicator size="large" color={Colors.primary} /></View>
            ) : <Text style={s.detailText}>{fmtData(detailData)}</Text>}
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

const IW = (Dimensions.get('window').width - 40 - 10) / 2

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 8 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#1C1C1E', letterSpacing: -0.5 },
  headerSub: { fontSize: 14, color: '#8E8E93', marginTop: 2 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusDotLive: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ADE80' },
  statusText: { fontSize: 12, fontWeight: '600', color: '#FFFFFF' },

  // Hero
  hero: { marginHorizontal: 16, marginTop: 8, borderRadius: 20, overflow: 'hidden' },
  heroContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.25)', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginBottom: 8 },
  heroBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  heroDesc: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4, lineHeight: 18 },
  heroActions: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  heroBtn: { flex: 1, alignItems: 'center', gap: 6 },
  heroBtnIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  heroBtnLabel: { fontSize: 12, fontWeight: '600', color: '#FFFFFF' },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 20, paddingBottom: 16 },
  heroChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)' },
  heroChipText: { fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.95)' },

  // Menu
  menuSection: { paddingHorizontal: 16, marginTop: 20 },
  menuSectionLabel: { fontSize: 13, fontWeight: '700', color: '#8E8E93', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  menuCard: { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden', ...Shadows.sm },
  menuRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  menuRowBorder: { borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA' },
  menuRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  menuIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  menuTitle: { fontSize: 16, fontWeight: '600', color: '#1C1C1E' },
  menuSub: { fontSize: 12, color: '#8E8E93', marginTop: 1 },

  // Modal
  modal: { flex: 1, backgroundColor: '#F2F2F7' },
  modalNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA' },
  modalNavTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  modalCloseBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  modalBody: { flex: 1, padding: 20 },
  navIcon: { width: 24, height: 24, borderRadius: 7, justifyContent: 'center', alignItems: 'center' },

  // Briefing
  briefingCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, ...Shadows.sm },
  briefingText: { fontSize: 15, color: '#1C1C1E', lineHeight: 24 },

  // Project
  projRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12 },
  projRowName: { flex: 1, fontSize: 14, fontWeight: '500', color: '#1C1C1E' },
  projRowProg: { fontSize: 12, color: '#8E8E93', fontWeight: '600' },
  analysisHead: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 12 },
  analysisName: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  progressBg: { flex: 1, height: 5, borderRadius: 2.5, backgroundColor: '#E5E5EA', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2.5, backgroundColor: Colors.primary },
  bubble: { maxWidth: '88%', padding: 12, borderRadius: 16, marginBottom: 8 },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleAI: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4, ...Shadows.sm },
  bubbleAIlabel: { fontSize: 9, color: '#8E8E93', fontWeight: '700', marginBottom: 4 },
  bubbleText: { fontSize: 13, color: '#1C1C1E', lineHeight: 18 },
  chatBar: { flexDirection: 'row', gap: 8, marginTop: 8 },
  chatInput: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, maxHeight: 60 },
  chatSend: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  linkText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },

  // Insight
  insightGrid: { gap: 10 },
  insightCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, ...Shadows.sm },
  insightIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  insightLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1C1C1E' },

  // Tasks
  taskRow: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 16 },
  taskBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5E5EA' },
  taskBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },

  // History
  histRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12 },
  histDot: { width: 8, height: 8, borderRadius: 4 },

  // Quick Entry
  qeMethodRow: { flexDirection: 'row', gap: 12 },
  qeMethodCard: { flex: 1, alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20 },
  qeMethodCircle: { width: 52, height: 52, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  qeMethodLabel: { fontSize: 14, fontWeight: '600', color: '#1C1C1E' },
  qeMethodHint: { fontSize: 11, color: '#8E8E93' },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#1C1C1E', marginBottom: 6 },
  textarea: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, fontSize: 15, color: '#1C1C1E', minHeight: 100, textAlignVertical: 'top', lineHeight: 22 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: `${Colors.primary}10` },
  chipText: { fontSize: 12, color: Colors.primary, fontWeight: '500' },
  ftChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FFFFFF' },
  ftChipActive: { backgroundColor: Colors.primary },
  ftChipText: { fontSize: 12, fontWeight: '600', color: '#8E8E93' },
  cta: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  ctaGradient: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 16 },
  ctaText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  resultBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12 },
  resultBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  resultBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  typeSelectRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  typeOpt: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 4 },
  typeOptActive: { backgroundColor: Colors.primary },
  typeOptText: { fontSize: 12, fontWeight: '600', color: '#8E8E93' },
  recDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F59E0B' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  fieldKey: { width: 72, fontSize: 12, color: '#8E8E93', fontWeight: '500' },
  fieldInput: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, color: '#1C1C1E' },
  projChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#FFFFFF', marginRight: 6, maxWidth: 110 },
  projChipActive: { backgroundColor: `${Colors.primary}12`, borderWidth: 1, borderColor: Colors.primary },
  doneWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  doneCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  doneTitle: { fontSize: 20, fontWeight: '800', color: '#1C1C1E' },
  doneSub: { fontSize: 14, color: '#8E8E93', marginTop: 4 },
  doneBtnOutline: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: '#FFFFFF' },
  doneBtnOutlineText: { fontSize: 15, fontWeight: '600', color: Colors.primary },
  doneBtnFill: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.primary },
  doneBtnFillText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  detailText: { fontSize: 14, color: '#1C1C1E', lineHeight: 22 },
})
