import "dotenv/config";
import OpenAI from "openai";
import { readFileSync } from "fs";
import { join } from "path";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MEMORY_PATH = join(process.cwd(), "embeddings.json");

/** Model must separate short bubbles with this exact token */
const BUBBLE_DELIMITER = "|||BUBBLE|||";
/** Target max words per bubble when splitting long replies */
const MAX_WORDS_PER_BUBBLE = 30;

let memoryWithEmbeddings = null;

function loadMemory() {
  if (!memoryWithEmbeddings) {
    memoryWithEmbeddings = JSON.parse(readFileSync(MEMORY_PATH, "utf-8"));
  }
  return memoryWithEmbeddings;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function getRelevantChunks(question, topK = 3) {
  const memory = loadMemory();
  const { data } = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: question,
  });
  const qEmbedding = data[0].embedding;

  const scored = memory.map((item) => ({
    ...item,
    score: cosineSimilarity(item.embedding, qEmbedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(({ text }) => text);
}

const SYSTEM_PROMPT = `You are Hope (Houpu Wang) replying in a portfolio chat.

Voice & tone:
- Answer in first person as Hope ("I", "me", "my"). Be warm, friendly, and a little playful — like texting a visitor, not writing a cover letter.
- Sound human: short sentences, light humor is welcome. Avoid corporate filler, bullet lists unless they really help, and phrases like "As an AI" or "I would be happy to assist."
- Stay grounded only in the Memory Context below. Do not invent facts, schools, dates, or projects that are not there.

Length & bubbles:
- Aim for about ${MAX_WORDS_PER_BUBBLE} words or fewer per chunk of text. If you need more than that to answer well, split into multiple chunks.
- Put EXACTLY this line between chunks (nothing else on that line): ${BUBBLE_DELIMITER}
- Each chunk should read like one chat bubble: tight, conversational, easy to skim.

Language:
- Reply in English even if the memory includes other languages.

Project links (for the site UI):
When you mention any of these projects, include the exact canonical name below (verbatim) so the UI can link it:
- Respire Bracelet
- joint synch
- MoMA PS1 Bookstore
- Vicino.AI
- blogs

Memory Context:
{{CONTEXT}}`;

// Map canonical project names in the model reply to portfolio URLs.
const PROJECT_LINKS = [
  {
    keyword: "Respire Bracelet",
    url: "https://wanghoupu.com/product/respire",
  },
  {
    keyword: "joint synch",
    url: "https://wanghoupu.com/product/dellobank",
  },
  {
    keyword: "MoMA PS1 Bookstore",
    url: "https://wanghoupu.com/service-design",
  },
  {
    keyword: "Vicino.AI",
    url: "https://wanghoupu.com/vicino",
  },
  {
    keyword: "blogs",
    url: "https://wanghoupu.com/blogs",
  },
];

function buildSegmentsFromMessage(message) {
  if (!message || PROJECT_LINKS.length === 0) return undefined;

  const segments = [];
  let cursor = 0;
  const lowerMessage = message.toLowerCase();

  while (cursor < message.length) {
    let bestMatch = null;

    for (const proj of PROJECT_LINKS) {
      const lowerKeyword = proj.keyword.toLowerCase();
      const idx = lowerMessage.indexOf(lowerKeyword, cursor);
      if (idx === -1) continue;
      if (!bestMatch || idx < bestMatch.index) {
        bestMatch = { index: idx, keyword: proj.keyword, url: proj.url };
      }
    }

    if (!bestMatch) {
      if (cursor < message.length) {
        segments.push({ type: "text", text: message.slice(cursor) });
      }
      break;
    }

    if (bestMatch.index > cursor) {
      segments.push({ type: "text", text: message.slice(cursor, bestMatch.index) });
    }

    segments.push({
      type: "link",
      text: bestMatch.keyword,
      url: bestMatch.url,
    });

    cursor = bestMatch.index + bestMatch.keyword.length;
  }

  return segments.length > 0 ? segments : undefined;
}

/** Split long text into ~maxWords word chunks (fallback if model omits delimiter) */
function splitIntoWordBubbles(text, maxWords = MAX_WORDS_PER_BUBBLE) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return [text.trim()].filter(Boolean);
  const out = [];
  for (let i = 0; i < words.length; i += maxWords) {
    out.push(words.slice(i, i + maxWords).join(" "));
  }
  return out;
}

function parseAssistantBubbles(raw) {
  if (!raw || typeof raw !== "string") {
    return ["I don't have information about that."];
  }
  let t = raw.trim();
  if (t.includes(BUBBLE_DELIMITER)) {
    const parts = t
      .split(BUBBLE_DELIMITER)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts;
  }
  return splitIntoWordBubbles(t);
}

export async function chat(userMessage, contextChunks) {
  const context =
    contextChunks.length > 0
      ? contextChunks.join("\n\n")
      : "(No relevant information in memory.)";
  const systemContent = SYSTEM_PROMPT.replace("{{CONTEXT}}", context);

  if (contextChunks.length === 0) {
    const message = "I don't have information about that.";
    return {
      message,
      segments: undefined,
      bubbles: [{ message, segments: undefined }],
    };
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userMessage },
    ],
  });

  const raw =
    response.choices[0]?.message?.content?.trim() ?? "I don't have information about that.";
  const parts = parseAssistantBubbles(raw);

  const bubbles = parts.map((text) => ({
    message: text,
    segments: buildSegmentsFromMessage(text),
  }));

  const message = parts.join(" ");

  return {
    message,
    segments: bubbles[0]?.segments,
    bubbles,
  };
}
