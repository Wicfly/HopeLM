// Framer 浮层对话：ChatLog（可配色实心背景）+ ChatBox（胶囊输入）
import React, { useState, useRef, useEffect } from "react"
import { addPropertyControls, ControlType } from "framer"

const PILL_WIDTH_COLLAPSED = 225
const PILL_WIDTH_EXPANDED = 400
/** Mobile variant: expanded pill and chat column width */
const MOBILE_PILL_EXPANDED = 380
const MOBILE_PILL_COLLAPSED = 260
const MOBILE_CHATLOG_WIDTH = 380
const PILL_HEIGHT = 48
const PILL_RADIUS = 32
const CONTENT_HEIGHT = 32
const SEND_BUTTON_SIZE = 32
const PILL_PADDING = (PILL_HEIGHT - CONTENT_HEIGHT) / 2 // 8
const STORAGE_KEY = "hope_floating_chat_messages"
const SUGGESTIONS_STORAGE_KEY = "hope_floating_chat_suggestions"
const CHATLOG_WIDTH = 400
const CHATLOG_MAX_HEIGHT = 300
const CHATLOG_GAP = 8
const BUBBLE_GAP = 10
const BUBBLE_RADIUS = 16
const BUBBLE_PADDING = "8px 12px"
/** 展开动画：0.3s，三阶贝塞尔更丝滑 */
const EXPAND_EASING = "cubic-bezier(0.33, 1, 0.68, 1)"
/** 首次进入页面时，整块 chat UI 自中心展开的时长 */
const CHATBOX_ENTRANCE_DURATION_S = 0.68
/** Bubble entrance: scale up + slide up */
const BUBBLE_ANIMATION = "bubbleIn 0.28s cubic-bezier(0.33, 1, 0.68, 1) forwards"
/** Assistant reply: characters revealed per tick + interval (ms) */
const TYPEWRITER_CHARS_PER_TICK = 1
const TYPEWRITER_INTERVAL_MS = 16

function luminanceFromCssColor(cssColor: string): number | null {
    const s = cssColor.trim()
    const hex6 = s.match(/^#([0-9a-f]{6})$/i)
    if (hex6) {
        const n = parseInt(hex6[1], 16)
        const r = (n >> 16) & 255
        const g = (n >> 8) & 255
        const b = n & 255
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255
    }
    const hex3 = s.match(/^#([0-9a-f]{3})$/i)
    if (hex3) {
        const h = hex3[1]
        const r = parseInt(h[0] + h[0], 16)
        const g = parseInt(h[1] + h[1], 16)
        const b = parseInt(h[2] + h[2], 16)
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255
    }
    const rgb = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/)
    if (rgb) {
        const r = +rgb[1]
        const g = +rgb[2]
        const b = +rgb[3]
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255
    }
    return null
}

function isDarkChatLogBackground(cssColor: string): boolean {
    const L = luminanceFromCssColor(cssColor)
    if (L === null) return false
    return L < 0.5
}

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
    /** First-time greeting — line 1 (shown as first bubble) */
    greetingLine1: string
    /** First-time greeting — line 2 */
    greetingLine2: string
    /** First-time greeting — line 3 */
    greetingLine3: string
    /** Delay between greeting bubbles (ms) */
    introStaggerMs: number
    /** Delay between assistant reply bubbles when API returns multiple (ms) */
    replyBubbleStaggerMs: number
    /** CSS box-shadow for the pill (e.g. 0 8px 32px rgba(0,0,0,0.12)) */
    pillBoxShadow: string
    /** Stroke width around the pill (px); 0 = none */
    pillStrokeWidth: number
    /** Stroke color for the pill border */
    pillStrokeColor: string
    /** Default chip prompts (before first API reply); shown as 3 starter questions */
    defaultSuggestion1: string
    defaultSuggestion2: string
    defaultSuggestion3: string
    /** Chip background */
    suggestionChipBackground: string
    /** Chip text color */
    suggestionChipTextColor: string
    /** Desktop vs mobile: mobile uses 380px width + keyboard lift */
    variant?: "Desktop" | "Mobile"
    /** 胶囊背景色（带透明度） */
    pillBackground: string
    /** 占位/输入文字颜色 */
    textColor: string
    /** 发送按钮背景色 */
    sendButtonColor: string
    /** 发送按钮图标颜色 */
    sendIconColor: string
    /** 对话区域（消息列表）背景色；浅色用黑气泡，深色背景自动切换为浅色气泡以保证对比 */
    chatLogBackground: string
    inputFont: any
}

