/**
 * Reads memory.md (human-editable) and writes memory.json.
 *
 * - Sections: ## id (id = letters, numbers, underscore)
 * - Paragraphs: separated by blank lines; soft line breaks inside a paragraph → merged with space
 * - List blocks: if a paragraph contains lines starting with "- ", "* ", "1. ", or "1) ", the whole
 *   paragraph keeps newlines (for Rules: + bullets, numbered lists, etc.)
 */
import { readFileSync, writeFileSync } from "fs";

const MD_PATH = "./memory.md";
const JSON_PATH = "./memory.json";

const raw = readFileSync(MD_PATH, "utf-8");
const lines = raw.replace(/\r\n/g, "\n").split("\n");

const sections = [];
let currentId = null;
let currentLines = [];

function flush() {
  if (!currentId) return;
  const text = sectionBodyToText(currentLines.join("\n"));
  sections.push({ id: currentId, text });
  currentLines = [];
  currentId = null;
}

const headerRe = /^##\s+([a-zA-Z0-9_]+)\s*$/;

for (const line of lines) {
  const m = line.match(headerRe);
  if (m) {
    flush();
    currentId = m[1];
    continue;
  }
  if (currentId) currentLines.push(line);
}

flush();

if (sections.length === 0) {
  console.error("No ## sections found in memory.md");
  process.exit(1);
}

writeFileSync(JSON_PATH, JSON.stringify(sections, null, 2) + "\n", "utf-8");
console.log(`Wrote ${sections.length} entries to ${JSON_PATH}`);

function sectionBodyToText(body) {
  const trimmed = body.replace(/^\n+/, "").replace(/\n+$/, "");
  if (!trimmed) return "";

  const blocks = trimmed.split(/\n\n+/);
  return blocks.map(blockToText).filter(Boolean).join("\n\n");
}

function blockToText(block) {
  const ls = block.split("\n").map((l) => l.trimEnd());
  const hasListLine = ls.some((l) => {
    const t = l.trim();
    return (
      /^[-*]\s/.test(t) ||
      /^\d+\.\s/.test(t) ||
      /^\d+[\).]\s/.test(t)
    );
  });
  if (hasListLine) return ls.join("\n").trim();

  return ls
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
