// Framer 无背景浮层式对话：ChatLog（透明）+ ChatBox（胶囊输入）
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
/** Bubble entrance: scale up + slide up */
const BUBBLE_ANIMATION = "bubbleIn 0.28s cubic-bezier(0.33, 1, 0.68, 1) forwards"

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
        inputFont,
    } = props

    const isMobile = variant === "Mobile"
    const pillExpandedW = isMobile ? MOBILE_PILL_EXPANDED : PILL_WIDTH_EXPANDED
    const pillCollapsedW = isMobile ? MOBILE_PILL_COLLAPSED : PILL_WIDTH_COLLAPSED
    const chatLogWidth = isMobile ? MOBILE_CHATLOG_WIDTH : CHATLOG_WIDTH

    const [keyboardOffset, setKeyboardOffset] = useState(0)
    const [messages, setMessages] = useState<Message[]>([])
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

    const playIntroGreeting = () => {
        const lines = [greetingLine1, greetingLine2, greetingLine3]
        introTimeoutsRef.current.forEach((id) => clearTimeout(id))
        introTimeoutsRef.current = []
        lines.forEach((content, i) => {
            const id = window.setTimeout(() => {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: `intro-${Date.now()}-${i}`,
                        role: "assistant" as const,
                        content,
                    },
                ])
            }, i * introStaggerMs)
            introTimeoutsRef.current.push(id)
        })
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

    const handleSend = async () => {
        const text = input.trim()
        if (!text || loading) return

        // Cancel any pending intro bubbles if the user sends before they all appear
        introTimeoutsRef.current.forEach((id) => clearTimeout(id))
        introTimeoutsRef.current = []
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
            }`}</style>
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
            {/* ChatLog: transparent layer with bubbles, visible when there are messages */}
            {chatLogVisible && (
                <div
                    ref={chatLogRef}
                    style={{
                        width: chatLogWidth,
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
                                    animation: BUBBLE_ANIMATION,
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
                            onClick={(e) => {
                                e.stopPropagation()
                                setInput(label)
                                setExpanded(true)
                                setChatLogVisible(true)
                                setTimeout(() => inputRef.current?.focus(), 0)
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
                                cursor: "pointer",
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
    inputFont: {
        type: ControlType.Font,
        title: "Font",
        controls: "extended",
    },
})
