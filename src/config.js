/**
 * kokosa-forward - Telegram Message Forwarding Bot
 * Copyright (c) 2025, 秦心桜
 * Licensed under BSD 2-Clause License
 *
 * @fileoverview Application configuration constants.
 */

/** Webhook endpoint path. Keep this secret for security. */
export const WEBHOOK_PATH = "/endpoint";

/** 模型名称 - Google Gemini model for content moderation */
export const GEMINI_MODEL = "gemini-flash-lite-latest";

/** 启用AI内容过滤 - Enable AI content filtering. Requires ENV_GEMINI_API_KEY. */
export const ENABLE_FILTER = true;

/** 自动拉黑 - Auto-block users who send unsafe content */
export const AUTO_BLOCK = true;

/**
 * 默认语言 - Default language for new users.
 * Available: "en" (English), "zh" (Chinese)
 * Users can change with /lang command.
 */
export const LANGUAGE = "en";

// ============================================
// Forum Mode Configuration
// ============================================

/**
 * 论坛模式 - 将消息转发到群组话题而非管理员私聊
 * 启用后需要配置 ENV_FORUM_GROUP_ID 环境变量
 */
export const FORUM_MODE_ENABLED = false;

// ============================================
// Rate Limiting Configuration
// ============================================

/** 频率限制 - Maximum requests per time window */
export const RATE_LIMIT_MAX_REQUESTS = 10;

/** Time window in milliseconds (1 minute) */
export const RATE_LIMIT_WINDOW_MS = 60000;

// ============================================
// Trust System Configuration
// ============================================

/** 信任阈值 - Messages needed to become trusted (skip AI moderation) */
export const TRUST_THRESHOLD = 3;

// ============================================
// Cache Configuration
// ============================================

/** 内容审核缓存最小长度 - Minimum content length to cache moderation results */
export const MOD_CACHE_MIN_LENGTH = 5;

/** 内容审核缓存时间 - Moderation cache TTL in seconds (24 hours) */
export const MOD_CACHE_TTL_SECONDS = 86400;

/** 频率限制缓存时间 - Rate limit record TTL in seconds */
export const RATE_LIMIT_TTL_SECONDS = 120;

/** API密钥显示长度 - Number of API key characters to show in stats */
export const API_KEY_DISPLAY_LENGTH = 6;
