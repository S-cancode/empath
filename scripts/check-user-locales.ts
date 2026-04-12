/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      anonymousAlias: true,
      preferredLanguage: true,
      preferredDialect: true,
      autoTranslateEnabled: true,
      languageDetectedAt: true,
      lastActiveAt: true,
    },
    orderBy: { lastActiveAt: "desc" },
    take: 20,
  });

  console.log(`Found ${users.length} recent users:\n`);
  for (const u of users) {
    console.log(
      `${u.anonymousAlias.padEnd(25)} lang=${String(u.preferredLanguage).padEnd(6)} ` +
        `dialect=${String(u.preferredDialect).padEnd(8)} ` +
        `auto=${u.autoTranslateEnabled} ` +
        `detectedAt=${u.languageDetectedAt?.toISOString() ?? "null"}`,
    );
  }

  const withLang = await prisma.user.count({
    where: { preferredLanguage: { not: null } },
  });
  const autoOn = await prisma.user.count({
    where: { autoTranslateEnabled: true },
  });
  const total = await prisma.user.count({ where: { deletedAt: null } });
  console.log(`\nTotals: ${total} active users, ${autoOn} auto_translate_enabled, ${withLang} with preferredLanguage set`);

  // Also check recent text messages for source_language tagging
  const recentMsgs = await prisma.message.findMany({
    where: { messageType: "text", sentAt: { gt: new Date(Date.now() - 24 * 3600 * 1000) } },
    select: { id: true, senderId: true, sourceLanguage: true, sentAt: true },
    orderBy: { sentAt: "desc" },
    take: 20,
  });
  console.log(`\nRecent text messages (24h), ${recentMsgs.length}:`);
  for (const m of recentMsgs) {
    console.log(`  ${m.sentAt.toISOString()}  src=${m.sourceLanguage ?? "null"}  sender=${m.senderId.slice(0, 8)}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
