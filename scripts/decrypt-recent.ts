/* eslint-disable no-console */
import { createDecipheriv } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const ENC_KEY = process.env.ENCRYPTION_KEY!;
const keyBytes = Buffer.from(ENC_KEY, "hex");

function decrypt(ciphertext: string, iv: string, authTag: string): string {
  const decipher = createDecipheriv("aes-256-gcm", keyBytes, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  const out = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);
  return out.toString("utf8");
}

async function main() {
  const prisma = new PrismaClient();
  const rows = await prisma.message.findMany({
    where: {
      messageType: "text",
      sentAt: { gt: new Date(Date.now() - 6 * 3600 * 1000) },
    },
    include: { sender: { select: { anonymousAlias: true } } },
    orderBy: { sentAt: "desc" },
    take: 20,
  });
  for (const r of rows) {
    let plaintext: string;
    try {
      plaintext = decrypt(r.content, r.iv, r.authTag);
    } catch (e) {
      plaintext = `[decrypt failed: ${(e as Error).message}]`;
    }
    console.log(`${r.sentAt.toISOString()} [${r.sender.anonymousAlias}] (src=${r.sourceLanguage}):`);
    console.log(`  ${plaintext}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
