import { useState, useCallback } from "react"

// 简化的AI Chat Hook（不依赖ai包，使用原生fetch实现流式输出）
interface Message {
  id: string
  role: "user" | "assistant"
  content: string
}

export function useAIChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
  }, [])

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return

    setIsLoading(true)
    setError(null)

    // 添加用户消息
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
    }
    setMessages((prev) => [...prev, userMessage])

    try {
      // 调用后端API
      const response = await fetch("/api/v1/ai/command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ command: content }),
      })

      if (!response.ok) {
        throw new Error("请求失败")
      }

      const data = await response.json()
      
      // 添加AI回复
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer || "抱歉，我无法回答这个问题。",
      }
      setMessages((prev) => [...prev, aiMessage])
      setInput("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误")
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    messages,
    input,
    handleInputChange,
    sendMessage,
    isLoading,
    error,
  }
}
