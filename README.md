# Portfolio RAG Chat

Minimal RAG (Retrieval-Augmented Generation) API for the portfolio chatbox. Uses OpenAI for embeddings and chat.

**Serverless-friendly:** Embeddings are generated once locally and committed; at runtime only one embedding call (user question) + similarity + gpt-4o-mini. No batch embedding on cold start.

## Folder structure

```
HopeLM/
├── memory.json              # Text chunks (edit, then re-run generate-embeddings)
├── embeddings.json          # Generated locally; deploy this (do not edit)
├── generateEmbeddings.js    # Run locally: memory.json → embeddings.json
├── chat.js                  # Load embeddings.json, 1 question embedding, similarity, top 3, 4o-mini
├── server.js                # Express server, POST /api/chat
├── package.json
├── .env                     # Your secrets (copy from .env.example)
├── .env.example
└── README.md
```

## Installation

1. **Clone or copy the project** into your workspace.

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Configure environment:**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set your OpenAI API key:

   ```
   OPENAI_API_KEY=sk-your-key-here
   PORT=3000
   ```

   The app reads `.env` via `dotenv`. Do not commit `.env` to version control.

4. **Generate embeddings locally** (required before first chat or deploy):

   ```bash
   npm run generate-embeddings
   ```

   This reads `memory.json`, calls the embedding API once, and writes `embeddings.json`. Re-run after changing `memory.json`. Commit `embeddings.json` so serverless can read it without calling the embedding API at runtime.

5. **Start the server:**

   ```bash
   npm start
   ```

   Server runs at `http://localhost:3000` (or the port in `PORT`).

## Deploy (e.g. serverless)

- **Do not** call the embedding API in bulk at runtime (expensive, slow, timeout).
- **Do** ship `embeddings.json` and run only:
  1. Load `embeddings.json`
  2. Compute embedding for the user question (single API call)
  3. Cosine similarity with stored embeddings → top 3 chunks
  4. Call gpt-4o-mini with context

`chat.js` already implements this; ensure `embeddings.json` is included in your deployment artifact.

## Example `memory.json` content

`memory.json` can be a JSON array of strings or objects with `id` and `text`. Example (objects):

```json
[
  { "id": "intro", "text": "Houpu Wang is a software engineer and creator. He built HopeLM and various portfolio projects." },
  { "id": "stack", "text": "Houpu's tech stack includes Node.js, TypeScript, React, and modern web technologies." }
]
```

Or plain strings: `["chunk one", "chunk two"]`. Edit this file, then run `npm run generate-embeddings` again.

## Example curl request

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Who is Houpu Wang?"}'
```

Example response:

```json
{"reply":"Houpu Wang is a software engineer and creator. He built HopeLM and various portfolio projects. His portfolio showcases full-stack projects, open-source contributions, and technical writing."}
```

Out-of-scope question (no relevant chunks):

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the capital of Mars?"}'
```

```json
{"reply":"I don't have information about that."}
```

## API

- **POST /api/chat**  
  Body: `{ "message": "user question" }`  
  Response: `{ "reply": "assistant reply" }`  
  Uses top 3 relevant chunks from `embeddings.json`, injects them as context, and instructs the model to answer only from that context. If no chunks are used, responds with `"I don't have information about that."`

## Models

- Chat: `gpt-4o-mini`
- Embeddings: `text-embedding-3-small`
