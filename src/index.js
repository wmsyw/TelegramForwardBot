/**
 * kokosa-forward - Telegram Message Forwarding Bot
 * Copyright (c) 2025, 秦心桜
 * Licensed under BSD 2-Clause License
 */

import { WEBHOOK_PATH } from "./config.js";
import { createTelegramClient } from "./telegram.js";
import { handleAdminMessage, handleCallbackQuery } from "./handlers/admin.js";
import { handleGuestMessage } from "./handlers/guest.js";

/**
 * Bot menu commands for admin
 */
const ADMIN_COMMANDS = [
  { command: "start", description: "Start the bot" },
  { command: "list", description: "View blocked users" },
  { command: "stats", description: "View statistics" },
  { command: "block", description: "Block user (reply to message)" },
  { command: "unblock", description: "Unblock user (reply to message)" },
  { command: "trust", description: "Whitelist user (reply to message)" },
  { command: "trustid", description: "Whitelist user by ID" },
  { command: "status", description: "Check user status (reply to message)" },
  { command: "check", description: "AI content check (reply to message)" },
  { command: "checktext", description: "AI check any text" },
  { command: "lang", description: "Change language" },
];

/**
 * Bot menu commands for guests
 */
const GUEST_COMMANDS = [
  { command: "start", description: "Start the bot" },
  { command: "appeal", description: "Appeal if blocked" },
  { command: "lang", description: "Change language" },
];

/**
 * Update handler registry
 */
const updateHandlers = {
  message: handleMessageUpdate,
  callback_query: handleCallbackUpdate,
  edited_message: handleEditedMessage,
};

/**
 * Handle message updates
 */
async function handleMessageUpdate(update, telegram, kv, env) {
  const message = update.message;
  const chatId = message.chat.id.toString();
  const { ENV_ADMIN_UID } = env;

  console.log(`[Message] From ${chatId}: ${message.text || "[Media]"}`);

  if (chatId === ENV_ADMIN_UID) {
    return await handleAdminMessage(message, telegram, kv, env);
  } else {
    return await handleGuestMessage(message, telegram, kv, env);
  }
}

/**
 * Handle callback query updates (inline button clicks)
 */
async function handleCallbackUpdate(update, telegram, kv, env) {
  const query = update.callback_query;
  console.log(`[Callback] Action: ${query.data}`);

  return await handleCallbackQuery(query, telegram, kv, env);
}

/**
 * Handle edited message updates
 *
 * This handler is triggered when a user edits a previously sent message.
 * Currently only logs the event. Potential uses:
 * - Re-check edited content for spam/unsafe material
 * - Forward edited content to admin with "[EDITED]" tag
 * - Update relay record preview
 */
async function handleEditedMessage(update, telegram, kv, env) {
  const message = update.edited_message;
  console.log(`[Edit] Message ${message.message_id} was edited`);
  // TODO: Implement edited message handling if needed
}

/**
 * Process incoming Telegram update
 */
async function processUpdate(update, telegram, kv, env) {
  for (const [type, handler] of Object.entries(updateHandlers)) {
    if (type in update) {
      await handler(update, telegram, kv, env);
      return;
    }
  }
}

/**
 * Handle webhook requests
 */
async function handleWebhook(request, env, ctx) {
  const { ENV_BOT_SECRET, ENV_BOT_TOKEN } = env;

  if (
    request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== ENV_BOT_SECRET
  ) {
    console.log("[Auth] Unauthorized webhook attempt");
    return new Response("Unauthorized", { status: 403 });
  }

  const update = await request.json();
  const telegram = createTelegramClient(ENV_BOT_TOKEN);

  ctx.waitUntil(processUpdate(update, telegram, env.kfb, env));

  return new Response("Ok");
}

/**
 * Register webhook with Telegram
 */
async function registerWebhook(request, env) {
  const url = new URL(request.url);
  const webhookUrl = `${url.protocol}//${url.hostname}${WEBHOOK_PATH}`;

  const telegram = createTelegramClient(env.ENV_BOT_TOKEN);
  const result = await telegram.setWebhook({
    url: webhookUrl,
    secret_token: env.ENV_BOT_SECRET,
    allowed_updates: ["message", "callback_query", "edited_message"],
  });

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Unregister webhook
 */
async function unregisterWebhook(env) {
  const telegram = createTelegramClient(env.ENV_BOT_TOKEN);
  const result = await telegram.setWebhook({ url: "" });

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Register bot menu commands for admin and default users
 */
async function registerCommands(env) {
  const telegram = createTelegramClient(env.ENV_BOT_TOKEN);
  const results = {};

  // Set admin-specific commands
  results.admin = await telegram.setMyCommands({
    commands: ADMIN_COMMANDS,
    scope: { type: "chat", chat_id: parseInt(env.ENV_ADMIN_UID) },
  });

  // Set default commands for all other users
  results.default = await telegram.setMyCommands({
    commands: GUEST_COMMANDS,
    scope: { type: "default" },
  });

  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Main request handler
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    switch (url.pathname) {
      case WEBHOOK_PATH:
        return handleWebhook(request, env, ctx);
      case "/registerWebhook":
        return registerWebhook(request, env);
      case "/unRegisterWebhook":
        return unregisterWebhook(env);
      case "/registerCommands":
        return registerCommands(env);
      default:
        return new Response("Not Found", { status: 404 });
    }
  },
};
