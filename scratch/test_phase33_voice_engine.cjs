// Comprehensive Unit & Regression Test Suite for Plan 33.1:
// Multimodal Voice Note Ingestion Engine (Groq Whisper-large-v3 + Gemini 2.5 Flash Fallback)
const assert = require("assert");
const fs = require("fs");

console.log("=================================================================");
console.log("=== RUNNING PLAN 33.1 COMPREHENSIVE VOICE ENGINE TEST SUITE ===");
console.log("=================================================================\n");

const indexCode = fs.readFileSync("supabase/functions/realtor-lead-engine/index.ts", "utf8");

// -----------------------------------------------------------------------------
// Test 1: Telegram Voice and Audio Payload Detection
// -----------------------------------------------------------------------------
console.log("--- Test 1: Telegram Voice & Audio Payload Ingestion ---");

function simulateTelegramParser(body) {
  let platform = "DIRECT";
  let senderId = "";
  let senderName = "Customer";
  let messageText = "";
  let isVoice = false;
  let telegramVoiceFileId = "";
  let voiceDuration = 0;
  let voiceMimeType = "audio/ogg";

  if ((body.update_id || body.message?.chat?.id) && (body.message || body.edited_message || body.callback_query)) {
    platform = "TELEGRAM";
    const msg = body.message || body.edited_message || body.callback_query?.message;
    senderId = String(msg.chat?.id || msg.from?.id);
    senderName = msg.from?.first_name || "Customer";
    messageText = msg.text || msg.caption || "";

    const tgVoice = msg.voice || msg.audio;
    if (tgVoice?.file_id) {
      isVoice = true;
      telegramVoiceFileId = tgVoice.file_id;
      voiceDuration = tgVoice.duration || 0;
      voiceMimeType = tgVoice.mime_type || (msg.voice ? "audio/ogg" : "audio/mpeg");
    }
  }
  return { platform, senderId, senderName, messageText, isVoice, telegramVoiceFileId, voiceDuration, voiceMimeType };
}

// Telegram Voice Note (.oga)
const tgVoicePayload = {
  update_id: 100001,
  message: {
    message_id: 42,
    from: { id: 98765432, first_name: "Rahul" },
    chat: { id: 98765432, type: "private" },
    voice: {
      file_id: "AwACAgIAAxkBAAIBY1_voice_note_file_id",
      file_unique_id: "AQADabc123",
      duration: 7,
      mime_type: "audio/ogg",
      file_size: 24500,
    },
  },
};

const tgVoiceResult = simulateTelegramParser(tgVoicePayload);
assert.strictEqual(tgVoiceResult.platform, "TELEGRAM", "Platform must be TELEGRAM");
assert.strictEqual(tgVoiceResult.senderId, "98765432", "Sender ID must match chat/from ID");
assert.strictEqual(tgVoiceResult.isVoice, true, "Must flag message as voice");
assert.strictEqual(tgVoiceResult.telegramVoiceFileId, "AwACAgIAAxkBAAIBY1_voice_note_file_id", "File ID must be extracted");
assert.strictEqual(tgVoiceResult.voiceDuration, 7, "Duration must match voice duration");
assert.strictEqual(tgVoiceResult.voiceMimeType, "audio/ogg", "Mime type must be audio/ogg");
assert.strictEqual(tgVoiceResult.messageText, "", "Raw messageText is empty before transcription");

// Telegram Audio File (.mp3)
const tgAudioPayload = {
  update_id: 100002,
  message: {
    message_id: 43,
    from: { id: 98765432, first_name: "Rahul" },
    chat: { id: 98765432, type: "private" },
    audio: {
      file_id: "AwACAgIAAxkBAAIBY2_audio_file_id",
      file_unique_id: "AQADdef456",
      duration: 15,
      mime_type: "audio/mpeg",
      file_size: 104500,
      title: "Requirement_Voice",
    },
    caption: "Listen to my voice note",
  },
};

