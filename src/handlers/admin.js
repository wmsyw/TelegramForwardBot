/**
 * kokosa-forward - Telegram Message Forwarding Bot
 * Copyright (c) 2025, 秦心桜
 * Licensed under BSD 2-Clause License
 */

import { checkContentSafety, getApiUsageStats, parseApiKeys } from "../ai.js";
import {
  getRelay,
  getRelayByAdminMsg,
  updateRelayStatus,
  setGuestBlocked,
  isGuestBlocked,
  getBlockedList,
  getStatistics,
  setUserTrusted,
  isUserTrusted,
  getUserLanguage,
  setUserLanguage,
} from "../storage.js";
import { t, buildLanguageKeyboard, getDefaultLanguage } from "../i18n.js";

/**
 * Get user's language with fallback to default
 */
async function getLang(kv, userId) {
  return (await getUserLanguage(kv, userId)) || getDefaultLanguage();
}

/**
 * Handle callback query from inline buttons
 * @param {Object} query - Callback query object
 * @param {Object} telegram - Telegram client
 * @param {KVNamespace} kv - KV storage
 * @param {Object} env - Environment variables
 */
export async function handleCallbackQuery(query, telegram, kv, env) {
  const { ENV_ADMIN_UID } = env;
  const data = query.data;
  const parts = data.split(":");
  const action = parts[0];
  const callerId = query.from.id.toString();

  await telegram.answerCallbackQuery({ callback_query_id: query.id });

  // Language selection
  if (action === "lang") {
    const lang = parts[1];
    const userId = parts[2];

    // Only allow user to change their own language
    if (callerId !== userId) {
      return;
    }

    await setUserLanguage(kv, userId, lang);
    return telegram.sendMessage({
      chat_id: userId,
      text: t("lang_changed", {}, lang),
    });
  }

  // Get caller's language
  const lang = await getLang(kv, callerId);

  // Appeal actions
  if (action === "appeal") {
    const decision = parts[1];
    const guestId = parts[2];
    const guestLang = await getLang(kv, guestId);

    if (decision === "accept") {
      await setGuestBlocked(kv, guestId, false);

      // Notify admin
      await telegram.sendMessage({
        chat_id: ENV_ADMIN_UID,
        text: t("appeal_accepted", { guestId }, lang),
      });

      // Notify user
      return telegram.sendMessage({
        chat_id: guestId,
        text: t("guest_appeal_accepted", {}, guestLang),
      });
    }

    if (decision === "reject") {
      // Notify admin
      await telegram.sendMessage({
        chat_id: ENV_ADMIN_UID,
        text: t("appeal_rejected", { guestId }, lang),
      });

      // Notify user
      return telegram.sendMessage({
        chat_id: guestId,
        text: t("guest_appeal_rejected", {}, guestLang),
      });
    }
  }

  // Unban action from list
  if (action === "unban") {
    const guestId = parts[1];
    await setGuestBlocked(kv, guestId, false);

    return telegram.sendMessage({
      chat_id: ENV_ADMIN_UID,
      text: t("unbanned", { guestId }, lang),
    });
  }
}

/**
 * Handle admin text messages
 * @param {Object} message - Telegram message object
 * @param {Object} telegram - Telegram client
 * @param {KVNamespace} kv - KV storage
 * @param {Object} env - Environment variables
 */
