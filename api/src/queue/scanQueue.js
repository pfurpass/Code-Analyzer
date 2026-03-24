import { Queue, QueueEvents } from "bullmq";
import { redis } from "../db/redis.js";
import { logger } from "../utils/logger.js";

export let scanQueue;
let queueEvents;

export async function initQueue() {
  const connection = redis;

  scanQueue = new Queue("scan-jobs", {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 3600, count: 500 },
      removeOnFail: { age: 86400 * 7, count: 100 },
    },
  });

  queueEvents = new QueueEvents("scan-jobs", { connection });

  queueEvents.on("completed", ({ jobId }) => {
    logger.info("Scan job completed", { jobId });
  });

  queueEvents.on("failed", ({ jobId, failedReason }) => {
    logger.error("Scan job failed", { jobId, failedReason });
  });

  queueEvents.on("stalled", ({ jobId }) => {
    logger.warn("Scan job stalled", { jobId });
  });

  logger.info("BullMQ scan queue initialized");
}
