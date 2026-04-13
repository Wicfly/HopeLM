/**
 * One-time / utility: reads memory.json and writes memory.md with soft line wraps (~76 cols).
 * Edit memory.md, then run: node buildMemoryFromMd.js && node generateEmbeddings.js
 */
import { readFileSync, writeFileSync } from "fs";

const JSON_PATH = "./memory.json";
const MD_PATH = "./memory.md";
const WIDTH = 76;

const memory = JSON.parse(readFileSync(JSON_PATH, "utf-8"));

let out = `# Memory (Hope LLM)

Edit the sections below. **Paragraphs** are separated by blank lines. You can break long
lines in the middle of a paragraph for readability — they will be merged back into one
line when building JSON.

**Lists** (lines starting with \`- \`, \`* \`, \`1. \`, or \`1) \`) keep line breaks within that block.

After saving, run:

\`\`\`bash
node buildMemoryFromMd.js && node generateEmbeddings.js
\`\`\`

---

`;

for (const item of memory) {
  out += `## ${item.id}\n\n`;
  out += textToWrappedMd(item.text) + "\n\n";
}

writeFileSync(MD_PATH, out, "utf-8");
console.log(`Wrote ${MD_PATH}`);

function textToWrappedMd(text) {
  const paras = text.split(/\n\n+/);
  return paras.map(wrapParagraph).join("\n\n");
}

function wrapParagraph(p) {
  const lines = p.split("\n");
  const looksLikeList = lines.some((l) => {
    const t = l.trim();
    return /^[-*]\s/.test(t) || /^\d+\.\s/.test(t) || /^\d+[\).]\s/.test(t);
  });
  if (looksLikeList) return lines.map((l) => l.trimEnd()).join("\n");

  const flat = lines
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
  return wrapLine(flat, WIDTH);
}

function wrapLine(s, w) {
  const words = s.split(/\s+/);
  const out = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > w && line) {
      out.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) out.push(line);
  return out.join("\n");
}
