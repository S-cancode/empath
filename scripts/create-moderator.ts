/**
 * Bootstrap / add an individual moderator account.
 *
 *   npx tsx scripts/create-moderator.ts <email> <password> [admin]
 *
 * Prints a TOTP setup URI — add it to an authenticator app (Google
 * Authenticator, 1Password, etc.). The secret is shown ONCE.
 */
import { createModerator } from "../src/admin/moderator.service.js";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const [email, password, roleArg] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: tsx scripts/create-moderator.ts <email> <password> [admin]");
    process.exit(1);
  }
  const role = roleArg === "admin" ? "admin" : "moderator";
  const { id, totpSecret, totpUri } = await createModerator(email, password, role);
  console.log(`\nModerator created: ${email} (${role}) id=${id}`);
  console.log(`TOTP secret (store securely, shown once): ${totpSecret}`);
  console.log(`TOTP setup URI: ${totpUri}\n`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
