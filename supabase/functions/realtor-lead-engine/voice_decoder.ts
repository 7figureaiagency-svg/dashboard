/**
 * VOICE DECODER MODULE
 * Phase 33.1 / Phase 33.4: Multimodal Voice Note Ingestion Engine
 *
 * Downloads raw audio buffers from Telegram & WhatsApp APIs and provides
 * low-latency speech-to-text via Groq Whisper-large-v3 with Google Gemini 2.5 Flash audio fallback.
 */

export interface VoiceBufferResult {
  buffer: Uint8Array;
  mimeType: string;
}

export interface VoiceTranscriptionResult {
  text: string;
  detectedLanguage: string;
  durationSec: number;
  provider: string;
}

/**
 * Downloads audio file buffer from Telegram Bot API
 */
export async function fetchTelegramAudioBuffer(
  botToken: string,
  fileId: string
): Promise<VoiceBufferResult | null> {
  if (!botToken || !fileId || botToken.startsWith("bot_token_")) {
    console.warn("[Voice Ingestion] Telegram bot token or fileId missing/mocked.");
    return null;
  }
  try {
    const fileRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!fileRes.ok) {
      console.warn(`[Voice Ingestion] Telegram getFile HTTP ${fileRes.status}`);
      return null;
    }
    const fileData = await fileRes.json();
    const filePath = fileData.result?.file_path;
    if (!filePath) {
      console.warn("[Voice Ingestion] No file_path returned by Telegram getFile:", fileData);
      return null;
    }

    const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    const audioRes = await fetch(downloadUrl, { signal: AbortSignal.timeout(8000) });
    if (!audioRes.ok) {
      console.warn(`[Voice Ingestion] Telegram audio download HTTP ${audioRes.status}`);
      return null;
    }
    const arrayBuf = await audioRes.arrayBuffer();
    const ext = filePath.split(".").pop()?.toLowerCase();
    let mimeType = "audio/ogg";
    if (ext === "oga" || ext === "ogg") mimeType = "audio/ogg";
    else if (ext === "mp3") mimeType = "audio/mpeg";
    else if (ext === "m4a") mimeType = "audio/mp4";
    else if (ext === "wav") mimeType = "audio/wav";

    return { buffer: new Uint8Array(arrayBuf), mimeType };
  } catch (err: any) {
    console.error("[Voice Ingestion] Telegram audio download failed:", err.message);
    return null;
  }
}

/**
 * Downloads audio file buffer from WhatsApp Cloud Media API
 */
export async function fetchWhatsAppAudioBuffer(
  mediaId: string,
  whatsappToken: string
): Promise<VoiceBufferResult | null> {
  if (!mediaId || !whatsappToken) {
    console.warn("[Voice Ingestion] WhatsApp mediaId or token missing.");
    return null;
  }
  try {
    const metaRes = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(mediaId)}`, {
      headers: {
        Authorization: `Bearer ${whatsappToken}`,
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!metaRes.ok) {
      console.warn(`[Voice Ingestion] WhatsApp media query HTTP ${metaRes.status}`);
      return null;
    }
    const metaData = await metaRes.json();
    const mediaUrl = metaData.url;
    if (!mediaUrl) {
      console.warn("[Voice Ingestion] No url in WhatsApp media metadata:", metaData);
      return null;
    }

    const audioRes = await fetch(mediaUrl, {
      headers: {
        Authorization: `Bearer ${whatsappToken}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!audioRes.ok) {
      console.warn(`[Voice Ingestion] WhatsApp media download HTTP ${audioRes.status}`);
      return null;
    }
    const arrayBuf = await audioRes.arrayBuffer();
    const mimeType = metaData.mime_type || audioRes.headers.get("content-type") || "audio/ogg";
    return { buffer: new Uint8Array(arrayBuf), mimeType };
  } catch (err: any) {
    console.error("[Voice Ingestion] WhatsApp audio download failed:", err.message);
    return null;
  }
}

/**
 * Helper to convert Uint8Array into base64 string
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * Empathetic vernacular recovery reply when voice note is inaudible/silent
 */
export function getVoiceInaudibleReply(userLanguage?: string): string {
  if (userLanguage === "GUJLISH" || userLanguage === "GUJARATI") {
    return "Tamaro voice note barabar sambhadayo nathi. Kripya shant jagyae thi fari record karo athva tamari requirement text ma lakhi ne moklo. 🙏";
  } else if (userLanguage === "ENGLISH") {
    return "We couldn't clearly hear your voice note due to background noise. Please re-record in a quiet place or type your requirement as text. 🙏";
  }
  return "Aapka voice note theek se sunai nahi diya. Kripya shant jagah se dubara record karein ya apna requirement text me likh kar bhej dein. 🙏";
}

