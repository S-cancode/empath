import { prisma } from "../lib/prisma.js";

const BACKFILL_INTERVAL_MS = 60 * 60 * 1000; // hourly
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const FIRST_REPLY_WINDOW_MS = 10 * 60 * 1000;

let running = false;
let timer: NodeJS.Timeout | null = null;

/**
 * Fills in outcome fields on MatchQualityLog rows.
 * - Rows older than 24h and missing msgs_in_24h: compute first-reply + 24h activity.
 * - Rows older than 7d and missing alive_at_day_7: compute day-7 survival.
 */
export async function backfillMatchOutcomes(): Promise<number> {
  const now = Date.now();
  let updated = 0;

  const pending = await prisma.matchQualityLog.findMany({
    where: {
      conversationId: { not: null },
      OR: [
        { msgsIn24h: null, matchedAt: { lt: new Date(now - DAY_MS) } },
        { aliveAtDay7: null, matchedAt: { lt: new Date(now - WEEK_MS) } },
      ],
    },
    take: 500,
  });

  for (const log of pending) {
    if (!log.conversationId) continue;
    const matchedAtMs = log.matchedAt.getTime();
    const needs24h = log.msgsIn24h === null && now - matchedAtMs >= DAY_MS;
    const needs7d = log.aliveAtDay7 === null && now - matchedAtMs >= WEEK_MS;
    if (!needs24h && !needs7d) continue;

    const data: {
      msgsIn24h?: number;
      firstReplyWithin10Min?: boolean;
      aliveAtDay7?: boolean;
      outcomeComputedAt?: Date;
    } = {};

    if (needs24h) {
      const [msgs, otherSide] = await Promise.all([
        prisma.message.count({
          where: {
            conversationId: log.conversationId,
            sentAt: {
              gte: log.matchedAt,
              lt: new Date(matchedAtMs + DAY_MS),
            },
          },
        }),
        log.userAId && log.userBId
          ? prisma.message.findFirst({
              where: {
                conversationId: log.conversationId,
                senderId: { in: [log.userAId, log.userBId] },
                sentAt: {
                  gte: log.matchedAt,
                  lt: new Date(matchedAtMs + FIRST_REPLY_WINDOW_MS),
                },
              },
              orderBy: { sentAt: "asc" },
              select: { senderId: true },
            })
          : Promise.resolve(null),
      ]);
      data.msgsIn24h = msgs;
      // first reply means: both users sent at least one message within 10 min
      if (log.userAId && log.userBId) {
        const aReplied = await prisma.message.findFirst({
          where: {
            conversationId: log.conversationId,
            senderId: log.userAId,
            sentAt: { gte: log.matchedAt, lt: new Date(matchedAtMs + FIRST_REPLY_WINDOW_MS) },
          },
          select: { id: true },
        });
        const bReplied = await prisma.message.findFirst({
          where: {
            conversationId: log.conversationId,
            senderId: log.userBId,
            sentAt: { gte: log.matchedAt, lt: new Date(matchedAtMs + FIRST_REPLY_WINDOW_MS) },
          },
          select: { id: true },
        });
        data.firstReplyWithin10Min = Boolean(aReplied && bReplied);
      } else {
        data.firstReplyWithin10Min = Boolean(otherSide);
      }
    }

    if (needs7d) {
      const conv = await prisma.conversation.findUnique({
        where: { id: log.conversationId },
        select: { status: true, lastMessageAt: true },
      });
      if (conv) {
        const recent = conv.lastMessageAt
          ? now - conv.lastMessageAt.getTime() < WEEK_MS
          : false;
        data.aliveAtDay7 = conv.status === "active" && recent;
      } else {
        data.aliveAtDay7 = false;
      }
    }

    data.outcomeComputedAt = new Date();

    await prisma.matchQualityLog.update({
      where: { id: log.id },
      data,
    });
    updated++;
  }

  return updated;
}

export function startOutcomeWorker(): void {
  if (running) return;
  running = true;
  const tick = async () => {
    if (!running) return;
    try {
      const n = await backfillMatchOutcomes();
      if (n > 0) console.log(`[outcome] Backfilled ${n} match outcomes`);
    } catch (err) {
      console.error("[outcome] backfill error:", err);
    }
    if (running) timer = setTimeout(tick, BACKFILL_INTERVAL_MS);
  };
  timer = setTimeout(tick, 30 * 1000); // first pass 30s after boot
  console.log("Outcome worker started");
}

export function stopOutcomeWorker(): void {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  console.log("Outcome worker stopped");
}