/**
 * Chatbot — 浮层对话：ChatLog（实心背景 + 气泡）+ ChatBox 胶囊输入
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
        greetingLine1 = `Hi — I'm Hope (your chat twin). Nice to meet you.`,
        greetingLine2 = `Ask me anything about my work, path, or side quests. (Real Hope reserves the right to disagree with my answers — but I'll do my best.)`,
        greetingLine3 = `So — what's on your mind?`,
        introStaggerMs = 480,
        replyBubbleStaggerMs = 320,
        pillBoxShadow = "0 8px 32px rgba(0, 0, 0, 0.08)",
        pillStrokeWidth = 0,
        pillStrokeColor = "rgba(0, 0, 0, 0.08)",
        defaultSuggestion1 = "What's your background in design?",
        defaultSuggestion2 = "Tell me about Respire Bracelet.",
        defaultSuggestion3 = "What was Vicino.AI like?",
        suggestionChipBackground = "rgba(255, 255, 255, 0.55)",
        suggestionChipTextColor = "#1D1D1F",
        variant = "Desktop",
        pillBackground = "rgba(240, 240, 240, 0.65)",
        textColor = "#1D1D1F",
        sendButtonColor = "#1D1D1F",
        sendIconColor = "#FFFFFF",
        chatLogBackground = "#FFFFFF",
        inputFont,
    } = props

    const chatLogDark = isDarkChatLogBackground(chatLogBackground)
    const userBubbleBg = chatLogDark ? "#FFFFFF" : "#000000"
    const userBubbleFg = chatLogDark ? "#1D1D1F" : "#FFFFFF"
    const assistantBubbleBg = chatLogDark ? "#3A3A3C" : "#E5E5E5"
    const assistantBubbleFg = chatLogDark ? "#FFFFFF" : "#000000"

    const isMobile = variant === "Mobile"
    const pillExpandedW = isMobile ? MOBILE_PILL_EXPANDED : PILL_WIDTH_EXPANDED
    const pillCollapsedW = isMobile ? MOBILE_PILL_COLLAPSED : PILL_WIDTH_COLLAPSED
    const chatLogWidth = isMobile ? MOBILE_CHATLOG_WIDTH : CHATLOG_WIDTH

    const [keyboardOffset, setKeyboardOffset] = useState(0)
    const [messages, setMessages] = useState<Message[]>([])
    /** Per assistant message id: how many characters of content are visible (typewriter) */
    const [revealById, setRevealById] = useState<Record<string, number>>({})
    const messagesRef = useRef<Message[]>([])
    messagesRef.current = messages
    const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>(() =>
        [defaultSuggestion1, defaultSuggestion2, defaultSuggestion3].filter(
            (s) => s && String(s).trim()
        )
    )
    const [input, setInput] = useState("")
    const [expanded, setExpanded] = useState(false)
    const [chatLogVisible, setChatLogVisible] = useState(false)
    const [loading, setLoading] = useState(false)
    const [hovered, setHovered] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const wrapperRef = useRef<HTMLDivElement>(null)
    const chatLogRef = useRef<HTMLDivElement>(null)
    /** First session open with empty history: show 3-line intro only once */
    const introShownRef = useRef(false)
    const introTimeoutsRef = useRef<number[]>([])
    /** Remaining greeting lines after the first (sequential typewriter) */
    const introPendingLinesRef = useRef<string[] | null>(null)
    /** Prevents double-append (e.g. Strict Mode) after a line finishes typing */
    const introLastHandledCompletionIdRef = useRef<string | null>(null)
    const replyTimeoutsRef = useRef<number[]>([])

    useEffect(() => {
        return () => {
            introTimeoutsRef.current.forEach((id) => clearTimeout(id))
            introTimeoutsRef.current = []
            replyTimeoutsRef.current.forEach((id) => clearTimeout(id))
            replyTimeoutsRef.current = []
        }
    }, [])

    // Restore conversation + suggestion chips from sessionStorage
    useEffect(() => {
        if (typeof window === "undefined") return
        try {
            const raw = window.sessionStorage.getItem(STORAGE_KEY)
            if (raw) {
                const parsed = JSON.parse(raw)
                if (Array.isArray(parsed)) {
                    setMessages(parsed)
                    if (parsed.length > 0) introShownRef.current = true
                    const rev: Record<string, number> = {}
                    parsed.forEach((m: Message) => {
                        if (m.role === "assistant")
                            rev[m.id] = m.content.length
                    })
                    setRevealById(rev)
                }
            }
            const sugRaw = window.sessionStorage.getItem(
                SUGGESTIONS_STORAGE_KEY
            )
            if (sugRaw) {
                const sp = JSON.parse(sugRaw)
                if (Array.isArray(sp) && sp.some((x) => typeof x === "string")) {
                    setSuggestedPrompts(
                        sp.filter((x) => typeof x === "string" && x.trim())
                    )
                }
            }
        } catch {
            // ignore parse errors
        }
    }, [])

    // Persist conversation to sessionStorage when messages change (keeps chat when navigating between subpages)
    useEffect(() => {
        if (typeof window === "undefined") return
        try {
            window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
        } catch {
            // ignore write errors (e.g. private mode)
        }
    }, [messages])

    useEffect(() => {
        if (typeof window === "undefined") return
        try {
            window.sessionStorage.setItem(
                SUGGESTIONS_STORAGE_KEY,
                JSON.stringify(suggestedPrompts)
            )
        } catch {
            // ignore
        }
    }, [suggestedPrompts])

    // Mobile: lift entire chat above the virtual keyboard using Visual Viewport API
    useEffect(() => {
        if (!isMobile || typeof window === "undefined") {
            setKeyboardOffset(0)
            return
        }
        const vv = window.visualViewport
        if (!vv) return

        const updateInset = () => {
            const inset = window.innerHeight - vv.height - vv.offsetTop
            setKeyboardOffset(Math.max(0, inset))
        }

        vv.addEventListener("resize", updateInset)
        vv.addEventListener("scroll", updateInset)
        window.addEventListener("focusin", updateInset)
        window.addEventListener("focusout", updateInset)
        updateInset()

        return () => {
            vv.removeEventListener("resize", updateInset)
            vv.removeEventListener("scroll", updateInset)
            window.removeEventListener("focusin", updateInset)
            window.removeEventListener("focusout", updateInset)
        }
    }, [isMobile])

    // After each greeting line finishes typing, append the next line from the queue
    useEffect(() => {
        const pending = introPendingLinesRef.current
        if (pending === null) return

        const msgs = messagesRef.current
        const last = msgs[msgs.length - 1]
        if (!last || last.role !== "assistant") return
        if ((revealById[last.id] ?? 0) < last.content.length) return

        if (introLastHandledCompletionIdRef.current === last.id) return

        if (pending.length === 0) {
            introPendingLinesRef.current = null
            introLastHandledCompletionIdRef.current = last.id
            return
        }

        introLastHandledCompletionIdRef.current = last.id
        const [nextContent, ...rest] = pending
        introPendingLinesRef.current = rest.length > 0 ? rest : null

        setMessages((prev) => [
            ...prev,
            {
                id: `intro-${Date.now()}-${prev.length}`,
                role: "assistant" as const,
                content: nextContent,
            },
        ])
    }, [messages, revealById])

    // Typewriter: reveal assistant text character-by-character (sequential bubbles)
    useEffect(() => {
        const id = window.setInterval(() => {
            setRevealById((prev) => {
                const msgs = messagesRef.current
                const incomplete = msgs.find(
                    (m) =>
                        m.role === "assistant" &&
                        (prev[m.id] ?? 0) < m.content.length
                )
                if (!incomplete) return prev
                const mid = incomplete.id
                const cur = prev[mid] ?? 0
                const next = Math.min(
                    cur + TYPEWRITER_CHARS_PER_TICK,
                    incomplete.content.length
                )
                if (next === cur) return prev
                return { ...prev, [mid]: next }
            })
        }, TYPEWRITER_INTERVAL_MS)
        return () => clearInterval(id)
    }, [])

    // Scroll to bottom when new messages arrive or typewriter advances
    useEffect(() => {
        if (chatLogRef.current)
            chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight
    }, [messages, loading, revealById])

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

    /** Assistant: plain slice while typing; full segments when reveal complete */
    const renderAssistantBody = (msg: Message) => {
        const fullLen = msg.content.length
        const revealed = revealById[msg.id] ?? 0
        if (revealed >= fullLen) return renderMessageContent(msg)
        const slice = msg.content.slice(0, revealed)
        return slice || "\u00a0"
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

    const playIntroGreeting = () => {
        introTimeoutsRef.current.forEach((id) => clearTimeout(id))
        introTimeoutsRef.current = []

        const lines = [greetingLine1, greetingLine2, greetingLine3].filter(
            (s) => s && String(s).trim()
        )
        if (lines.length === 0) return

        introLastHandledCompletionIdRef.current = null
        const [first, ...rest] = lines
        introPendingLinesRef.current = rest.length > 0 ? rest : null

        setMessages((prev) => [
            ...prev,
            {
                id: `intro-${Date.now()}-0`,
                role: "assistant" as const,
                content: first,
            },
        ])
    }

    const expandFromCollapsed = () => {
        setExpanded(true)
        setChatLogVisible(true)
        if (messages.length === 0 && !introShownRef.current) {
            introShownRef.current = true
            playIntroGreeting()
        }
        setTimeout(() => inputRef.current?.focus(), 50)
    }

    /** `presetText` sends that string directly (e.g. suggestion chips) without an extra click */
    const handleSend = async (presetText?: string) => {
        const text = (
            typeof presetText === "string" ? presetText : input
        ).trim()
        if (!text || loading) return

        // Cancel any pending intro bubbles if the user sends before they all appear
        introTimeoutsRef.current.forEach((id) => clearTimeout(id))
        introTimeoutsRef.current = []
        introPendingLinesRef.current = null
        introLastHandledCompletionIdRef.current = null
        replyTimeoutsRef.current.forEach((id) => clearTimeout(id))
        replyTimeoutsRef.current = []
        introShownRef.current = true

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

                const normalizeSegments = (raw: unknown): MessageSegment[] | undefined => {
                    if (!Array.isArray(raw)) return undefined
                    return raw
                        .filter((s: any) => typeof s?.text === "string")
                        .map((s: any) => ({
                            type: s.type === "link" ? "link" : "text",
                            text: String(s.text),
                            url: typeof s.url === "string" ? s.url : undefined,
                        }))
                }

                const apiSuggestions = (data as any)?.suggestions
                if (Array.isArray(apiSuggestions)) {
                    const next = apiSuggestions
                        .filter((x: unknown) => typeof x === "string")
                        .map((s: string) => s.trim())
                        .filter(Boolean)
                    if (next.length > 0) {
                        setSuggestedPrompts(next.slice(0, 3))
                    }
                }

                const bubbleList = (data as any)?.bubbles
                if (Array.isArray(bubbleList) && bubbleList.length > 0) {
                    bubbleList.forEach((b: any, i: number) => {
                        const content =
                            typeof b?.message === "string"
                                ? b.message
                                : typeof b?.text === "string"
                                  ? b.text
                                  : ""
                        if (!content) return
                        const id = window.setTimeout(() => {
                            setMessages((prev) => [
                                ...prev,
                                {
                                    id: `a-${Date.now()}-${i}`,
                                    role: "assistant" as const,
                                    content: content || "(no reply)",
                                    segments: normalizeSegments(b?.segments),
                                },
                            ])
                        }, i * replyBubbleStaggerMs)
                        replyTimeoutsRef.current.push(id)
                    })
                } else {
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
                        segments = normalizeSegments((data as any).segments)
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
            expandFromCollapsed()
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    return (
        <>
            <style>{`@keyframes bubbleIn {
                from { opacity: 0; transform: scale(0.88) translateY(10px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
            }
            @keyframes thinkingDots {
                0%, 20% { opacity: 0.35; }
                50% { opacity: 1; }
                100% { opacity: 0.35; }
            }
            .hope-thinking-dots span { animation: thinkingDots 1.2s ease-in-out infinite; }
            .hope-thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
            .hope-thinking-dots span:nth-child(3) { animation-delay: 0.4s; }
            .hope-suggestion-chip {
                transition: transform 0.2s ease-out, box-shadow 0.2s ease-out;
            }
            .hope-suggestion-chip:hover:not(:disabled) {
                transform: scale(1.045);
            }
            .hope-suggestion-chip:active:not(:disabled) {
                transform: scale(1.02);
            }
            @keyframes hopeChatboxEntrance {
                from {
                    opacity: 0;
                    transform: scale(0.78);
                }
                to {
                    opacity: 1;
                    transform: scale(1);
                }
            }
            .hope-chatbox-entrance {
                transform-origin: 50% 50%;
                animation: hopeChatboxEntrance ${CHATBOX_ENTRANCE_DURATION_S}s ${EXPAND_EASING} forwards;
            }
            @media (prefers-reduced-motion: reduce) {
                .hope-chatbox-entrance {
                    animation: none;
                    opacity: 1;
                    transform: none;
                }
            }
            `}</style>
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
                boxSizing: "border-box",
                transform:
                    isMobile && keyboardOffset > 0
                        ? `translateY(-${keyboardOffset}px)`
                        : undefined,
                transition: isMobile
                    ? "transform 0.22s ease-out"
                    : undefined,
                willChange: isMobile ? "transform" : undefined,
            }}
        >
            <div
                className="hope-chatbox-entrance"
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: CHATLOG_GAP,
                    width: "100%",
                    boxSizing: "border-box",
                }}
            >
            {/* ChatLog: conversation panel (solid background from props) */}
            {chatLogVisible && (
                <div
                    ref={chatLogRef}
                    style={{
                        width: chatLogWidth,
                        maxHeight: CHATLOG_MAX_HEIGHT,
                        overflowY: "auto",
                        overflowX: "hidden",
                        background: chatLogBackground,
                        borderRadius: 24,
                        padding: 8,
                        display: "flex",
                        flexDirection: "column",
                        gap: BUBBLE_GAP,
                        flexShrink: 0,
                        boxSizing: "border-box",
                        border: chatLogDark
                            ? "1px solid rgba(255,255,255,0.08)"
                            : "1px solid rgba(0,0,0,0.06)",
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
                                            ? userBubbleBg
                                            : assistantBubbleBg,
                                    color:
                                        msg.role === "user"
                                            ? userBubbleFg
                                            : assistantBubbleFg,
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
                                    animation: BUBBLE_ANIMATION,
                                }}
                            >
                                {msg.role === "user"
                                    ? renderMessageContent(msg)
                                    : renderAssistantBody(msg)}
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
                                    background: assistantBubbleBg,
                                    color: assistantBubbleFg,
                                    fontSize: 14,
                                    opacity: 0.95,
                                }}
                            >
                                <span
                                    className="hope-thinking-dots"
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "baseline",
                                        gap: 2,
                                    }}
                                >
                                    Thinking
                                    <span>.</span>
                                    <span>.</span>
                                    <span>.</span>
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Suggested follow-up prompts (above the pill) */}
            {expanded && suggestedPrompts.length > 0 && (
                <div
                    style={{
                        width: chatLogWidth,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                        justifyContent: "center",
                        flexShrink: 0,
                        paddingLeft: 4,
                        paddingRight: 4,
                    }}
                >
                    {suggestedPrompts.map((label, i) => (
                        <button
                            key={`${label}-${i}`}
                            type="button"
                            className="hope-suggestion-chip"
                            disabled={loading}
                            onClick={(e) => {
                                e.stopPropagation()
                                handleSend(label)
                            }}
                            style={{
                                maxWidth: "100%",
                                padding: "6px 10px",
                                borderRadius: 999,
                                border: "1px solid rgba(0,0,0,0.08)",
                                background: suggestionChipBackground,
                                color: suggestionChipTextColor,
                                fontSize: 12,
                                lineHeight: 1.35,
                                cursor: loading ? "not-allowed" : "pointer",
                                opacity: loading ? 0.55 : 1,
                                textAlign: "left",
                                ...(inputFont
                                    ? {
                                          fontFamily: inputFont.family,
                                          fontWeight:
                                              inputFont.style?.fontWeight,
                                      }
                                    : {}),
                                backdropFilter: "blur(10px)",
                                WebkitBackdropFilter: "blur(10px)",
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            )}

            {/* ChatBox pill-shaped input */}
            <div
                onClick={handleContainerClick}
                onMouseEnter={() => !isMobile && setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    width: expanded ? pillExpandedW : pillCollapsedW,
                    height: PILL_HEIGHT,
                    borderRadius: PILL_RADIUS,
                    background: pillBackground,
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    boxSizing: "border-box",
                    padding: PILL_PADDING,
                    transition: `width 0.3s ${EXPAND_EASING}, transform 0.2s ease-out`,
                    transform:
                        !isMobile && hovered ? "scale(1.01)" : "scale(1)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexShrink: 0,
                    boxShadow: pillBoxShadow,
                    border:
                        pillStrokeWidth > 0
                            ? `${pillStrokeWidth}px solid ${pillStrokeColor}`
                            : "none",
                }}
            >
                <input
                    ref={inputRef}
                    type="text"
                    inputMode={isMobile ? "text" : undefined}
                    enterKeyHint={isMobile ? "send" : undefined}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                        if (isMobile && inputRef.current) {
                            window.setTimeout(() => {
                                inputRef.current?.scrollIntoView({
                                    block: "nearest",
                                    behavior: "smooth",
                                })
                            }, 280)
                        }
                    }}
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
                            expandFromCollapsed()
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
        </div>
        </>
    )
}

