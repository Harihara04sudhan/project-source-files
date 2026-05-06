// Long-polling worker. Run alongside `npm run dev`:
//   npm run telegram:bot
//
// It calls Telegram's getUpdates in a loop and dispatches every update to the
// shared handler in src/lib/telegram-bot.ts. No ngrok / public URL required.

import "dotenv/config";
import { deleteWebhook, getMe, getUpdates, isTelegramConfigured } from "../src/lib/telegram";
import { handleUpdate } from "../src/lib/telegram-bot";
import { prisma } from "../src/lib/db";

async function main() {
  if (!isTelegramConfigured()) {
    console.error("TELEGRAM_BOT_TOKEN is not set in .env. Aborting.");
    process.exit(1);
  }

  // getMe is optional — if it fails (transient network), we still want to
  // start the polling loop because that loop has its own retry logic.
  try {
    const me = await getMe();
    console.log(`[telegram] connected as @${me.username} (id ${me.id})`);
  } catch (err) {
    console.warn(`[telegram] getMe failed (will continue): ${err instanceof Error ? err.message : err}`);
  }

  // If a webhook was registered earlier, getUpdates would error out.
  await deleteWebhook().catch(() => {});

  let offset = 0;
  console.log("[telegram] long-polling for updates… (Ctrl+C to stop)");

  // Graceful shutdown.
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    console.log("\n[telegram] stopping…");
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopping) {
    try {
      const updates = await getUpdates({ offset, timeout: 25 });
      for (const u of updates) {
        offset = Math.max(offset, u.update_id + 1);
        try {
          await handleUpdate(u);
        } catch (err) {
          console.error("[telegram] handler errored on update", u.update_id, err);
        }
      }
    } catch (err) {
      console.warn("[telegram] getUpdates errored, sleeping 3s:", err instanceof Error ? err.message : err);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
