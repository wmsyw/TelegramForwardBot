/**
 * kokosa-forward - Telegram Message Forwarding Bot
 * Copyright (c) 2025, 秦心桜
 * Licensed under BSD 2-Clause License
 */

/**
 * Create a Telegram API client
 * @param {string} token - Bot token
 * @returns {Object} API client methods
 */
export function createTelegramClient(token) {
  const apiUrl = (method) => `https://api.telegram.org/bot${token}/${method}`;

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
    sendMessage: (params) => request("sendMessage", params),
    copyMessage: (params) => request("copyMessage", params),
    forwardMessage: (params) => request("forwardMessage", params),
    setWebhook: (params) => request("setWebhook", params),
    answerCallbackQuery: (params) => request("answerCallbackQuery", params),
    setMyCommands: (params) => request("setMyCommands", params),
    getFile: (params) => request("getFile", params),
    getFileUrl: (filePath) =>
      `https://api.telegram.org/file/bot${token}/${filePath}`,
  };
}
