import { prisma } from "../lib/prisma.js";
import { decrypt } from "../lib/crypto.js";
import { NotFoundError, ValidationError } from "../shared/errors.js";

const COMPLAINTS_EMAIL = "empath21@outlook.com";

/** Send moderation notification to a user via push notification */
async function notifyUser(userId: string, title: string, body: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pushToken: true },
  });
  if (!user?.pushToken) return;
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        to: user.pushToken,
        title,
        body,
        data: { screen: "home", type: "moderation" },
        sound: "default",
      }),
    });
  } catch (err) {
    console.error("[moderation] Failed to send notification:", err);
  }
}

const VALID_ACTIONS = ["dismiss", "warn", "suspend", "ban", "escalate"] as const;
type ModerationActionType = (typeof VALID_ACTIONS)[number];

interface TakeActionInput {
  action: ModerationActionType;
  severity?: string;
  reason?: string;
  duration?: number;
}

export async function getReports(
  status: string | undefined,
  page: number,
  limit: number,
) {
  const where = status ? { status } : {};
  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      include: {
        reporter: { select: { id: true, anonymousAlias: true } },
        reported: { select: { id: true, anonymousAlias: true } },
        moderationActions: { orderBy: { createdAt: "desc" as const } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.report.count({ where }),
  ]);

  return { reports, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getReportDetail(reportId: string) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      reporter: { select: { id: true, anonymousAlias: true } },
      reported: { select: { id: true, anonymousAlias: true, banned: true, suspendedUntil: true } },
      conversation: { select: { id: true, category: true, subTag: true, status: true } },
      moderationActions: { orderBy: { createdAt: "desc" as const } },
    },
  });

  if (!report) throw new NotFoundError("Report not found");

  // Determine message source: prefer conversation log from report record
  let messages: Array<Record<string, unknown>> = [];
  let messagesSource: "report_log" | "live" | "unavailable" = "unavailable";
  let messagesNote: string | undefined;

  const log = report.conversationLog as { messages?: Array<Record<string, unknown>>; totalMessageCount?: number } | null;
  if (log?.messages && log.messages.length > 0) {
    messages = log.messages;
    messagesSource = "report_log";
  } else {
    // Fallback: try live messages from database
    const liveMessages = await prisma.message.findMany({
      where: { conversationId: report.conversationId },
      orderBy: { sentAt: "asc" },
      take: 50,
      include: { sender: { select: { id: true, anonymousAlias: true } } },
    });

    if (liveMessages.length > 0) {
      messages = liveMessages.map((msg) => {
        let content: string;
        try {
          content = decrypt({ ciphertext: msg.content, iv: msg.iv, authTag: msg.authTag });
        } catch {
          content = "[unable to decrypt]";
        }
        return {
          id: msg.id,
          senderId: msg.senderId,
          senderAlias: msg.sender.anonymousAlias,
          content,
          messageType: msg.messageType,
          sentAt: msg.sentAt,
        };
      });
      messagesSource = "live";
    } else {
      messagesNote = "Messages from this session have been deleted (session older than 7 days). Review based on reporter description and available evidence.";
    }
  }

  // Report history for both users
  const [reportedUserHistory, reporterHistory] = await Promise.all([
    prisma.report.count({ where: { reportedId: report.reportedId } }),
    prisma.report.count({ where: { reporterId: report.reporterId } }),
  ]);

  return {
    report,
    messages,
    messagesSource,
    messagesNote,
    reportedUserReportCount: reportedUserHistory,
    reporterReportCount: reporterHistory,
  };
}

export async function takeAction(
  reportId: string,
  moderatorId: string,
  input: TakeActionInput,
) {
  if (!VALID_ACTIONS.includes(input.action)) {
    throw new ValidationError(`Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}`);
  }

  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw new NotFoundError("Report not found");

  if (input.action === "suspend" && (!input.duration || input.duration < 1)) {
    throw new ValidationError("Suspension requires a duration in days (minimum 1)");
  }

  // Create moderation action
  const moderationAction = await prisma.moderationAction.create({
    data: {
      reportId,
      moderatorId,
      action: input.action,
      severity: input.severity,
      reason: input.reason,
      duration: input.duration,
    },
  });

  // Update report status
  await prisma.report.update({
    where: { id: reportId },
    data: {
      status: "resolved",
      reviewedAt: report.reviewedAt ?? new Date(),
      resolvedAt: new Date(),
    },
  });

  // Apply action to reported user and send notifications
  const reasonDesc = input.reason || "a violation of our Community Guidelines";

  switch (input.action) {
    case "warn": {
      await notifyUser(
        report.reportedId,
        "Community Guidelines Reminder",
        `Your recent activity was flagged for ${reasonDesc}. Please review our Community Guidelines. If you believe this is incorrect, contact ${COMPLAINTS_EMAIL}.`
      );
      break;
    }
    case "suspend": {
      const suspendUntil = new Date();
      suspendUntil.setDate(suspendUntil.getDate() + input.duration!);
      await prisma.user.update({
        where: { id: report.reportedId },
        data: { suspendedUntil: suspendUntil },
      });
      const liftDate = suspendUntil.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      await notifyUser(
        report.reportedId,
        "Account Suspended",
        `Your account has been temporarily suspended for ${input.duration} day(s) due to ${reasonDesc}. Your suspension will be lifted on ${liftDate}. If you believe this is incorrect, contact ${COMPLAINTS_EMAIL}.`
      );
      break;
    }
    case "ban": {
      await notifyUser(
        report.reportedId,
        "Account Permanently Removed",
        `Your account has been permanently removed due to serious violations of our Community Guidelines. If you believe this is incorrect, contact ${COMPLAINTS_EMAIL}.`
      );
      await prisma.user.update({
        where: { id: report.reportedId },
        data: { banned: true },
      });
      // Block all active conversations
      await prisma.conversation.updateMany({
        where: {
          status: { in: ["active", "archived"] },
          OR: [
            { userAId: report.reportedId },
            { userBId: report.reportedId },
          ],
        },
        data: { status: "blocked" },
      });
      break;
    }
  }

  // Notify reporter that their report has been reviewed (generic, no specifics)
  await notifyUser(
    report.reporterId,
    "Report Reviewed",
    "We have reviewed your report and taken appropriate action. Thank you for helping keep Empath safe."
  );

  return moderationAction;
}

export async function getDashboardStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [pendingCount, resolvedToday, totalReports] = await Promise.all([
    prisma.report.count({ where: { status: "pending" } }),
    prisma.report.count({ where: { resolvedAt: { gte: today } } }),
    prisma.report.count(),
  ]);

  return { pendingCount, resolvedToday, totalReports };
}
