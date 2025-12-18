/**
 * kokosa-forward - Telegram Message Forwarding Bot
 * Copyright (c) 2025, 秦心桜
 * Licensed under BSD 2-Clause License
 */

import { checkContentSafety, checkImageSafety, parseApiKeys } from "../ai.js";
import {
  createRelay,
  linkAdminMessage,
  isGuestBlocked,
  setGuestBlocked,
  incrementCounter,
  getBlockInfo,
  checkRateLimit,
  isUserTrusted,
  incrementTrustScore,
  getCachedModerationResult,
  cacheModerationResult,
  getUserLanguage,
} from "../storage.js";
import { ENABLE_FILTER, AUTO_BLOCK } from "../config.js";
import { t, buildLanguageKeyboard, getDefaultLanguage } from "../i18n.js";

/**
 * Get user's language with fallback to default
 */
async function getLang(kv, userId) {
  return (await getUserLanguage(kv, userId)) || getDefaultLanguage();
}

/**
 * Build appeal action keyboard for admin
 * @param {string} guestId - Guest chat ID
 * @param {string} lang - Language code
 * @returns {Object} Inline keyboard markup
 */
function buildAppealKeyboard(guestId, lang) {
  return {
    inline_keyboard: [
      [
        {
          text: t("appeal_accept_button", {}, lang),
          callback_data: `appeal:accept:${guestId}`,
        },
        {
          text: t("appeal_reject_button", {}, lang),
          callback_data: `appeal:reject:${guestId}`,
        },
      ],
    ],
  };
}

/**
 * Handle /appeal command from blocked users
 */
async function handleAppeal(message, telegram, kv, env) {
  const { ENV_ADMIN_UID } = env;
  const guestId = message.chat.id.toString();
  const username =
    message.from?.username || message.from?.first_name || "Unknown";
  const guestLang = await getLang(kv, guestId);
  const adminLang = await getLang(kv, ENV_ADMIN_UID);

  // Get block info
  const blockInfo = await getBlockInfo(kv, guestId);
  const blockReason = blockInfo?.reason || "Unknown";
  const blockDate = blockInfo?.blockedAt
    ? new Date(blockInfo.blockedAt).toLocaleString()
    : "Unknown";

  // Build appeal message for admin (use admin's language)
  let appealText = t("appeal_title", {}, adminLang);
  appealText += t("appeal_from", { username, guestId }, adminLang);
  appealText += t("appeal_blocked", { date: blockDate }, adminLang);
  appealText += t("appeal_reason", { reason: blockReason }, adminLang);
  appealText += t("appeal_separator", {}, adminLang);

  // Check if there's attached text/content
  const appealContent = message.text?.replace("/appeal", "").trim();
  if (appealContent) {
    appealText += t("appeal_message", { content: appealContent }, adminLang);
  } else {
    appealText += t("appeal_no_message", {}, adminLang);
  }

  // Send appeal to admin with action buttons
  await telegram.sendMessage({
    chat_id: ENV_ADMIN_UID,
    text: appealText,
    reply_markup: buildAppealKeyboard(guestId, adminLang),
  });

  // If user replied to their own message with /appeal, forward that too
  if (message.reply_to_message) {
    await telegram.forwardMessage({
      chat_id: ENV_ADMIN_UID,
      from_chat_id: guestId,
      message_id: message.reply_to_message.message_id,
    });
  }

  return telegram.sendMessage({
    chat_id: guestId,
    text: t("guest_appeal_submitted", {}, guestLang),
  });
}

/**
 * Get image URL from message
 */
async function getImageUrl(message, telegram) {
  if (!message.photo || message.photo.length === 0) {
    return null;
  }

  // Get the largest photo (last in array)
  const photo = message.photo[message.photo.length - 1];
  const fileResult = await telegram.getFile({ file_id: photo.file_id });

  if (!fileResult.ok) {
    console.log("[Guest] Failed to get file:", fileResult);
    return null;
  }

  return telegram.getFileUrl(fileResult.result.file_path);
}

/**
 * Get sticker URL from message
 */
async function getStickerUrl(message, telegram) {
  if (!message.sticker) {
    return null;
  }

  // Animated stickers (tgs format) and video stickers can't be easily analyzed
  if (message.sticker.is_animated || message.sticker.is_video) {
    console.log("[Guest] Skipping animated/video sticker");
    return null;
  }

  const fileResult = await telegram.getFile({
    file_id: message.sticker.file_id,
  });

  if (!fileResult.ok) {
    console.log("[Guest] Failed to get sticker file:", fileResult);
    return null;
  }

  return telegram.getFileUrl(fileResult.result.file_path);
}

