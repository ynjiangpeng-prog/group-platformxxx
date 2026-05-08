import { View, Text, StyleSheet, FlatList, TextInput, Pressable, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useState, useRef } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Card, SectionHeader, EmptyState, PageHeader } from '../../src/components/DesignSystem'
import { Colors, Spacing, Radius, IOS } from '../../src/theme/colors'
import { api } from '../../src/api/client'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  '分析本月营收趋势',
  '哪些项目有延期风险？',
  '充电站运营效率排名',
  '给出成本优化建议',
  '预测下季度现金流',
]

export default function AssistantScreen() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const flatListRef = useRef<FlatList>(null)

  const sendMessage = async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)
    try {
      const res = await api.post<{ answer: string }>('/business-twin/assistant', { question: msg })
      setMessages(prev => [...prev, { role: 'assistant', content: res.answer ?? '抱歉，无法生成回答。' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '请求失败，请重试。' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <PageHeader title="AI业务助手" onBack={() => router.back()} right={
        <View style={styles.liveChip}>
          <Text style={{ fontSize: 10, color: Colors.success, fontWeight: '700' }}>● 在线</Text>
        </View>
      } />

      {messages.length === 0 ? (
        <View style={styles.welcomeSection}>
          <View style={styles.welcomeIconCircle}>
            <Ionicons name="hardware-chip-outline" size={40} color={Colors.primary} />
          </View>
          <Text style={styles.welcomeTitle}>AI业务助手</Text>
          <Text style={styles.welcomeSub}>我可以帮你分析业务数据、生成报告、回答经营问题</Text>
          <SectionHeader title="试试这些问题" />
          {SUGGESTIONS.map((s, i) => (
            <Pressable key={i} style={styles.suggestionBtn} onPress={() => sendMessage(s)}>
              <Text style={styles.suggestionText}>{s}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: Spacing.xl }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd?.({ animated: true })}
          renderItem={({ item }) => (
            <View style={[styles.chatBubble, item.role === 'user' ? styles.userBubble : styles.aiBubble]}>
              {item.role === 'assistant' && <Text style={styles.aiLabel}>AI助手</Text>}
              <Text style={[styles.chatText, item.role === 'user' && { color: '#FFF' }]}>{item.content}</Text>
            </View>
          )}
        />
      )}

      {loading && (
        <View style={{ paddingHorizontal: Spacing.xl, marginBottom: 8 }}>
          <View style={[styles.chatBubble, styles.aiBubble]}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={{ fontSize: 12, color: IOS.label2, marginLeft: 8 }}>思考中...</Text>
          </View>
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.chatInput}
          placeholder="输入你的问题..."
          placeholderTextColor="#9CA3AF"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => sendMessage()}
          returnKeyType="send"
          editable={!loading}
        />
        <Pressable style={styles.sendBtn} onPress={() => sendMessage()} disabled={loading}>
          <Ionicons name="send" size={16} color="#FFF" />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: IOS.bg },
  liveChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, backgroundColor: Colors.successBg },
  welcomeSection: { flex: 1, paddingHorizontal: Spacing.xl, alignItems: 'center', paddingTop: 40 },
  welcomeIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: IOS.fill, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  welcomeTitle: { fontSize: 22, fontWeight: '800', color: IOS.label },
  welcomeSub: { fontSize: 13, color: IOS.label2, textAlign: 'center', marginTop: 8, marginBottom: 24 },
  suggestionBtn: { backgroundColor: '#FFFFFF', borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm, borderWidth: 1, borderColor: '#E5E7EB', width: '100%' },
  suggestionText: { fontSize: 14, color: Colors.primary, fontWeight: '500' },
  chatBubble: { maxWidth: '90%', padding: 12, borderRadius: Radius.lg, marginBottom: 8 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: Colors.primary },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: IOS.separator, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  aiLabel: { fontSize: 9, color: IOS.label2, fontWeight: '600', marginBottom: 3, width: '100%' },
  chatText: { fontSize: 13, color: IOS.label, lineHeight: 20 },
  inputRow: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: IOS.separator },
  chatInput: { flex: 1, backgroundColor: IOS.bg, borderRadius: Radius.xl, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, maxHeight: 60 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
})
