// Framer 无背景浮层式对话：ChatLog（透明）+ ChatBox（胶囊输入）
import React, { useState, useRef, useEffect } from "react"
import { addPropertyControls, ControlType } from "framer"

const PILL_WIDTH_COLLAPSED = 225
const PILL_WIDTH_EXPANDED = 400
const PILL_HEIGHT = 48
const PILL_RADIUS = 32
const CONTENT_HEIGHT = 32
const SEND_BUTTON_SIZE = 32
const PILL_PADDING = (PILL_HEIGHT - CONTENT_HEIGHT) / 2 // 8
const STORAGE_KEY = "hope_floating_chat_messages"
const CHATLOG_WIDTH = 400
const CHATLOG_MAX_HEIGHT = 300
const CHATLOG_GAP = 8
const BUBBLE_GAP = 10
const BUBBLE_RADIUS = 16
const BUBBLE_PADDING = "8px 12px"
/** 展开动画：0.3s，三阶贝塞尔更丝滑 */
const EXPAND_EASING = "cubic-bezier(0.33, 1, 0.68, 1)"

interface MessageSegment {
    /** 普通文本或带链接的片段；后端可按句子或词语拆分 */
    type: "text" | "link"
    text: string
    /** 当 type 为 link 时的目标 URL */
    url?: string
}

interface Message {
    id: string
    role: "user" | "assistant"
    /** 完整回复文本（用于普通展示或 fallback） */
    content: string
    /** 可选的富文本片段；存在时前端会按片段渲染并为 link 类型加下划线和点击跳转 */
    segments?: MessageSegment[]
}

interface ChatbotProps {
    apiUrl: string
    apiKey: string
    openaiModel: string
    placeholder: string
    /** 胶囊背景色（带透明度） */
    pillBackground: string
    /** 占位/输入文字颜色 */
    textColor: string
    /** 发送按钮背景色 */
    sendButtonColor: string
    /** 发送按钮图标颜色 */
    sendIconColor: string
    inputFont: any
}

