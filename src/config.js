/**
 * kokosa-forward - Telegram Message Forwarding Bot
 * Copyright (c) 2025, 秦心桜
 * Licensed under BSD 2-Clause License
 *
 * @fileoverview Application configuration constants.
 */

/** Webhook endpoint path. Keep this secret for security. */
export const WEBHOOK_PATH = "/endpoint";

/** Google Gemini model for content moderation */
export const GEMINI_MODEL = "gemini-flash-lite-latest";

/** Enable AI content filtering. Requires ENV_GEMINI_API_KEY. */
export const ENABLE_FILTER = true;

/** Auto-block users who send unsafe content */
export const AUTO_BLOCK = true;

/**
 * Default language for new users.
 * Available: "en" (English), "zh" (Chinese)
 * Users can change with /lang command.
 */
export const LANGUAGE = "en";
