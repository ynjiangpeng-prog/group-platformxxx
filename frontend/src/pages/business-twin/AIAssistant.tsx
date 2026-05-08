import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { post } from '@/lib/http'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Loader2, Brain } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  intent?: string
}

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '你好！我是业务数字孪生的AI助手。你可以问我关于业务指标、趋势预测、知识图谱等任何问题。\n\n例如：\n- "上个月工程项目利润率怎么样？"\n- "今年充电站收入趋势如何？"\n- "ABC公司的合同情况"',
      timestamp: new Date().toISOString(),
    },
  ])
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const askMutation = useMutation({
    mutationFn: (question: string) =>
      post<{ question: string; answer: string; data: unknown; intent: string }>(
        '/business-twin/ask',
        { question, history: messages.slice(-6) },
      ),
    onSuccess: (data) => {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer,
          timestamp: new Date().toISOString(),
          intent: data.intent,
        },
      ])
    },
    onError: () => {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '抱歉，查询出错了。请稍后重试。',
          timestamp: new Date().toISOString(),
        },
      ])
    },
  })

  const handleSend = () => {
    const q = input.trim()
    if (!q || askMutation.isPending) return

    setMessages(prev => [
      ...prev,
      { role: 'user', content: q, timestamp: new Date().toISOString() },
    ])
    setInput('')
    askMutation.mutate(q)
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <h1 className="text-2xl font-bold mb-4">AI业务助手</h1>

      <Card className="flex-1 flex flex-col">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-1 mb-1 text-xs text-muted-foreground">
                      <Brain className="size-3" />
                      AI助手
                      {msg.intent && (
                        <span className="ml-1 opacity-60">({msg.intent})</span>
                      )}
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {askMutation.isPending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-3 flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">思考中...</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-4">
          <div className="flex gap-2 max-w-3xl mx-auto">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入你的业务问题..."
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={askMutation.isPending}
              className="flex-1"
            />
            <Button onClick={handleSend} disabled={askMutation.isPending || !input.trim()}>
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