/**
 * Chatbot — 无背景浮层对话：ChatLog（透明+气泡）+ ChatBox 胶囊输入
 * @framerIntrinsicWidth 400
 * @framerIntrinsicHeight 360
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 */
export default function Chatbot(props: ChatbotProps) {
    const {
        apiUrl = "",
        apiKey = "",
        openaiModel = "gpt-3.5-turbo",
        placeholder = "Ask Hope LLM",
        pillBackground = "rgba(240, 240, 240, 0.65)",
        textColor = "#1D1D1F",
        sendButtonColor = "#1D1D1F",
        sendIconColor = "#FFFFFF",
        inputFont,
    } = props

    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState("")
    const [expanded, setExpanded] = useState(false)
    const [chatLogVisible, setChatLogVisible] = useState(false)
    const [loading, setLoading] = useState(false)
    const [hovered, setHovered] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const wrapperRef = useRef<HTMLDivElement>(null)
    const chatLogRef = useRef<HTMLDivElement>(null)

    // Restore conversation from localStorage on first mount (cross-page persistence)
    useEffect(() => {
        if (typeof window === "undefined") return
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY)
            if (raw) {
                const parsed = JSON.parse(raw)
                if (Array.isArray(parsed)) {
                    setMessages(parsed)
                }
            }
        } catch {
            // 忽略解析错误
        }
    }, [])

    // Persist conversation to localStorage when messages change
    useEffect(() => {
        if (typeof window === "undefined") return
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
        } catch {
            // 忽略写入失败（如隐私模式）
        }
    }, [messages])

    // Scroll to bottom when new messages arrive
    useEffect(() => {
        if (chatLogRef.current)
            chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight
    }, [messages, loading])

    const renderMessageContent = (msg: Message) => {
        if (!msg.segments || msg.segments.length === 0) {
            return msg.content
        }
        return msg.segments.map((seg, index) => {
            if (seg.type === "link" && seg.url) {
                return (
                    <span
                        key={index}
                        style={{
                            textDecoration: "underline",
                            cursor: "pointer",
                        }}
                        onClick={() => {
                            if (typeof window !== "undefined") {
                                window.open(seg.url!, "_blank")
                            }
                        }}
                    >
                        {seg.text}
                    </span>
                )
            }
            return <span key={index}>{seg.text}</span>
        })
    }

    // Click outside ChatBox/ChatLog: close log and collapse input
    useEffect(() => {
        const onMouseDown = (e: MouseEvent) => {
            if (
                wrapperRef.current &&
                !wrapperRef.current.contains(e.target as Node)
            ) {
                setChatLogVisible(false)
                setExpanded(false)
            }
        }
        document.addEventListener("mousedown", onMouseDown)
        return () => document.removeEventListener("mousedown", onMouseDown)
    }, [])

    const handleSend = async () => {
        const text = input.trim()
        if (!text || loading) return

        const useOpenAI = Boolean(apiKey?.trim())
        const endpoint = useOpenAI
            ? apiUrl?.trim() || "https://api.openai.com/v1/chat/completions"
            : apiUrl?.trim()

        if (!endpoint) return

        const userMsg: Message = {
            id: `u-${Date.now()}`,
            role: "user",
            content: text,
        }
        setMessages((prev) => [...prev, userMsg])
        setChatLogVisible(true)
        setInput("")
        setLoading(true)

        try {
            if (useOpenAI) {
                const openaiMessages = [
                    ...messages.map((m) => ({
                        role: m.role,
                        content: m.content,
                    })),
                    { role: "user" as const, content: text },
                ]
                const res = await fetch(endpoint, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apiKey.trim()}`,
                    },
                    body: JSON.stringify({
                        model: openaiModel,
                        messages: openaiMessages,
                    }),
                })
                if (!res.ok) throw new Error(`Request failed: ${res.status}`)
                const data = await res.json()
                const replyText = data?.choices?.[0]?.message?.content ?? ""
                setMessages((prev) => [
                    ...prev,
                    {
                        id: `a-${Date.now()}`,
                        role: "assistant",
                        content: replyText || "(no reply)",
                    },
                ])
            } else {
                const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message: text }),
                })
                if (!res.ok) throw new Error(`Request failed: ${res.status}`)
                const data = await res.json()
                const replyText =
                    typeof data?.message === "string"
                        ? data.message
                        : typeof data?.reply === "string"
                          ? data.reply
                          : typeof data?.content === "string"
                            ? data.content
                            : ""

                let segments: MessageSegment[] | undefined
                if (Array.isArray((data as any)?.segments)) {
                    segments = (data as any).segments
                        .filter((s: any) => typeof s?.text === "string")
                        .map((s: any) => ({
                            type: s.type === "link" ? "link" : "text",
                            text: String(s.text),
                            url: typeof s.url === "string" ? s.url : undefined,
                        }))
                }

                setMessages((prev) => [
                    ...prev,
                    {
                        id: `a-${Date.now()}`,
                        role: "assistant",
                        content: replyText || "(no reply)",
                        segments,
                    },
                ])
            }
        } catch {
            setMessages((prev) => [
                ...prev,
                {
                    id: `a-${Date.now()}`,
                    role: "assistant",
                    content: "Request error",
                },
            ])
        } finally {
            setLoading(false)
        }
    }

    const handleContainerClick = () => {
        if (!expanded) {
            setExpanded(true)
            if (messages.length > 0) setChatLogVisible(true)
            setTimeout(() => inputRef.current?.focus(), 50)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    return (
        <div
            ref={wrapperRef}
            style={{
                width: "100%",
                height: "100%",
                minHeight: PILL_HEIGHT,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: CHATLOG_GAP,
                boxSizing: "border-box",
            }}
        >
            {/* ChatLog: transparent layer with bubbles, visible when there are messages */}
            {chatLogVisible && (
                <div
                    ref={chatLogRef}
                    style={{
                        width: CHATLOG_WIDTH,
                        maxHeight: CHATLOG_MAX_HEIGHT,
                        overflowY: "auto",
                        overflowX: "hidden",
                        // 图层本身带轻微白色雾化，同时对背后内容做背景模糊
                        background: "rgba(255,255,255,0.25)",
                        backdropFilter: "blur(22px)",
                        WebkitBackdropFilter: "blur(22px)",
                        borderRadius: 24,
                        padding: 8,
                        display: "flex",
                        flexDirection: "column",
                        gap: BUBBLE_GAP,
                        flexShrink: 0,
                    }}
                >
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            style={{
                                alignSelf:
                                    msg.role === "user"
                                        ? "flex-end"
                                        : "flex-start",
                                maxWidth: "70%",
                            }}
                        >
                            <div
                                style={{
                                    padding: BUBBLE_PADDING,
                                    borderRadius: BUBBLE_RADIUS,
                                    background:
                                        msg.role === "user"
                                            ? "#000000"
                                            : "#e5e5e5",
                                    color:
                                        msg.role === "user"
                                            ? "#ffffff"
                                            : "#000000",
                                    ...(inputFont
                                        ? {
                                              fontFamily: inputFont.family,
                                              fontWeight:
                                                  inputFont.style?.fontWeight,
                                              fontSize: inputFont.size || 14,
                                          }
                                        : { fontSize: 14 }),
                                    lineHeight: 1.45,
                                    wordBreak: "break-word",
                                }}
                            >
                                {renderMessageContent(msg)}
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div
                            style={{ alignSelf: "flex-start", maxWidth: "70%" }}
                        >
                            <div
                                style={{
                                    padding: BUBBLE_PADDING,
                                    borderRadius: BUBBLE_RADIUS,
                                    background: "#e5e5e5",
                                    color: "#000000",
                                    fontSize: 14,
                                    opacity: 0.8,
                                }}
                            >
                                Typing...
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ChatBox pill-shaped input */}
            <div
                onClick={handleContainerClick}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    width: expanded
                        ? PILL_WIDTH_EXPANDED
                        : PILL_WIDTH_COLLAPSED,
                    height: PILL_HEIGHT,
                    borderRadius: PILL_RADIUS,
                    background: pillBackground,
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    boxSizing: "border-box",
                    padding: PILL_PADDING,
                    transition: `width 0.3s ${EXPAND_EASING}, transform 0.2s ease-out`,
                    transform: hovered ? "scale(1.01)" : "scale(1)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexShrink: 0,
                }}
            >
                <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={loading}
                    readOnly={!expanded}
                    style={{
                        flex: 1,
                        minWidth: 0,
                        height: CONTENT_HEIGHT,
                        padding: 0,
                        paddingLeft: 8,
                        paddingRight: 4,
                        border: "none",
                        outline: "none",
                        background: "transparent",
                        color: textColor,
                        ...(inputFont
                            ? {
                                  fontFamily: inputFont.family,
                                  fontWeight: inputFont.style?.fontWeight,
                                  fontSize: inputFont.size || 14,
                              }
                            : { fontSize: 14 }),
                        cursor: expanded ? "text" : "pointer",
                        caretColor: expanded ? textColor : "transparent",
                    }}
                />
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation()
                        if (expanded) handleSend()
                        else {
                            setExpanded(true)
                            if (messages.length > 0) setChatLogVisible(true)
                            setTimeout(() => inputRef.current?.focus(), 50)
                        }
                    }}
                    disabled={loading || !input.trim()}
                    style={{
                        width: SEND_BUTTON_SIZE,
                        height: SEND_BUTTON_SIZE,
                        borderRadius: "50%",
                        border: "none",
                        background: sendButtonColor,
                        color: sendIconColor,
                        cursor:
                            loading || !input.trim()
                                ? "not-allowed"
                                : "pointer",
                        opacity: loading || !input.trim() ? 0.5 : 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                    }}
                    aria-label="Send"
                >
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M18 15l-6-6-6 6" />
                    </svg>
                </button>
            </div>
        </div>
    )
}

addPropertyControls(Chatbot, {
    apiUrl: {
        type: ControlType.String,
        title: "API URL",
        defaultValue: "",
        placeholder: "https://api.openai.com/v1/chat/completions",
    },
    apiKey: {
        type: ControlType.String,
        title: "API Key (OpenAI)",
        defaultValue: "",
        placeholder: "sk-...",
        displayTextArea: false,
    },
    openaiModel: {
        type: ControlType.String,
        title: "OpenAI Model",
        defaultValue: "gpt-3.5-turbo",
    },
    placeholder: {
        type: ControlType.String,
        title: "Placeholder",
        defaultValue: "Ask Hope LLM",
    },
    pillBackground: {
        type: ControlType.Color,
        title: "Pill Background",
        defaultValue: "rgba(240, 240, 240, 0.65)",
    },
    textColor: {
        type: ControlType.Color,
        title: "Text Color",
        defaultValue: "#1D1D1F",
    },
    sendButtonColor: {
        type: ControlType.Color,
        title: "Send Button",
        defaultValue: "#1D1D1F",
    },
    sendIconColor: {
        type: ControlType.Color,
        title: "Send Icon",
        defaultValue: "#FFFFFF",
    },
    inputFont: {
        type: ControlType.Font,
        title: "Font",
        controls: "extended",
    },
})
