import "dotenv/config";
import express from "express";
import { getRelevantChunks, chat } from "./chat.js";

const app = express();
app.use(express.json());

app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'message' field." });
    }

    const chunks = await getRelevantChunks(message, 3);
    const reply = await chat(message, chunks);
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chat failed." });
  }
});

const port = process.env.PORT ?? 3000;
app.listen(port, () => console.log(`RAG chat API on http://localhost:${port}`));
