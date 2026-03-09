/**
 * Amazon Bedrock - Streaming Chat with API Key
 *
 * Interactive multi-turn chat with streaming responses.
 *
 * Usage:
 *   node chat.js
 */

import { createInterface } from "readline";

const REGION = process.env.AWS_REGION || "ap-south-1";
const API_KEY = process.env.BEDROCK_API_KEY || "YOUR_API_KEY_HERE";
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "anthropic.claude-sonnet-4-20250514-v1:0";

const BEDROCK_RUNTIME_BASE = `https://bedrock-runtime.${REGION}.amazonaws.com`;

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${API_KEY}`,
};

const conversationHistory = [];

async function chat(userMessage) {
  conversationHistory.push({
    role: "user",
    content: [{ text: userMessage }],
  });

  const body = {
    messages: conversationHistory,
    system: [{ text: "You are a helpful assistant. Be concise." }],
    inferenceConfig: {
      maxTokens: 1024,
      temperature: 0.7,
    },
  };

  const res = await fetch(
    `${BEDROCK_RUNTIME_BASE}/model/${encodeURIComponent(MODEL_ID)}/converse-stream`,
    { method: "POST", headers, body: JSON.stringify(body) }
  );

  if (!res.ok) {
    throw new Error(`Chat failed: ${res.status} ${await res.text()}`);
  }

  // Read the streaming response
  let fullResponse = "";
  process.stdout.write("\nAssistant: ");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse event stream chunks
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("{")) {
        try {
          const event = JSON.parse(line);
          if (event.contentBlockDelta?.delta?.text) {
            const text = event.contentBlockDelta.delta.text;
            process.stdout.write(text);
            fullResponse += text;
          }
          if (event.metadata?.usage) {
            const { inputTokens, outputTokens } = event.metadata.usage;
            process.stdout.write(`\n[tokens: ${inputTokens} in / ${outputTokens} out]\n`);
          }
        } catch {}
      }
    }
  }

  if (!fullResponse) {
    // Fallback: non-streaming converse if stream parsing didn't work
    console.log("\n(Streaming parse issue, falling back to non-streaming)");
    const fallbackRes = await fetch(
      `${BEDROCK_RUNTIME_BASE}/model/${encodeURIComponent(MODEL_ID)}/converse`,
      { method: "POST", headers, body: JSON.stringify(body) }
    );
    const data = await fallbackRes.json();
    fullResponse = data.output.message.content[0].text;
    console.log(`Assistant: ${fullResponse}`);
  }

  conversationHistory.push({
    role: "assistant",
    content: [{ text: fullResponse }],
  });
}

// --- Main ---
const rl = createInterface({ input: process.stdin, output: process.stdout });

console.log(`Bedrock Chat (${MODEL_ID})`);
console.log(`Region: ${REGION}`);
console.log('Type "quit" to exit.\n');

function prompt() {
  rl.question("You: ", async (input) => {
    const trimmed = input.trim();
    if (!trimmed || trimmed.toLowerCase() === "quit") {
      console.log("Bye!");
      rl.close();
      return;
    }
    try {
      await chat(trimmed);
      console.log();
      prompt();
    } catch (err) {
      console.error(`\nError: ${err.message}`);
      prompt();
    }
  });
}

prompt();
