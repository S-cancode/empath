import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import helmet from "helmet";
import cors from "cors";
import { config } from "./config/index.js";
import { authRouter } from "./auth/auth.router.js";
import { matchingRouter } from "./matching/matching.router.js";
import { categoriesRouter } from "./categories/categories.router.js";
import { conversationRouter } from "./conversation/conversation.router.js";
import { journalingRouter } from "./journaling/journaling.router.js";
import { analyseRouter } from "./analyse/analyse.router.js";
import { pushTokenRouter } from "./notifications/push-token.router.js";
import { startPushListener } from "./notifications/push.service.js";
import { safetyRouter } from "./safety/safety.router.js";
import { setIoInstance } from "./safety/safety.service.js";
import { complianceRouter } from "./compliance/compliance.router.js";
import { adminRouter } from "./admin/admin.router.js";
import { startAutoArchiveWorker, stopAutoArchiveWorker } from "./conversation/conversation.worker.js";
import { setupChatGateway } from "./chat/chat.gateway.js";
import { startMessageBuffer, stopMessageBuffer } from "./chat/chat.service.js";
import { startMatchingWorker, stopMatchingWorker } from "./matching/matching.worker.js";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";
import { apiLimiter } from "./shared/rate-limiter.js";
import { AppError, UpgradeRequiredError } from "./shared/errors.js";
import type { Request, Response, NextFunction } from "express";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 3e6, // 3MB for voice notes
});

// Middleware
const helmetMiddleware = helmet();
app.use((req, res, next) => {
  if (req.originalUrl.startsWith("/admin")) return next();
  helmetMiddleware(req, res, next);
});
app.use(cors());
app.use(express.json());
app.use(apiLimiter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/auth", authRouter);
app.use("/match", matchingRouter);
app.use("/categories", categoriesRouter);
app.use("/conversations", conversationRouter);
app.use("/journal", journalingRouter);
app.use("/match/analyse", analyseRouter);
app.use("/notifications", pushTokenRouter);
app.use("/safety", safetyRouter);
app.use("/compliance", complianceRouter);
app.use("/admin", adminRouter);

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof UpgradeRequiredError) {
    res.status(403).json({
      error: "upgrade_required",
      requiredTier: err.requiredTier,
      message: err.message,
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Socket.IO
setupChatGateway(io);
setIoInstance(io);

// Start services
startMessageBuffer();
startMatchingWorker();
startAutoArchiveWorker();
startPushListener();

httpServer.listen(config.PORT, () => {
  console.log(`Sympathy server running on port ${config.PORT}`);
});

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log("Shutting down...");
  stopMatchingWorker();
  stopMessageBuffer();
  stopAutoArchiveWorker();
  httpServer.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { app, httpServer, io };
