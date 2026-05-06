// Quick send helper for sanity-checking the bot.
//   npx tsx scripts/telegram-send.ts <chatId> "your message"
import "dotenv/config";
import { sendMessage, isTelegramConfigured } from "../src/lib/telegram";

async function main() {
  if (!isTelegramConfigured()) {
    console.error("TELEGRAM_BOT_TOKEN missing");
    process.exit(1);
  }
  const [chatId, ...rest] = process.argv.slice(2);
  if (!chatId || !rest.length) {
    console.error("usage: tsx scripts/telegram-send.ts <chatId> <text>");
    process.exit(1);
  }
  const result = await sendMessage({ chat_id: chatId, text: rest.join(" ") });
  console.log("sent message_id", result.message_id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
