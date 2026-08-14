import { prisma } from "../lib/prisma.js";
import { decrypt } from "../lib/crypto.js";
import { config } from "../config/index.js";
import { applyBan, applySuspension, liftSuspension } from "../safety/enforcement.service.js";
import { setRetentionHold, clearRetentionHold } from "../conversation/conversation.service.js";
import { NotFoundError, ValidationError } from "../shared/errors.js";
import { sniffAudioMime, type AudioMime } from "../safety/audio-mime.js";

// Escalations suspend the reported user for a fixed review window. If founders
// never act, the suspension lapses rather than holding the user in limbo.
const ESCALATION_REVIEW_DAYS = 7;

const COMPLAINTS_EMAIL = "empath21@outlook.com";

async function sendExpoPush(pushToken: string, title: string, body: string): Promise<void> {
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        to: pushToken,
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

/** Send moderation notification to a user via push notification */
async function notifyUser(userId: string, title: string, body: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pushToken: true },
  });
  if (!user?.pushToken) return;
  await sendExpoPush(user.pushToken, title, body);
}

/** Alert the founders' devices (FOUNDER_PUSH_TOKENS, comma-separated). No-op if unset. */
async function notifyFounders(title: string, body: string): Promise<void> {
  const tokens = (config.FOUNDER_PUSH_TOKENS ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  await Promise.all(tokens.map((token) => sendExpoPush(token, title, body)));
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
      conversation: { select: { id: true, category: true, subTag: true, status: true, retentionHold: true } },
      moderationActions: { orderBy: { createdAt: "desc" as const } },
    },
  });

  if (!report) throw new NotFoundError("Report not found");

  // Determine message source: prefer conversation log from report record
  let messages: Array<Record<string, unknown>> = [];
  let messagesSource: "report_log" | "live" | "unavailable" = "unavailable";
  let messagesNote: string | undefined;

  interface StoredLogMessage {
    id?: string;
    senderId: string;
    senderAlias: string;
    content?: string; // legacy plaintext
    ciphertext?: string;
    iv?: string;
    authTag?: string;
    messageType: string;
    sentAt: string;
  }
  const log = report.conversationLog as { messages?: StoredLogMessage[]; totalMessageCount?: number } | null;
  if (log?.messages && log.messages.length > 0) {
    messages = log.messages.map((m) => {
      let content: string;
      if (m.ciphertext && m.iv && m.authTag) {
        try {
          content = decrypt({ ciphertext: m.ciphertext, iv: m.iv, authTag: m.authTag });
        } catch {
          content = "[unable to decrypt]";
        }
      } else {
        // Backward-compat: older reports stored plaintext content
        content = m.content ?? "[missing]";
      }
      // Voice snapshots store the placeholder "[voice note]" as their
      // plaintext, so `content` here is never audio.
      return {
        id: m.id,
        senderId: m.senderId,
        senderAlias: m.senderAlias,
        content: m.messageType === "voice" ? "[voice note]" : content,
        messageType: m.messageType,
        sentAt: m.sentAt,
      };
    });
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
        // Never decrypt voice content into JSON — that would put base64 audio
        // in the report payload. Audio leaves only via the dedicated audited
        // playback endpoint. Voice shows a placeholder here.
        let content: string;
        if (msg.messageType === "voice") {
          content = "[voice note]";
        } else {
          try {
            content = decrypt({ ciphertext: msg.content, iv: msg.iv, authTag: msg.authTag });
          } catch {
            content = "[unable to decrypt]";
          }
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

  // Update report status. Escalations stay open in their own state until a
  // founder resolves them; every other action closes the report.
  if (input.action === "escalate") {
    await prisma.report.update({
      where: { id: reportId },
      data: {
        status: "escalated",
        reviewedAt: report.reviewedAt ?? new Date(),
      },
    });
  } else {
    await prisma.report.update({
      where: { id: reportId },
      data: {
        status: "resolved",
        reviewedAt: report.reviewedAt ?? new Date(),
        resolvedAt: new Date(),
      },
    });
  }

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
      const liftDate = suspendUntil.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      await notifyUser(
        report.reportedId,
        "Account Suspended",
        `Your account has been temporarily suspended for ${input.duration} day(s) due to ${reasonDesc}. Your suspension will be lifted on ${liftDate}. If you believe this is incorrect, contact ${COMPLAINTS_EMAIL}.`
      );
      await applySuspension(report.reportedId, suspendUntil);
      break;
    }
    case "ban": {
      await notifyUser(
        report.reportedId,
        "Account Permanently Removed",
        `Your account has been permanently removed due to serious violations of our Community Guidelines. If you believe this is incorrect, contact ${COMPLAINTS_EMAIL}.`
      );
      await applyBan(report.reportedId);
      break;
    }
    case "escalate": {
      // Preserve the evidence with a BOUNDED safeguarding hold (SAFEGUARDING_HOLD_DAYS).
      // It auto-expires and can be cleared early via the audited resolve path.
      await setRetentionHold(report.conversationId);

      const suspendUntil = new Date();
      suspendUntil.setDate(suspendUntil.getDate() + ESCALATION_REVIEW_DAYS);
      await notifyUser(
        report.reportedId,
        "Account Suspended Pending Review",
        `Your account has been temporarily suspended while we review recent activity. If you believe this is incorrect, contact ${COMPLAINTS_EMAIL}.`
      );
      await applySuspension(report.reportedId, suspendUntil);

      await notifyFounders(
        "Report Escalated",
        `Report ${reportId} (${report.reason}) needs founder review. The reported user is suspended for ${ESCALATION_REVIEW_DAYS} days pending review.`
      );
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

/**
 * Founder review of an escalated report. Records the outcome, optionally lifts
 * the interim suspension, and optionally clears the bounded safeguarding
 * retention hold early (an audited action — the retention hold otherwise
 * auto-expires after SAFEGUARDING_HOLD_DAYS).
 */
export async function resolveEscalation(
  reportId: string,
  moderatorId: string,
  outcome: string,
  shouldLiftSuspension: boolean,
  shouldClearRetentionHold = false,
) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw new NotFoundError("Report not found");
  if (report.status !== "escalated") {
    throw new ValidationError("Report is not escalated");
  }

  const moderationAction = await prisma.moderationAction.create({
    data: {
      reportId,
      moderatorId,
      action: "escalation_resolved",
      reason: outcome,
    },
  });

  const now = new Date();
  await prisma.report.update({
    where: { id: reportId },
    data: {
      status: "resolved",
      resolvedAt: now,
      escalationOutcome: outcome,
      escalationResolvedAt: now,
    },
  });

  if (shouldLiftSuspension) {
    await liftSuspension(report.reportedId);
    await notifyUser(
      report.reportedId,
      "Suspension Lifted",
      "Following review, the temporary suspension on your account has been lifted. Thank you for your patience.",
    );
  }

  if (shouldClearRetentionHold && report.conversationId) {
    await clearRetentionHold(report.conversationId);
  }

  return moderationAction;
}

/**
 * Decrypt the EXACT reported voice note for moderator playback. Playback is
 * authorized only when messageId === report.reportedMessageId, the message is
 * a voice note, and it belongs to the report's conversation. A conversation-
 * or user-level report with no exact reportedMessageId authorizes no audio.
 * Unauthorized attempts throw NotFound (never revealing whether other audio
 * exists). Returns raw base64 audio; the caller sets no-store and audits.
 * Never logs audio content.
 */
export async function getReportedVoiceAudio(
  reportId: string,
  messageId: string,
): Promise<{ base64Audio: string; mimeType: AudioMime }> {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: { conversationId: true, reportedMessageId: true },
  });
  // Uniform NotFound for missing report or any authorization miss below —
  // never leak whether unrelated audio exists.
  if (!report || !report.reportedMessageId || report.reportedMessageId !== messageId) {
    throw new NotFoundError("Reported voice note not found");
  }

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true, messageType: true, content: true, iv: true, authTag: true },
  });
  if (
    !message ||
    message.messageType !== "voice" ||
    message.conversationId !== report.conversationId
  ) {
    throw new NotFoundError("Reported voice note not found");
  }

  const base64Audio = decrypt({ ciphertext: message.content, iv: message.iv, authTag: message.authTag });
  // Determine the real container from the decrypted bytes (never a client
  // value). Unsupported/malformed audio fails safe rather than being served
  // under a guessed type.
  const mimeType = sniffAudioMime(base64Audio);
  if (!mimeType) {
    throw new ValidationError("Unsupported audio format");
  }
  return { base64Audio, mimeType };
}

export async function getDashboardStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [pendingCount, escalatedCount, resolvedToday, totalReports] = await Promise.all([
    prisma.report.count({ where: { status: "pending" } }),
    prisma.report.count({ where: { status: "escalated" } }),
    prisma.report.count({ where: { resolvedAt: { gte: today } } }),
    prisma.report.count(),
  ]);

  return { pendingCount, escalatedCount, resolvedToday, totalReports };
}