addPropertyControls(Chatbot, {
    variant: {
        type: ControlType.Enum,
        title: "Layout",
        options: ["Desktop", "Mobile"],
        optionTitles: ["Desktop", "Mobile"],
        defaultValue: "Desktop",
    },
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
    greetingLine1: {
        type: ControlType.String,
        title: "Greeting line 1",
        defaultValue:
            "Hi — I'm Hope (your chat twin). Nice to meet you.",
        displayTextArea: true,
    },
    greetingLine2: {
        type: ControlType.String,
        title: "Greeting line 2",
        defaultValue:
            "Ask me anything about my work, path, or side quests. (Real Hope reserves the right to disagree with my answers — but I'll do my best.)",
        displayTextArea: true,
    },
    greetingLine3: {
        type: ControlType.String,
        title: "Greeting line 3",
        defaultValue: "So — what's on your mind?",
        displayTextArea: true,
    },
    introStaggerMs: {
        type: ControlType.Number,
        title: "Greeting stagger (ms)",
        defaultValue: 480,
        min: 120,
        max: 2000,
        step: 40,
    },
    replyBubbleStaggerMs: {
        type: ControlType.Number,
        title: "Reply bubble stagger (ms)",
        defaultValue: 320,
        min: 0,
        max: 1500,
        step: 40,
    },
    pillBoxShadow: {
        type: ControlType.String,
        title: "Pill shadow (CSS)",
        defaultValue: "0 8px 32px rgba(0, 0, 0, 0.08)",
        displayTextArea: true,
    },
    pillStrokeWidth: {
        type: ControlType.Number,
        title: "Pill stroke (px)",
        defaultValue: 0,
        min: 0,
        max: 6,
        step: 1,
    },
    pillStrokeColor: {
        type: ControlType.Color,
        title: "Pill stroke color",
        defaultValue: "rgba(0, 0, 0, 0.08)",
    },
    defaultSuggestion1: {
        type: ControlType.String,
        title: "Default chip 1",
        defaultValue: "What's your background in design?",
        displayTextArea: true,
    },
    defaultSuggestion2: {
        type: ControlType.String,
        title: "Default chip 2",
        defaultValue: "Tell me about Respire Bracelet.",
        displayTextArea: true,
    },
    defaultSuggestion3: {
        type: ControlType.String,
        title: "Default chip 3",
        defaultValue: "What was Vicino.AI like?",
        displayTextArea: true,
    },
    suggestionChipBackground: {
        type: ControlType.Color,
        title: "Chip background",
        defaultValue: "rgba(255, 255, 255, 0.55)",
    },
    suggestionChipTextColor: {
        type: ControlType.Color,
        title: "Chip text color",
        defaultValue: "#1D1D1F",
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
    chatLogBackground: {
        type: ControlType.Color,
        title: "Chat log background",
        defaultValue: "#FFFFFF",
    },
    inputFont: {
        type: ControlType.Font,
        title: "Font",
        controls: "extended",
    },
})