/**
 * Dual-Engine Speech-to-Text Transcriber (Groq Whisper-large-v3 + Gemini 2.5 Flash Fallback)
 */
export async function transcribeAudioBuffer(
  buffer: Uint8Array,
  mimeType: string,
  options?: { groqApiKey?: string; geminiApiKey?: string }
): Promise<VoiceTranscriptionResult> {
  if (!buffer || buffer.length === 0) {
    return { text: "", detectedLanguage: "unknown", durationSec: 0, provider: "NONE" };
  }

  const groqKey = (
    options?.groqApiKey ||
    (typeof Deno !== "undefined" ? Deno.env.get("GROQ_API_KEY") : process.env.GROQ_API_KEY) ||
    ""
  ).trim().replace(/^["']|["']$/g, "");

  const geminiKey = (
    options?.geminiApiKey ||
    (typeof Deno !== "undefined" ? Deno.env.get("GEMINI_API_KEY") : process.env.GEMINI_API_KEY) ||
    ""
  ).trim().replace(/^["']|["']$/g, "");

  // 1. Primary Engine: Groq Whisper-large-v3 (~180ms - 400ms ultra-low latency)
  if (groqKey) {
    try {
      let filename = "audio.ogg";
      const cleanMime = mimeType.split(";")[0].trim().toLowerCase();
      if (cleanMime.includes("mpeg") || cleanMime.includes("mp3")) filename = "audio.mp3";
      else if (cleanMime.includes("wav")) filename = "audio.wav";
      else if (cleanMime.includes("mp4") || cleanMime.includes("m4a")) filename = "audio.m4a";

      const formData = new FormData();
      const blob = new Blob([buffer], { type: cleanMime || "audio/ogg" });
      formData.append("file", blob, filename);
      formData.append("model", "whisper-large-v3");
      formData.append(
        "prompt",
        "Real estate inquiry in India - Hindi, Gujarati, English, Marathi, flats, shops, budget, crore, lakh, visit"
      );
      formData.append("response_format", "verbose_json");
      formData.append("temperature", "0.2");

      const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
        },
        body: formData,
        signal: AbortSignal.timeout(4000), // Strict 4000ms cap
      });

      if (groqRes.ok) {
        const data = await groqRes.json();
        const transcribedText = (data.text || "").trim();
        if (transcribedText) {
          return {
            text: transcribedText,
            detectedLanguage: data.language || "unknown",
            durationSec: Number(data.duration) || 0,
            provider: "GROQ_WHISPER",
          };
        }
      } else {
        const errText = await groqRes.text();
        console.warn(`[Voice Ingestion] Groq Whisper HTTP ${groqRes.status}:`, errText);
      }
    } catch (err: any) {
      console.warn("[Voice Ingestion] Groq Whisper failed or timed out (falling back to Gemini):", err.message);
    }
  }

  // 2. Fallback Engine: Google Gemini 2.5 Flash Audio API
  if (geminiKey) {
    try {
      const cleanMime = mimeType.split(";")[0].trim().toLowerCase() || "audio/ogg";
      const base64Data = uint8ArrayToBase64(buffer);
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;

      const geminiRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: cleanMime,
                    data: base64Data,
                  },
                },
                {
                  text: "Transcribe this real estate voice message accurately in original language/script and translate to Latin text if spoken in vernacular. Return ONLY the transcribed text without any conversational preamble or markdown formatting.",
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 500,
          },
        }),
        signal: AbortSignal.timeout(6000),
      });

      if (geminiRes.ok) {
        const gData = await geminiRes.json();
        const rawText = gData.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const cleanText = rawText.trim().replace(/^["']|["']$/g, "").trim();
        if (cleanText) {
          return {
            text: cleanText,
            detectedLanguage: "multilingual",
            durationSec: 0,
            provider: "GEMINI_AUDIO",
          };
        }
      } else {
        const errText = await geminiRes.text();
        console.warn(`[Voice Ingestion] Gemini Flash HTTP ${geminiRes.status}:`, errText);
      }
    } catch (err: any) {
      console.warn("[Voice Ingestion] Gemini Flash audio fallback failed:", err.message);
    }
  }

  return { text: "", detectedLanguage: "unknown", durationSec: 0, provider: "NONE" };
}
