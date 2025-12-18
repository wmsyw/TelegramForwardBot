/**
 * kokosa-forward - Telegram Message Forwarding Bot
 * Copyright (c) 2025, 秦心桜
 * Licensed under BSD 2-Clause License
 *
 * @fileoverview Telegram Bot API client wrapper.
 * Provides a simple interface for common Telegram bot operations.
 */

/**
 * Create a Telegram API client instance.
 *
 * @param {string} token - Bot token from BotFather
 * @returns {Object} API client with sendMessage, copyMessage, forwardMessage,
 *                   setWebhook, answerCallbackQuery, setMyCommands, getFile, getFileUrl
 * @example
 * const telegram = createTelegramClient(process.env.BOT_TOKEN);
 * await telegram.sendMessage({ chat_id: 123, text: "Hello!" });
 */
export function createTelegramClient(token) {
  const apiUrl = (method) => `https://api.telegram.org/bot${token}/${method}`;

  /**
   * Make a POST request to Telegram Bot API.
   * @param {string} method - API method name
   * @param {Object} body - Request parameters
   * @returns {Promise<Object>} Parsed JSON response
   */
  async function request(method, body) {
    console.log(
      `[Telegram API] ${method}`,
      JSON.stringify(body).substring(0, 100) + "...",
    );

    const response = await fetch(apiUrl(method), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    return response.json();
  }

  return {
    /** Send a text message */
    sendMessage: (params) => request("sendMessage", params),

    /** Copy a message without "Forwarded from" header */
    copyMessage: (params) => request("copyMessage", params),

    /** Forward a message with "Forwarded from" header */
    forwardMessage: (params) => request("forwardMessage", params),

    /** Set or delete webhook URL */
    setWebhook: (params) => request("setWebhook", params),

    /** Respond to callback query (inline button click) */
    answerCallbackQuery: (params) => request("answerCallbackQuery", params),

    /** Set bot menu commands */
    setMyCommands: (params) => request("setMyCommands", params),

    /** Get file info for downloading */
    getFile: (params) => request("getFile", params),

    /**
     * Get direct download URL for a file.
     * @param {string} filePath - File path from getFile result
     * @returns {string} Direct download URL
     */
    getFileUrl: (filePath) =>
      `https://api.telegram.org/file/bot${token}/${filePath}`,
  };
}
