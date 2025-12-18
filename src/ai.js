/**
 * kokosa-forward - Telegram Message Forwarding Bot
 * Copyright (c) 2025, 秦心桜
 * Licensed under BSD 2-Clause License
 */

import { GEMINI_MODEL } from "./config.js";

// API rotation state
let apiKeyIndex = 0;
let apiUsageStats = {};

/**
 * Get next API key using round-robin
 * @param {string|Array<string>} apiKeys - API key(s)
 * @returns {string} Selected API key
 */
function getNextApiKey(apiKeys) {
  if (typeof apiKeys === "string") {
    return apiKeys;
  }

  if (!Array.isArray(apiKeys) || apiKeys.length === 0) {
    throw new Error("No API keys provided");
  }

  const key = apiKeys[apiKeyIndex % apiKeys.length];
  apiKeyIndex++;

  apiUsageStats[key] = (apiUsageStats[key] || 0) + 1;
  console.log(
    `[AI] Using API key #${(apiKeyIndex % apiKeys.length) + 1}, Total uses: ${apiUsageStats[key]}`,
  );

  return key;
}

/**
 * Content moderation prompt
 */
const MODERATION_PROMPT = `
# Role
Content Moderator API. Output one word only.

# Rules
UNSAFE if:
- Real human nudity/sex
- QR codes/spam/ads/gambling promotion
- Real gore/shock content
- Illegal content promotion
- Scam/phishing attempts

SAFE if:
- 2D/Anime/Cartoon (even suggestive)
- Normal photos/text/screenshots
- Regular conversation

# Output
One word: "SAFE" or "UNSAFE"

Analyze the content:`;

/**
 * Check text content safety using Google Gemini
 * @param {string} text - Content to check
 * @param {string|Array<string>} apiKeys - Gemini API key(s)
 * @param {string} model - Model name
 * @returns {Promise<string|null>} Reason if unsafe, null if safe
 */
export async function checkContentSafety(text, apiKeys, model = GEMINI_MODEL) {
  if (!text || text.length < 2 || !apiKeys) {
    return null;
  }

  const keys = Array.isArray(apiKeys) ? apiKeys : [apiKeys];
  const maxRetries = keys.length;

  console.log(`[AI] Checking text: "${text.substring(0, 30)}..."`);

  const payload = {
    contents: [
      {
        parts: [
          {
            text: `${MODERATION_PROMPT} ${JSON.stringify(text)}`,
          },
        ],
      },
    ],
  };

  return await callGeminiApi(payload, keys, maxRetries, model);
}

/**
 * Check image content safety using Google Gemini
 * @param {string} imageUrl - URL of the image to check
 * @param {string|Array<string>} apiKeys - Gemini API key(s)
 * @param {string} caption - Optional caption text
 * @param {string} model - Model name (must support vision)
 * @returns {Promise<string|null>} Reason if unsafe, null if safe
 */
export async function checkImageSafety(
  imageUrl,
  apiKeys,
  caption = "",
  model = GEMINI_MODEL,
) {
  if (!imageUrl || !apiKeys) {
    return null;
  }

  const keys = Array.isArray(apiKeys) ? apiKeys : [apiKeys];
  const maxRetries = keys.length;

  console.log(`[AI] Checking image: ${imageUrl.substring(0, 50)}...`);

  try {
    // Download image and convert to base64
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      console.log(`[AI] Failed to download image: ${imageResponse.status}`);
      return null;
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const uint8Array = new Uint8Array(imageBuffer);

    // Convert to base64 in chunks to avoid stack overflow
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    const base64Image = btoa(binary);

    // Detect MIME type from file extension or magic bytes
    let mimeType = "image/jpeg"; // default
    if (imageUrl.includes(".png")) {
      mimeType = "image/png";
    } else if (imageUrl.includes(".gif")) {
      mimeType = "image/gif";
    } else if (imageUrl.includes(".webp")) {
      mimeType = "image/webp";
    } else {
      // Detect from magic bytes
      if (uint8Array[0] === 0x89 && uint8Array[1] === 0x50) {
        mimeType = "image/png";
      } else if (uint8Array[0] === 0x47 && uint8Array[1] === 0x49) {
        mimeType = "image/gif";
      } else if (uint8Array[0] === 0x52 && uint8Array[1] === 0x49) {
        mimeType = "image/webp";
      }
    }

    console.log(
      `[AI] Image downloaded, size: ${imageBuffer.byteLength} bytes, type: ${mimeType}`,
    );

    // Build payload with image
    const parts = [
      {
        inline_data: {
          mime_type: mimeType,
          data: base64Image,
        },
      },
      {
        text: caption
          ? `${MODERATION_PROMPT} (Caption: ${caption})`
          : MODERATION_PROMPT,
      },
    ];

    const payload = {
      contents: [
        {
          parts: parts,
        },
      ],
    };

    return await callGeminiApi(payload, keys, maxRetries, model);
  } catch (e) {
    console.log(`[AI] Image processing error: ${e.message}`);
    return null;
  }
}

/**
 * Call Gemini API with retry logic
 */
async function callGeminiApi(payload, keys, maxRetries, model) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const apiKey = getNextApiKey(keys);
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.log(
          `[AI] API Error (attempt ${attempt + 1}): ${response.status}`,
        );
        const errText = await response.text();
        console.log(`[AI] Details: ${errText.substring(0, 200)}`);

        if (attempt < maxRetries - 1) {
          console.log(`[AI] Switching to next API key...`);
          continue;
        }
        return null;
      }

      const data = await response.json();
      const result = data.candidates?.[0]?.content?.parts?.[0]?.text
        ?.trim()
        .toUpperCase();

      console.log(`[AI] Result: ${result}`);

      if (result && result.includes("UNSAFE")) {
        return "Content policy violation";
      }
      return null;
    } catch (e) {
      console.log(`[AI] Exception (attempt ${attempt + 1}): ${e.message}`);

      if (attempt < maxRetries - 1) {
        console.log(`[AI] Switching to next API key...`);
        continue;
      }
      return null;
    }
  }

  return null;
}

/**
 * Get API usage statistics
 * @returns {Object} API usage stats
 */
export function getApiUsageStats() {
  return { ...apiUsageStats };
}

/**
 * Parse API keys from string (handles comma-separated keys)
 * @param {string} keyString - API key string (single or comma-separated)
 * @returns {string|Array<string>} Single key or array of keys
 */
export function parseApiKeys(keyString) {
  if (!keyString) return null;
  if (keyString.includes(",")) {
    return keyString.split(",").map((k) => k.trim());
  }
  return keyString;
}
