/**
 * AWS Billing Dashboard - Web App
 *
 * Shows AWS costs with Bedrock breakdown.
 * Requires IAM credentials with ce:GetCostAndUsage permission.
 *
 * Usage:
 *   npm start
 *   Open http://localhost:3000
 */

import http from "http";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  GetCostForecastCommand,
} from "@aws-sdk/client-cost-explorer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const REGION = process.env.AWS_REGION || "us-east-1"; // Cost Explorer is global but needs a region

const ceClient = new CostExplorerClient({ region: REGION });

// --- Helper: format date as YYYY-MM-DD ---
function fmt(date) {
  return date.toISOString().split("T")[0];
}

// --- Get current month start/end ---
function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start: fmt(start), end: fmt(today < end ? today : end) };
}

// --- Get last N months range ---
function getLastNMonthsRange(n) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - n, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start: fmt(start), end: fmt(today < end ? today : end) };
}

// --- API: Total cost by service (current month) ---
async function getCostByService() {
  const { start, end } = getMonthRange();
  const res = await ceClient.send(
    new GetCostAndUsageCommand({
      TimePeriod: { Start: start, End: end },
      Granularity: "MONTHLY",
      Metrics: ["BlendedCost", "UnblendedCost", "UsageQuantity"],
      GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" }],
    })
  );
  return { period: { start, end }, results: res.ResultsByTime };
}

// --- API: Daily cost breakdown (current month) ---
async function getDailyCosts() {
  const { start, end } = getMonthRange();
  const res = await ceClient.send(
    new GetCostAndUsageCommand({
      TimePeriod: { Start: start, End: end },
      Granularity: "DAILY",
      Metrics: ["BlendedCost"],
    })
  );
  return { period: { start, end }, results: res.ResultsByTime };
}

// --- API: Bedrock daily breakdown (current month) ---
async function getBedrockDaily() {
  const { start, end } = getMonthRange();
  const res = await ceClient.send(
    new GetCostAndUsageCommand({
      TimePeriod: { Start: start, End: end },
      Granularity: "DAILY",
      Metrics: ["BlendedCost"],
      Filter: {
        Dimensions: { Key: "SERVICE", Values: ["Amazon Bedrock"] },
      },
    })
  );
  return { period: { start, end }, results: res.ResultsByTime };
}

// --- API: Monthly trend (last 6 months) ---
async function getMonthlyTrend() {
  const { start, end } = getLastNMonthsRange(6);
  const res = await ceClient.send(
    new GetCostAndUsageCommand({
      TimePeriod: { Start: start, End: end },
      Granularity: "MONTHLY",
      Metrics: ["BlendedCost"],
      GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" }],
    })
  );
  return { period: { start, end }, results: res.ResultsByTime };
}

// --- API: Cost forecast (rest of month) ---
async function getForecast() {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  if (tomorrow >= monthEnd) return { forecast: null, message: "Last day of month" };

  try {
    const res = await ceClient.send(
      new GetCostForecastCommand({
        TimePeriod: { Start: fmt(tomorrow), End: fmt(monthEnd) },
        Metric: "BLENDED_COST",
        Granularity: "MONTHLY",
      })
    );
    return { forecast: res.Total, period: { start: fmt(tomorrow), end: fmt(monthEnd) } };
  } catch {
    return { forecast: null, message: "Not enough data for forecast" };
  }
}

// --- API: Bedrock cost by model (usage type) ---
async function getBedrockByModel() {
  const { start, end } = getMonthRange();
  const res = await ceClient.send(
    new GetCostAndUsageCommand({
      TimePeriod: { Start: start, End: end },
      Granularity: "MONTHLY",
      Metrics: ["BlendedCost"],
      Filter: {
        Dimensions: { Key: "SERVICE", Values: ["Amazon Bedrock"] },
      },
    })
  );
  return { period: { start, end }, results: res.ResultsByTime };
}

// --- HTTP Server ---
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // API routes
  if (url.pathname.startsWith("/api/")) {
    res.setHeader("Content-Type", "application/json");
    try {
      let data;
      switch (url.pathname) {
        case "/api/services":
          data = await getCostByService();
          break;
        case "/api/daily":
          data = await getDailyCosts();
          break;
        case "/api/bedrock-daily":
          data = await getBedrockDaily();
          break;
        case "/api/trend":
          data = await getMonthlyTrend();
          break;
        case "/api/forecast":
          data = await getForecast();
          break;
        case "/api/bedrock-models":
          data = await getBedrockByModel();
          break;
        default:
          res.writeHead(404);
          res.end(JSON.stringify({ error: "Not found" }));
          return;
      }
      res.writeHead(200);
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.name, message: err.message }));
    }
    return;
  }

  // Serve HTML
  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.setHeader("Content-Type", "text/html");
    res.writeHead(200);
    res.end(readFileSync(join(__dirname, "index.html"), "utf-8"));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`\n  AWS Billing Dashboard`);
  console.log(`  http://localhost:${PORT}\n`);
  console.log(`  Requires IAM credentials with ce:GetCostAndUsage permission.`);
  console.log(`  Run: aws configure (if not already set up)\n`);
});