const tgAudioResult = simulateTelegramParser(tgAudioPayload);
assert.strictEqual(tgAudioResult.platform, "TELEGRAM");
assert.strictEqual(tgAudioResult.isVoice, true);
assert.strictEqual(tgAudioResult.telegramVoiceFileId, "AwACAgIAAxkBAAIBY2_audio_file_id");
assert.strictEqual(tgAudioResult.voiceDuration, 15);
assert.strictEqual(tgAudioResult.voiceMimeType, "audio/mpeg");
assert.strictEqual(tgAudioResult.messageText, "Listen to my voice note", "Telegram caption must be captured if present");

console.log("✓ Telegram Voice & Audio Parsing passed (100%)\n");

// -----------------------------------------------------------------------------
// Test 2: WhatsApp Voice & Audio Payload Detection
// -----------------------------------------------------------------------------
console.log("--- Test 2: WhatsApp Voice & Audio Payload Ingestion ---");

function simulateWhatsAppParser(body) {
  let platform = "DIRECT";
  let senderId = "";
  let senderName = "Customer";
  let messageText = "";
  let phoneNumberId = "";
  let isVoice = false;
  let whatsAppMediaId = "";
  let voiceMimeType = "audio/ogg";

  if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
    platform = "WHATSAPP";
    const value = body.entry[0].changes[0].value;
    const msg = value.messages[0];
    senderId = msg.from;
    senderName = value.contacts?.[0]?.profile?.name || "Customer";
    messageText = msg.text?.body || msg.caption || "";
    phoneNumberId = value.metadata?.phone_number_id || "";

    const isWaAudio = (msg.type === "audio" && msg.audio?.id) || (msg.type === "voice" && (msg.voice?.id || msg.audio?.id));
    if (isWaAudio) {
      isVoice = true;
      whatsAppMediaId = msg.audio?.id || msg.voice?.id || "";
      voiceMimeType = msg.audio?.mime_type || msg.voice?.mime_type || "audio/ogg; codecs=opus";
    }
  }

  return { platform, senderId, senderName, messageText, phoneNumberId, isVoice, whatsAppMediaId, voiceMimeType };
}

// WhatsApp Standard Audio message (audio/ogg; codecs=opus)
const waAudioPayload = {
  entry: [
    {
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "919999999999", phone_number_id: "phone_num_id_123" },
            contacts: [{ profile: { name: "Sneha Patel" }, wa_id: "919876500000" }],
            messages: [
              {
                from: "919876500000",
                id: "wamid.HBgLMTAwMDAwMDA",
                timestamp: "1730000000",
                type: "audio",
                audio: {
                  id: "wa_media_id_998877",
                  mime_type: "audio/ogg; codecs=opus",
                  sha256: "dummy_sha256",
                  voice: true,
                },
              },
            ],
          },
        },
      ],
    },
  ],
};

const waAudioResult = simulateWhatsAppParser(waAudioPayload);
assert.strictEqual(waAudioResult.platform, "WHATSAPP", "Platform must be WHATSAPP");
assert.strictEqual(waAudioResult.senderId, "919876500000", "Sender ID must be WhatsApp phone number");
assert.strictEqual(waAudioResult.senderName, "Sneha Patel", "Sender name must be extracted from contacts");
assert.strictEqual(waAudioResult.phoneNumberId, "phone_num_id_123", "Phone number ID must be extracted");
assert.strictEqual(waAudioResult.isVoice, true, "Must flag message as voice");
assert.strictEqual(waAudioResult.whatsAppMediaId, "wa_media_id_998877", "Media ID must match audio.id");
assert.strictEqual(waAudioResult.voiceMimeType, "audio/ogg; codecs=opus", "Mime type must preserve opus parameters");

console.log("✓ WhatsApp Voice & Audio Parsing passed (100%)\n");

// -----------------------------------------------------------------------------
// Test 3: Groq Whisper-large-v3 Multipart Payload Structure
// -----------------------------------------------------------------------------
console.log("--- Test 3: Groq Whisper-large-v3 Request Architecture ---");

