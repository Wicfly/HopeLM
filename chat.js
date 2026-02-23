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

Memory Context:
{{CONTEXT}}`;

export async function chat(userMessage, contextChunks) {
  const context =
    contextChunks.length > 0
      ? contextChunks.join("\n\n")
      : "(No relevant information in memory.)";
  const systemContent = SYSTEM_PROMPT.replace("{{CONTEXT}}", context);

  if (contextChunks.length === 0) {
    return "I don't have information about that.";
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userMessage },
    ],
  });

  return response.choices[0]?.message?.content?.trim() ?? "I don't have information about that.";
}
