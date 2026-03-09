import "dotenv/config";
import OpenAI from "openai";
import { readFileSync } from "fs";
import { join } from "path";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MEMORY_PATH = join(process.cwd(), "embeddings.json");

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

const SYSTEM_PROMPT = `You are Houpu Wang's portfolio assistant.
Only answer using the provided memory context.
Do not fabricate information.
Keep responses professional and reflective.
Answer in English, even if the memory context includes other languages.

Memory Context:
{{CONTEXT}}`;

// Map project keywords in the model reply to portfolio URLs.
// TODO: Replace the example URLs with your real project links.
const PROJECT_LINKS = [
  {
    keyword: "Wearable Systems for Respiratory Diseases Project", // 示例：你在回复中会提到的项目名称
    url: "https://wanghoupu.com/product/respire",
  },
  {
    keyword: "TMD Temporomandibular Joint Program",
    url: "https://wanghoupu.com/product/dellobank",
  },
  {
    keyword: "MoMA PS1 Bookstore Service Design Project",
    url: "https://wanghoupu.com/service-design",
  },
  {
    keyword: "Work experience, Founding Designer at Vicino.AI",
    url: "https://wanghoupu.com/vicino",
  },
  {
    keyword: "Blogs",
    url: "https://wanghoupu.com/blogs",
  },
];

function buildSegmentsFromMessage(message) {
  if (!message || PROJECT_LINKS.length === 0) return undefined;

  const segments = [];
  let cursor = 0;

  while (cursor < message.length) {
    let bestMatch = null;

    for (const proj of PROJECT_LINKS) {
      const idx = message.indexOf(proj.keyword, cursor);
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

export async function chat(userMessage, contextChunks) {
  const context =
    contextChunks.length > 0
      ? contextChunks.join("\n\n")
      : "(No relevant information in memory.)";
  const systemContent = SYSTEM_PROMPT.replace("{{CONTEXT}}", context);

  if (contextChunks.length === 0) {
    const message = "I don't have information about that.";
    return { message, segments: undefined };
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userMessage },
    ],
  });

  const message =
    response.choices[0]?.message?.content?.trim() ?? "I don't have information about that.";

  const segments = buildSegmentsFromMessage(message);

  return { message, segments };
}