export async function handleAdminMessage(message, telegram, kv, env) {
  const { ENV_ADMIN_UID } = env;
  const text = message.text || "";
  const userId = message.from.id.toString();
  const lang = await getLang(kv, userId);

  // Command: /start
  if (text === "/start") {
    return telegram.sendMessage({
      chat_id: ENV_ADMIN_UID,
      text: t("admin_online", {}, lang),
    });
  }

  // Command: /lang
  if (text === "/lang") {
    return telegram.sendMessage({
      chat_id: ENV_ADMIN_UID,
      text: t("lang_select_prompt", {}, lang),
      reply_markup: buildLanguageKeyboard(userId),
    });
  }

  // Command: /list
  if (text === "/list") {
    const blocked = await getBlockedList(kv);

    if (blocked.length === 0) {
      return telegram.sendMessage({
        chat_id: ENV_ADMIN_UID,
        text: t("no_blocked_users", {}, lang),
      });
    }

    let output = t("blocked_users_title", { count: blocked.length }, lang);
    const buttons = [];

    blocked.forEach((b, i) => {
      const date = new Date(b.blockedAt).toLocaleString();
      output += t(
        "blocked_user_item",
        {
          index: i + 1,
          guestId: b.guestId,
          reason: b.reason,
          date,
        },
        lang,
      );
      buttons.push([
        {
          text: t("unban_button", { guestId: b.guestId }, lang),
          callback_data: `unban:${b.guestId}`,
        },
      ]);
    });

    return telegram.sendMessage({
      chat_id: ENV_ADMIN_UID,
      text: output,
      reply_markup: { inline_keyboard: buttons },
    });
  }

  // Command: /stats
  if (text === "/stats") {
    const stats = await getStatistics(kv);
    const apiStats = getApiUsageStats();

    let output = t("stats_title", {}, lang);
    output += t(
      "stats_content",
      {
        totalRelays: stats.totalRelays,
        totalBlocked: stats.totalBlocked,
        aiBlocks: stats.aiBlocks,
      },
      lang,
    );

    const apiKeys = Object.keys(apiStats);
    if (apiKeys.length > 0) {
      output += t("api_usage_title", {}, lang);
      apiKeys.forEach((key, idx) => {
        const masked = key.substring(0, 10) + "...";
        output += t(
          "api_usage_item",
          {
            index: idx + 1,
            calls: apiStats[key],
            masked,
          },
          lang,
        );
      });
    }

    return telegram.sendMessage({
      chat_id: ENV_ADMIN_UID,
      text: output,
    });
  }

  // Command: /unban <ID>
  if (text.startsWith("/unban ")) {
    const guestId = text.split(" ")[1];
    if (!guestId) {
      return telegram.sendMessage({
        chat_id: ENV_ADMIN_UID,
        text: t("unban_usage", {}, lang),
      });
    }

    await setGuestBlocked(kv, guestId, false);
    return telegram.sendMessage({
      chat_id: ENV_ADMIN_UID,
      text: t("unbanned", { guestId }, lang),
    });
  }

  // Command: /trustid <ID>
  if (text.startsWith("/trustid ")) {
    const guestId = text.split(" ")[1];
    if (!guestId) {
      return telegram.sendMessage({
        chat_id: ENV_ADMIN_UID,
        text: t("trustid_usage", {}, lang),
      });
    }

    await setUserTrusted(kv, guestId);
    return telegram.sendMessage({
      chat_id: ENV_ADMIN_UID,
      text: t("trustid_success", { guestId }, lang),
    });
  }

  // Command: /checktext <content>
  if (text.startsWith("/checktext ")) {
    const content = text.substring(11).trim();
    if (!content) {
      return telegram.sendMessage({
        chat_id: ENV_ADMIN_UID,
        text: t("checktext_usage", {}, lang),
      });
    }

    const apiKeys = parseApiKeys(env.ENV_GEMINI_API_KEY);
    const result = await checkContentSafety(content, apiKeys);
    const status = result ? `UNSAFE: ${result}` : "SAFE";

    return telegram.sendMessage({
      chat_id: ENV_ADMIN_UID,
      text: t("content_check", { status }, lang),
    });
  }

  // Reply-based commands
  if (message.reply_to_message) {
    const replyMsgId = message.reply_to_message.message_id;
    const relayId = await getRelayByAdminMsg(kv, replyMsgId);

    // Command: /block
    if (text === "/block") {
      if (!relayId) {
        return telegram.sendMessage({
          chat_id: ENV_ADMIN_UID,
          text: t("cannot_find_user", {}, lang),
        });
      }

      const relay = await getRelay(kv, relayId);
      if (!relay) {
        return telegram.sendMessage({
          chat_id: ENV_ADMIN_UID,
          text: t("relay_not_found", {}, lang),
        });
      }

      await setGuestBlocked(kv, relay.guestId, true, "Manual block by admin");
      await updateRelayStatus(kv, relayId, "blocked");

      return telegram.sendMessage({
        chat_id: ENV_ADMIN_UID,
        text: t(
          "blocked",
          { guestId: relay.guestId, username: relay.guestUsername },
          lang,
        ),
      });
    }

    // Command: /trust - Add user to whitelist
    if (text === "/trust") {
      if (!relayId) {
        return telegram.sendMessage({
          chat_id: ENV_ADMIN_UID,
          text: t("cannot_find_user", {}, lang),
        });
      }

      const relay = await getRelay(kv, relayId);
      if (!relay) {
        return telegram.sendMessage({
          chat_id: ENV_ADMIN_UID,
          text: t("relay_not_found", {}, lang),
        });
      }

      await setUserTrusted(kv, relay.guestId);
      return telegram.sendMessage({
        chat_id: ENV_ADMIN_UID,
        text: t(
          "trusted",
          { guestId: relay.guestId, username: relay.guestUsername },
          lang,
        ),
      });
    }

    // Command: /unblock
    if (text === "/unblock") {
      if (!relayId) {
        return telegram.sendMessage({
          chat_id: ENV_ADMIN_UID,
          text: t("cannot_find_user", {}, lang),
        });
      }

      const relay = await getRelay(kv, relayId);
      if (!relay) {
        return telegram.sendMessage({
          chat_id: ENV_ADMIN_UID,
          text: t("relay_not_found", {}, lang),
        });
      }

      await setGuestBlocked(kv, relay.guestId, false);
      return telegram.sendMessage({
        chat_id: ENV_ADMIN_UID,
        text: t("unblocked", { guestId: relay.guestId }, lang),
      });
    }

    // Command: /status
    if (text === "/status") {
      if (!relayId) {
        return telegram.sendMessage({
          chat_id: ENV_ADMIN_UID,
          text: t("cannot_find_user", {}, lang),
        });
      }

      const relay = await getRelay(kv, relayId);
      if (!relay) {
        return telegram.sendMessage({
          chat_id: ENV_ADMIN_UID,
          text: t("relay_not_found", {}, lang),
        });
      }

      const blocked = await isGuestBlocked(kv, relay.guestId);
      return telegram.sendMessage({
        chat_id: ENV_ADMIN_UID,
        text: t(
          "user_status",
          {
            guestId: relay.guestId,
            username: relay.guestUsername,
            blocked: blocked ? "Yes" : "No",
            status: relay.status,
          },
          lang,
        ),
      });
    }

    // Command: /check
    if (text === "/check") {
      if (!relayId) {
        return telegram.sendMessage({
          chat_id: ENV_ADMIN_UID,
          text: t("cannot_find_user", {}, lang),
        });
      }

      const relay = await getRelay(kv, relayId);
      if (!relay || !relay.preview) {
        return telegram.sendMessage({
          chat_id: ENV_ADMIN_UID,
          text: t("no_text_to_check", {}, lang),
        });
      }

      const apiKeys = parseApiKeys(env.ENV_GEMINI_API_KEY);

      const result = await checkContentSafety(relay.preview, apiKeys);
      const status = result ? `UNSAFE: ${result}` : "SAFE";

      return telegram.sendMessage({
        chat_id: ENV_ADMIN_UID,
        text: t("content_check", { status }, lang),
      });
    }

    // Reply to forwarded message -> send to guest
    if (!relayId) {
      return telegram.sendMessage({
        chat_id: ENV_ADMIN_UID,
        text: t("cannot_find_sender", {}, lang),
      });
    }

    const relay = await getRelay(kv, relayId);
    if (!relay) {
      return telegram.sendMessage({
        chat_id: ENV_ADMIN_UID,
        text: t("relay_data_not_found", {}, lang),
      });
    }

    const blocked = await isGuestBlocked(kv, relay.guestId);
    if (blocked) {
      return telegram.sendMessage({
        chat_id: ENV_ADMIN_UID,
        text: t("user_blocked_cannot_reply", {}, lang),
      });
    }

    await telegram.copyMessage({
      chat_id: relay.guestId,
      from_chat_id: ENV_ADMIN_UID,
      message_id: message.message_id,
    });

    await updateRelayStatus(kv, relayId, "replied");
  }
}
