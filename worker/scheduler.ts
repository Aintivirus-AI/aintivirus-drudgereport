/**
 * Scheduler worker process.
 *
 * Dynamic scheduling:
 * - Adjusts interval based on queue depth:
 *     > 10 items →  5 min (sprint mode)
 *     > 0  items → 10 min (active)
 *     0 items    → 20 min (idle)
 * - Revenue processing runs on a fixed 5-minute cron (independent)
 *
 * Other features:
 * - Graceful shutdown waits for in-progress work
 * - Uncaught exception / unhandled rejection handlers
 * - Dynamic imports so dotenv loads before app modules
 */

import { config } from "dotenv";
import path from "path";
import cron, { ScheduledTask } from "node-cron";

// Load environment variables BEFORE any app modules
const envPaths = [
  path.join(process.cwd(), ".env.local"),
  path.join(__dirname, "..", ".env.local"),
  ".env.local",
];

let envLoaded = false;
for (const envPath of envPaths) {
  const result = config({ path: envPath });
  if (!result.error) {
    envLoaded = true;
    console.log(`✅ Loaded environment from: ${envPath}`);
    break;
  }
}

if (!envLoaded) {
  console.warn("⚠️  Could not load .env.local, trying default .env");
  config();
}

// Track concurrent execution
let isRunning = false;
let isProcessingRevenue = false;
let cycleCount = 0;
let isShuttingDown = false;

// Store timers/tasks for cleanup
let schedulerTimer: ReturnType<typeof setTimeout> | null = null;
const cronTasks: ScheduledTask[] = [];

// Dynamically imported module references (loaded in main after env is ready)
let runSchedulerCycle: typeof import("../lib/scheduler")["runSchedulerCycle"];
let getSchedulerStatus: typeof import("../lib/scheduler")["getSchedulerStatus"];
let getNextIntervalMs: typeof import("../lib/scheduler")["getNextIntervalMs"];
let processPendingRevenue: typeof import("../lib/revenue-distributor")["processPendingRevenue"];

/**
 * Run a scheduler cycle, then schedule the next one based on queue depth.
 */
async function safeRunCycle(): Promise<void> {
  if (isRunning || isShuttingDown) {
    console.log("[Worker] Scheduler cycle already running or shutting down, skipping...");
    scheduleNextCycle(); // Still need to schedule the next one
    return;
  }

  isRunning = true;
  cycleCount++;

  console.log(`\n${"=".repeat(50)}`);
  console.log(
    `[Worker] Starting cycle #${cycleCount} at ${new Date().toISOString()}`
  );
  console.log(`${"=".repeat(50)}\n`);

  try {
    const result = await runSchedulerCycle();

    if (result.published.length > 0) {
      console.log(
        `[Worker] Published ${result.published.length} submission(s): ` +
        result.published.map(s => `#${s.id}`).join(", ")
      );
    }
  } catch (error) {
    console.error("[Worker] Error during scheduler cycle:", error);
  } finally {
    isRunning = false;
  }

  // Schedule the next cycle (interval adapts to queue depth)
  scheduleNextCycle();
}

/**
 * Schedule the next scheduler cycle based on current queue depth.
 */
function scheduleNextCycle(): void {
  if (isShuttingDown) return;

  // Clear any existing timer
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }

  const intervalMs = getNextIntervalMs();
  const intervalMin = Math.round(intervalMs / 60_000);
  const status = getSchedulerStatus();

  console.log(
    `[Worker] Next cycle in ${intervalMin} min ` +
    `(queue: ${status.queueDepth} = ${status.pendingCount} pending + ` +
    `${status.approvedCount} approved + ${status.validatingCount} validating)`
  );

  schedulerTimer = setTimeout(() => safeRunCycle(), intervalMs);
}

/**
 * Process pending revenue events with safety checks.
 */
async function safeProcessRevenue(): Promise<void> {
  if (isProcessingRevenue || isShuttingDown) {
    console.log("[Worker] Revenue processing already running or shutting down, skipping...");
    return;
  }

  isProcessingRevenue = true;
  try {
    const result = await processPendingRevenue();
    if (result.processed > 0 || result.failed > 0) {
      console.log(
        `[Worker] Revenue: ${result.processed} processed, ${result.failed} failed`
      );
    }
  } catch (error) {
    console.error("[Worker] Revenue processing error:", error);
  } finally {
    isProcessingRevenue = false;
  }
}

// Main function
async function main(): Promise<void> {
  // Dynamic imports: app modules are loaded HERE, after dotenv has run.
  const scheduler = await import("../lib/scheduler");
  const revenue = await import("../lib/revenue-distributor");

  runSchedulerCycle = scheduler.runSchedulerCycle;
  getSchedulerStatus = scheduler.getSchedulerStatus;
  getNextIntervalMs = scheduler.getNextIntervalMs;
  processPendingRevenue = revenue.processPendingRevenue;

  console.log("🚀 Starting News Token Scheduler Worker");
  console.log(`📊 Initial status: ${JSON.stringify(getSchedulerStatus())}`);

  // Run immediately on startup, which will also schedule the next cycle
  await safeRunCycle();

  // Revenue processing stays on a fixed 5-minute cron (independent of publishing)
  const revenueTask = cron.schedule("*/5 * * * *", async () => {
    await safeProcessRevenue();
  });
  cronTasks.push(revenueTask);

  console.log("⏰ Scheduler started:");
  console.log("   - Publishing:  dynamic interval (5/10/20 min based on queue depth)");
  console.log("   - Revenue:     every 5 minutes");
  console.log("   Press Ctrl+C to stop\n");

  // Graceful shutdown — waits for in-progress work to complete
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n👋 Received ${signal}, shutting down scheduler...`);

    // Stop cron jobs and timers from scheduling new work
    for (const task of cronTasks) {
      task.stop();
    }
    if (schedulerTimer) {
      clearTimeout(schedulerTimer);
      schedulerTimer = null;
    }

    // Wait for in-progress work (max 30 seconds)
    const maxWaitMs = 30_000;
    const startWait = Date.now();
    while ((isRunning || isProcessingRevenue) && Date.now() - startWait < maxWaitMs) {
      console.log("[Worker] Waiting for in-progress work to complete...");
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (isRunning || isProcessingRevenue) {
      console.warn("[Worker] Timed out waiting for in-progress work — exiting anyway");
    }

    console.log("[Worker] Shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Catch unhandled errors to prevent silent crashes
  process.on("uncaughtException", (error) => {
    console.error("[Worker] Uncaught exception:", error);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[Worker] Unhandled rejection:", reason);
  });
}

// Start the worker
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