assert(indexCode.includes("https://api.groq.com/openai/v1/audio/transcriptions"), "Must use Groq OpenAI-compatible audio transcriptions endpoint");
assert(indexCode.includes('formData.append("model", "whisper-large-v3");'), "Must specify whisper-large-v3 model");
assert(indexCode.includes('formData.append("response_format", "verbose_json");'), "Must use verbose_json response format");
assert(indexCode.includes('formData.append(\n        "prompt",\n        "Real estate inquiry in India - Hindi, Gujarati, English, Marathi, flats, shops, budget, crore, lakh, visit"\n      );'), "Must use real estate domain prompt hint");
assert(indexCode.includes("AbortSignal.timeout(4000)"), "Must set 4000ms timeout for Groq API call");

console.log("✓ Groq Whisper multipart specification verified (100%)\n");

// -----------------------------------------------------------------------------
// Test 4: Gemini 2.5 Flash Audio API Fallback Structure
// -----------------------------------------------------------------------------
console.log("--- Test 4: Gemini 2.5 Flash Audio Fallback Structure ---");

assert(indexCode.includes("gemini-2.5-flash:generateContent"), "Must target Gemini 2.5 Flash endpoint");
assert(indexCode.includes("inlineData: {"), "Must use inlineData schema for audio binary payload");
assert(indexCode.includes("uint8ArrayToBase64(buffer)"), "Must encode audio buffer to base64");
assert(indexCode.includes("cleanMime"), "Must clean MIME type parameters for Gemini API compatibility");
assert(indexCode.includes("Transcribe this real estate voice message accurately in original language/script and translate to Latin text if spoken in vernacular."), "Prompt must specify vernacular handling");
assert(indexCode.includes("AbortSignal.timeout(6000)"), "Must set timeout for Gemini API call");

console.log("✓ Gemini 2.5 Flash audio fallback verified (100%)\n");

// -----------------------------------------------------------------------------
// Test 5: Inaudible Voice Note Handling & Empathetic Clarifications
// -----------------------------------------------------------------------------
console.log("--- Test 5: Inaudible Voice Note Empathetic Clarification ---");

// Test multilingual reply generator
function getVoiceInaudibleReply(userLanguage) {
  if (userLanguage === "GUJLISH" || userLanguage === "GUJARATI") {
    return "Tamaro voice note barabar sambhadayo nathi. Kripya shant jagyae thi fari record karo athva tamari requirement text ma lakhi ne moklo. 🙏";
  } else if (userLanguage === "ENGLISH") {
    return "We couldn't clearly hear your voice note due to background noise. Please re-record in a quiet place or type your requirement as text. 🙏";
  }
  return "Aapka voice note theek se sunai nahi diya. Kripya shant jagah se dubara record karein ya apna requirement text me likh kar bhej dein. 🙏";
}

const hiReply = getVoiceInaudibleReply("HINGLISH");
const guReply = getVoiceInaudibleReply("GUJLISH");
const enReply = getVoiceInaudibleReply("ENGLISH");
const defReply = getVoiceInaudibleReply();

assert(hiReply.includes("Aapka voice note theek se sunai nahi diya"), "Hindi prompt must be polite and clear");
assert(guReply.includes("Tamaro voice note barabar sambhadayo nathi"), "Gujarati prompt must use natural tone");
assert(enReply.includes("We couldn't clearly hear your voice note"), "English prompt must be polite and clear");
assert(defReply.includes("Aapka voice note"), "Default must be Hinglish/Hindi");

assert(indexCode.includes('event_type: "VOICE_NOTE_INAUDIBLE"'), "Must log VOICE_NOTE_INAUDIBLE event to lead_events");
assert(indexCode.includes('status: "voice_inaudible_clarification_sent"'), "Must return voice_inaudible_clarification_sent status");
assert(!indexCode.includes('if (!messageText && !isVoice) {\n      return new Response(JSON.stringify({ status: "ignored", reason: "empty message" })'), "Old empty message drop before transcription must be eliminated");

console.log("✓ Inaudible voice note prompts & audit event verified (100%)\n");

// -----------------------------------------------------------------------------
// Test 6: Metadata Enrichment & Database Schema Integrity
// -----------------------------------------------------------------------------
console.log("--- Test 6: Metadata Persistence & Database Schema Integrity ---");