/**
 * Handle guest messages
 * @param {Object} message - Telegram message object
 * @param {Object} telegram - Telegram client
 * @param {KVNamespace} kv - KV storage
 * @param {Object} env - Environment variables
 */
export async function handleGuestMessage(message, telegram, kv, env) {
  const { ENV_ADMIN_UID, ENV_GEMINI_API_KEY } = env;
  const guestId = message.chat.id.toString();
  const lang = await getLang(kv, guestId);

  // Check block status
  const blocked = await isGuestBlocked(kv, guestId);

  // Handle /lang command (always allowed, even if blocked)
  if (message.text === "/lang") {
    return telegram.sendMessage({
      chat_id: message.chat.id,
      text: t("lang_select_prompt", {}, lang),
      reply_markup: buildLanguageKeyboard(guestId),
    });
  }

  // Handle /appeal for blocked users
  if (message.text?.startsWith("/appeal")) {
    if (!blocked) {
      return telegram.sendMessage({
        chat_id: message.chat.id,
        text: t("guest_not_blocked", {}, lang),
      });
    }
    return handleAppeal(message, telegram, kv, env);
  }

  // Block message if user is blocked
  if (blocked) {
    return telegram.sendMessage({
      chat_id: message.chat.id,
      text: t("guest_blocked", {}, lang),
    });
  }

  // Welcome message for /start
  if (message.text === "/start") {
    return telegram.sendMessage({
      chat_id: message.chat.id,
      text: t("guest_welcome", {}, lang),
    });
  }

  // Rate limiting
  const rateLimit = await checkRateLimit(kv, guestId);
  if (!rateLimit.allowed) {
    console.log(`[Guest] Rate limited: ${guestId}`);
    return telegram.sendMessage({
      chat_id: message.chat.id,
      text: t("guest_rate_limited", { seconds: rateLimit.resetIn }, lang),
    });
  }

  // AI content filter
  if (ENABLE_FILTER && ENV_GEMINI_API_KEY) {
    // Skip AI check for trusted users
    const trusted = await isUserTrusted(kv, guestId);
    if (trusted) {
      console.log(`[Guest] Trusted user, skipping AI check: ${guestId}`);
    } else {
      const apiKeys = parseApiKeys(ENV_GEMINI_API_KEY);
      let filterResult = null;
      let contentToCache = null;

      // Check text content
      const textContent = message.text || message.caption;
      if (textContent) {
        contentToCache = textContent;

        // Check cache first
        const cached = await getCachedModerationResult(kv, textContent);
        if (cached.hit) {
          console.log(`[Guest] Cache hit for text content`);
          filterResult = cached.result;
        } else {
          // Call AI API
          filterResult = await checkContentSafety(textContent, apiKeys);
          // Cache the result
          await cacheModerationResult(kv, textContent, filterResult);
        }
      }

      // Check image content if present (not cached - unique per image)
      if (!filterResult && message.photo) {
        const imageUrl = await getImageUrl(message, telegram);
        if (imageUrl) {
          filterResult = await checkImageSafety(
            imageUrl,
            apiKeys,
            message.caption,
          );
        }
      }

      // Check sticker content if present
      if (!filterResult && message.sticker) {
        const stickerUrl = await getStickerUrl(message, telegram);
        if (stickerUrl) {
          filterResult = await checkImageSafety(stickerUrl, apiKeys);
        }
      }

      // Handle unsafe content
      if (filterResult) {
        await incrementCounter(kv, "ai-blocks");
        if (AUTO_BLOCK) {
          await setGuestBlocked(
            kv,
            guestId,
            true,
            `AI Filter: ${filterResult}`,
          );
        }
        return telegram.sendMessage({
          chat_id: message.chat.id,
          text: t("guest_message_blocked", { reason: filterResult }, lang),
        });
      }

      // Passed moderation - increment trust score
      await incrementTrustScore(kv, guestId);
    }
  }

  // Create relay for tracking
  const relay = await createRelay(kv, guestId, message);

  // Forward message to admin
  const fwd = await telegram.forwardMessage({
    chat_id: ENV_ADMIN_UID,
    from_chat_id: message.chat.id,
    message_id: message.message_id,
  });

  // Link forwarded message to relay
  if (fwd.ok) {
    await linkAdminMessage(kv, fwd.result.message_id, relay.id);
  }
}
