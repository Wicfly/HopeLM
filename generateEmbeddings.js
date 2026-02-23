import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MEMORY_PATH = "./memory.json";
const OUTPUT_PATH = "./embeddings.json";

const memory = JSON.parse(readFileSync(MEMORY_PATH, "utf-8"));

const texts = memory.map((m) => (typeof m === "string" ? m : m.text));
const { data } = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: texts,
});

const withEmbeddings = memory.map((item, i) => {
  const text = typeof item === "string" ? item : item.text;
  const out = { text, embedding: data[i].embedding };
  if (typeof item === "object" && item !== null && "id" in item) out.id = item.id;
  return out;
});

writeFileSync(OUTPUT_PATH, JSON.stringify(withEmbeddings, null, 2), "utf-8");
console.log(`Wrote ${withEmbeddings.length} chunks to ${OUTPUT_PATH}`);
