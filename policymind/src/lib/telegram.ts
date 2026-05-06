// Minimal Telegram Bot API client — only the methods we use.
// Docs: https://core.telegram.org/bots/api

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;

export type InlineKeyboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

export type InlineKeyboard = {
  inline_keyboard: InlineKeyboardButton[][];
};

export type TelegramUser = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
};

export type TelegramChat = {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
};

export type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  reply_to_message?: TelegramMessage;
};

export type CallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

export type Update = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: CallbackQuery;
};

export type SendMessageResult = {
  ok: boolean;
  result?: TelegramMessage;
  description?: string;
};

function ensureToken() {
  if (!API) throw new Error("TELEGRAM_BOT_TOKEN is not set");
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  ensureToken();
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; description?: string; result?: T };
  if (!json.ok) {
    throw new Error(`telegram ${method} failed: ${json.description ?? "unknown"}`);
  }
  return json.result as T;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

export async function sendMessage(opts: {
  chat_id: string | number;
  text: string;
  parse_mode?: "Markdown" | "MarkdownV2" | "HTML";
  reply_markup?: InlineKeyboard;
  disable_web_page_preview?: boolean;
}): Promise<TelegramMessage> {
  try {
    return await call<TelegramMessage>("sendMessage", {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...opts,
    });
  } catch (err) {
    // If HTML/Markdown parse breaks (LLM output edge case), don't go silent.
    // Strip the markup and send as plain text so the user always sees something.
    if (err instanceof Error && /can't parse entities/i.test(err.message)) {
      console.warn("[telegram] HTML parse failed, retrying as plain text");
      return call<TelegramMessage>("sendMessage", {
        ...opts,
        text: stripHtml(opts.text),
        parse_mode: undefined,
        disable_web_page_preview: true,
      });
    }
    throw err;
  }
}

export async function editMessageText(opts: {
  chat_id: string | number;
  message_id: number;
  text: string;
  parse_mode?: "Markdown" | "MarkdownV2" | "HTML";
  reply_markup?: InlineKeyboard;
  disable_web_page_preview?: boolean;
}): Promise<TelegramMessage | boolean> {
  try {
    return await call<TelegramMessage | boolean>("editMessageText", {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...opts,
    });
  } catch (err) {
    if (err instanceof Error && /can't parse entities/i.test(err.message)) {
      console.warn("[telegram] HTML parse failed on edit, retrying as plain text");
      return call<TelegramMessage | boolean>("editMessageText", {
        ...opts,
        text: stripHtml(opts.text),
        parse_mode: undefined,
        disable_web_page_preview: true,
      });
    }
    throw err;
  }
}

export async function answerCallbackQuery(opts: {
  callback_query_id: string;
  text?: string;
  show_alert?: boolean;
}): Promise<true> {
  return call<true>("answerCallbackQuery", opts);
}

export async function getUpdates(opts: { offset?: number; timeout?: number }): Promise<Update[]> {
  return call<Update[]>("getUpdates", { timeout: 25, ...opts });
}

export async function getMe(): Promise<TelegramUser> {
  return call<TelegramUser>("getMe", {});
}

export async function deleteWebhook(): Promise<unknown> {
  // Switching from webhook to long-polling requires deleting any old webhook.
  return call("deleteWebhook", {});
}

// Escape user-provided content for Telegram HTML parse_mode. We only need to
// neutralise the three characters Telegram treats as markup delimiters.
export function esc(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Backward-compat alias kept around so any older imports still resolve.
export const escapeMd = esc;

export function isTelegramConfigured(): boolean {
  return !!TOKEN;
}
