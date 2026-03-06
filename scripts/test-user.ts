/**
 * Simulates a second user: creates account, joins queue, and optionally
 * sends messages in a conversation.
 *
 * Usage:
 *   npx tsx scripts/test-user.ts                    # Create user + join grief queue
 *   npx tsx scripts/test-user.ts --category work-career
 *   npx tsx scripts/test-user.ts --chat <conversationId> "Hello from bot!"
 */

const API = "http://localhost:3000";

async function api(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  token?: string
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    console.error(`${method} ${path} → ${res.status}`, data);
    process.exit(1);
  }
  return data;
}

async function main() {
  const args = process.argv.slice(2);
  const categoryIdx = args.indexOf("--category");
  const category = categoryIdx !== -1 ? args[categoryIdx + 1] : "grief";
  const chatIdx = args.indexOf("--chat");

  // 1. Create anonymous user
  const deviceId = `test-bot-${Date.now()}`;
  const auth = await api("POST", "/auth/anonymous", { deviceId });
  console.log(`\nCreated user: ${auth.user.alias} (${auth.user.id})`);
  console.log(`Tier: free`);

  const token = auth.accessToken;

  // 2. If --chat mode, send messages to an existing conversation
  if (chatIdx !== -1) {
    const conversationId = args[chatIdx + 1];
    const messages = args.slice(chatIdx + 2);
    if (!conversationId) {
      console.error("Usage: --chat <conversationId> [messages...]");
      process.exit(1);
    }

    for (const msg of messages.length > 0 ? messages : ["Hey, how are you doing?", "I'm here to listen."]) {
      const result = await api("POST", `/conversations/${conversationId}/messages`, { content: msg }, token);
      console.log(`Sent: "${msg}" (${result.id})`);
      await new Promise((r) => setTimeout(r, 1000));
    }
    console.log("\nDone sending messages.");
    return;
  }

  // 3. Join matching queue
  console.log(`\nJoining queue: ${category}...`);
  const joinResult = await api("POST", "/match/join", { category }, token);
  console.log(`Queue status: ${joinResult.status}`);
  console.log(`Match status: ${joinResult.matchStatus.used}/${joinResult.matchStatus.limit} used today`);

  // 4. Poll for match
  console.log("\nWaiting for match (poll every 2s)...");
  console.log("Open the app on your phone and join the same category!\n");

  let matched = false;
  for (let i = 0; i < 60; i++) {
    const conversations = await api("GET", "/conversations", undefined, token);
    if (conversations.length > 0) {
      const conv = conversations[0];
      console.log(`MATCHED with ${conv.partner.anonymousAlias}!`);
      console.log(`Conversation ID: ${conv.id}`);
      console.log(`Category: ${conv.category}`);

      // Send a greeting
      await new Promise((r) => setTimeout(r, 1000));
      await api("POST", `/conversations/${conv.id}/messages`, {
        content: "Hey! I'm going through something similar. How are you holding up?",
      }, token);
      console.log(`\nSent greeting message.`);

      await new Promise((r) => setTimeout(r, 2000));
      await api("POST", `/conversations/${conv.id}/messages`, {
        content: "Feel free to share whenever you're ready. No pressure at all.",
      }, token);
      console.log(`Sent follow-up message.`);

      console.log(`\nBot user is now idle. To send more messages:`);
      console.log(`  npx tsx scripts/test-user.ts --chat ${conv.id} "Your message here"`);

      matched = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
    process.stdout.write(".");
  }

  if (!matched) {
    console.log("\nNo match after 2 minutes. Make sure to join the same category on your phone.");
    // Leave queue
    await api("DELETE", `/match/leave?category=${category}`, undefined, token);
    console.log("Left queue.");
  }
}

main().catch(console.error);