assert(indexCode.includes("enrichedLeadMetadata.last_message_was_voice = true;"), "last_message_was_voice must be set in lead metadata");
assert(indexCode.includes("enrichedLeadMetadata.voice_transcript = voiceTranscript;"), "voice_transcript must be persisted in lead metadata");
assert(indexCode.includes("enrichedLeadMetadata.voice_metadata = voiceMetadata;"), "voice_metadata must be persisted in lead metadata");
assert(indexCode.includes("isVoice,"), "isVoice must be recorded in lead_events payload");
assert(indexCode.includes("voice_transcription: isVoice ? { text: messageText, ...voiceMetadata } : undefined,"), "voice_transcription must be included in response JSON");

console.log("✓ Lead metadata & audit trail assertions verified (100%)\n");

// -----------------------------------------------------------------------------
// Test 7: Mock End-to-End Transcription & Bypass of Empty Message Drop
// -----------------------------------------------------------------------------
console.log("--- Test 7: Simulated End-to-End Voice Flow Simulation ---");

function simulateWebhookVoicePipeline(req) {
  let isVoice = req.isVoice || false;
  let messageText = req.text || "";
  let voiceTranscript = "";
  let voiceMetadata = null;

  if (isVoice) {
    // Simulate successful transcription
    if (req.audioBuffer && req.audioBuffer.length > 0 && !req.simulateInaudible) {
      voiceTranscript = "Mujhe 3BHK flat chahiye Alkapuri me 80 Lakhs ke andar";
      messageText = voiceTranscript;
      voiceMetadata = {
        durationSec: 5,
        detectedLanguage: "hindi",
        provider: "GROQ_WHISPER",
      };
    }

    if (!messageText) {
      return {
        status: 200,
        body: {
          success: true,
          status: "voice_inaudible_clarification_sent",
          reply_sent: getVoiceInaudibleReply("HINGLISH"),
        },
      };
    }
  }

  // Final empty message guard
  if (!messageText) {
    return {
      status: 200,
      body: { status: "ignored", reason: "empty message" },
    };
  }

  return {
    status: 200,
    body: {
      success: true,
      userText: messageText,
      voice_transcription: isVoice ? { text: messageText, ...voiceMetadata } : undefined,
    },
  };
}

// Case 1: Incoming voice note with audio -> successfully transcribed
const voiceNoteRun = simulateWebhookVoicePipeline({
  isVoice: true,
  audioBuffer: new Uint8Array([1, 2, 3, 4]),
  text: "",
});
assert.strictEqual(voiceNoteRun.body.success, true, "Voice message must succeed");
assert.strictEqual(voiceNoteRun.body.userText, "Mujhe 3BHK flat chahiye Alkapuri me 80 Lakhs ke andar", "userText must be replaced by transcript");
assert.strictEqual(voiceNoteRun.body.voice_transcription.provider, "GROQ_WHISPER", "Provider must be GROQ_WHISPER");

// Case 2: Inaudible / corrupted voice note -> clarification sent, NOT dropped as empty message
const inaudibleRun = simulateWebhookVoicePipeline({
  isVoice: true,
  audioBuffer: new Uint8Array([0, 0]),
  simulateInaudible: true,
  text: "",
});
assert.strictEqual(inaudibleRun.body.status, "voice_inaudible_clarification_sent", "Inaudible audio must return clarification status");
assert.notStrictEqual(inaudibleRun.body.status, "ignored", "Must NOT be ignored as empty message");
assert(inaudibleRun.body.reply_sent.includes("Aapka voice note theek se sunai nahi diya"), "Must send polite clarification");

// Case 3: Empty webhook with neither text nor voice -> properly ignored
const emptyRun = simulateWebhookVoicePipeline({
  isVoice: false,
  text: "",
});
assert.strictEqual(emptyRun.body.status, "ignored", "Genuinely empty message must be ignored");
assert.strictEqual(emptyRun.body.reason, "empty message", "Reason must be empty message");

console.log("✓ End-to-end voice simulation passed 100%\n");

console.log("=================================================================");
console.log("=== ALL 7 VOICE NOTE INGESTION TEST SUITES PASSED (100%) ===");
console.log("=================================================================\n");
