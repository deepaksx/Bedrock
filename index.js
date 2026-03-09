/**
 * Amazon Bedrock API Test - Using Bedrock API Key
 *
 * Prerequisites:
 *   1. Generate a Bedrock API Key from the Bedrock Console
 *   2. Enable model access in your AWS region
 *   3. npm install
 *
 * Usage:
 *   node index.js
 *   node index.js "Your custom prompt here"
 */

const REGION = process.env.AWS_REGION || "ap-south-1";
const API_KEY = process.env.BEDROCK_API_KEY || "YOUR_API_KEY_HERE";
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "";

const BEDROCK_BASE = `https://bedrock.${REGION}.amazonaws.com`;
const BEDROCK_RUNTIME_BASE = `https://bedrock-runtime.${REGION}.amazonaws.com`;

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${API_KEY}`,
};

// --- 1. List available foundation models ---
async function listModels() {
  console.log("=== Available Foundation Models ===\n");

  const res = await fetch(`${BEDROCK_BASE}/foundation-models`, { headers });

  if (!res.ok) {
    throw new Error(`ListModels failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const models = data.modelSummaries || [];
  console.log(`Total models: ${models.length}\n`);

  const claudeModels = models.filter((m) => m.providerName === "Anthropic");
  console.log("Anthropic models:");
  for (const m of claudeModels) {
    console.log(`  - ${m.modelId} (${m.modelName})`);
  }
  console.log();
}

// --- 2. List inference profiles (needed for most models) ---
async function listInferenceProfiles() {
  console.log("=== Inference Profiles ===\n");

  const res = await fetch(`${BEDROCK_BASE}/inference-profiles`, { headers });

  if (!res.ok) {
    console.log(`Could not list inference profiles: ${res.status}\n`);
    return null;
  }

  const data = await res.json();
  const profiles = data.inferenceProfileSummaries || [];

  const claudeProfiles = profiles.filter((p) =>
    p.inferenceProfileId?.includes("anthropic.claude")
  );

  if (claudeProfiles.length > 0) {
    console.log("Claude inference profiles:");
    for (const p of claudeProfiles) {
      console.log(`  - ${p.inferenceProfileId} (${p.inferenceProfileName})`);
    }
  } else {
    console.log("No Claude inference profiles found.");
    console.log("All profiles:");
    for (const p of profiles) {
      console.log(`  - ${p.inferenceProfileId} (${p.inferenceProfileName})`);
    }
  }
  console.log();

  // Return first usable Claude profile as fallback
  return claudeProfiles.length > 0 ? claudeProfiles[0].inferenceProfileId : null;
}

// --- 3. Invoke model using the Converse API ---
async function converseWithModel(modelId, prompt) {
  console.log(`=== Converse API (${modelId}) ===\n`);
  console.log(`Prompt: ${prompt}\n`);

  const body = {
    messages: [
      {
        role: "user",
        content: [{ text: prompt }],
      },
    ],
    inferenceConfig: {
      maxTokens: 512,
      temperature: 0.7,
    },
  };

  const res = await fetch(
    `${BEDROCK_RUNTIME_BASE}/model/${encodeURIComponent(modelId)}/converse`,
    { method: "POST", headers, body: JSON.stringify(body) }
  );

  if (!res.ok) {
    throw new Error(`Converse failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const reply = data.output.message.content[0].text;
  console.log(`Response:\n${reply}\n`);
  console.log(`Stop reason: ${data.stopReason}`);
  console.log(`Tokens - input: ${data.usage.inputTokens}, output: ${data.usage.outputTokens}`);
}

// --- 4. Invoke model using the InvokeModel API ---
async function invokeModelRaw(modelId, prompt) {
  console.log(`\n=== InvokeModel API (raw) ===\n`);

  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const res = await fetch(
    `${BEDROCK_RUNTIME_BASE}/model/${encodeURIComponent(modelId)}/invoke`,
    { method: "POST", headers, body }
  );

  if (!res.ok) {
    throw new Error(`InvokeModel failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  console.log(`Response:\n${data.content[0].text}\n`);
  console.log(`Tokens - input: ${data.usage.input_tokens}, output: ${data.usage.output_tokens}`);
}

// --- Main ---
async function main() {
  const prompt = process.argv[2] || "What is Amazon Bedrock? Answer in 2-3 sentences.";

  console.log(`Region: ${REGION}`);
  console.log(`API Key: ${API_KEY.slice(0, 8)}...${API_KEY.slice(-4)}\n`);

  try {
    await listModels();
    const profileId = await listInferenceProfiles();

    // Use provided MODEL_ID, or fallback to inference profile, or default
    const modelId = MODEL_ID || profileId || `${REGION}.anthropic.claude-3-haiku-20240307-v1:0`;
    console.log(`Using model/profile: ${modelId}\n`);

    await converseWithModel(modelId, prompt);
    await invokeModelRaw(modelId, prompt);
  } catch (err) {
    console.error("\nError:", err.message);
    process.exit(1);
  }
}

main();
