import React, { useMemo, useState } from "react";
import {
  CheckCheck,
  ExternalLink,
  Lock,
  MessageCircle,
  Paperclip,
  Phone,
  Send,
  Smile,
  Sparkles,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, type Lead } from "@/lib/crm";

export interface ChatMessage {
  sender: "user" | "bot";
  text: string;
  time: string;
  badge?: string;
  platform?: string;
}

interface WhatsAppChatViewProps {
  lead: Lead;
  messages: ChatMessage[];
  loading?: boolean;
  onSendNote?: (note: string) => void;
}

/**
 * Parses bold tags (<b> or *bold*), linebreaks, and clean links without exposing raw HTML.
 */
function RichMessageContent({ text }: { text: string }) {
  const formattedContent = useMemo(() => {
    if (!text) return null;

    // Convert raw <br/> or <br> to newlines first
    let clean = text.replace(/<br\s*\/?>/gi, "\n");

    // Split text into tokens based on <b>...</b>, <strong>...</strong>, or *...*
    const parts = clean.split(/(<b>.*?<\/b>|<strong>.*?<\/strong>|\*[^\s*]+[^*]*\*)/gi);

    return parts.map((part, index) => {
      if (
        (part.startsWith("<b>") && part.endsWith("</b>")) ||
        (part.startsWith("<strong>") && part.endsWith("</strong>"))
      ) {
        const inner = part.replace(/<\/?(?:b|strong)>/gi, "");
        return (
          <strong key={index} className="font-semibold text-foreground dark:text-[#E9EDEF]">
            {inner}
          </strong>
        );
      }
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        const inner = part.slice(1, -1);
        return (
          <strong key={index} className="font-semibold text-foreground dark:text-[#E9EDEF]">
            {inner}
          </strong>
        );
      }
      // Standard text with newlines
      return (
        <span key={index} className="whitespace-pre-wrap break-words">
          {part}
        </span>
      );
    });
  }, [text]);

  return <div className="text-[13px] leading-relaxed select-text">{formattedContent}</div>;
}

/**
 * Formats time to WhatsApp style (e.g. "4:32 PM")
 */
function formatWhatsAppTime(isoString?: string): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return "";
  }
}

/**
 * Formats date header divider (e.g. "TODAY", "YESTERDAY", "20 OCT 2026")
 */
function getMessageDateGroup(isoString?: string): string {
  if (!isoString) return "OLDER";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "OLDER";
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (isToday) return "TODAY";

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear();
    if (isYesterday) return "YESTERDAY";

    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).toUpperCase();
  } catch {
    return "OLDER";
  }
}

export function WhatsAppChatView({
  lead,
  messages,
  loading = false,
  onSendNote,
}: WhatsAppChatViewProps) {
  const [inputText, setInputText] = useState("");

  const cleanPhone = (lead.phone || "").replace(/\D/g, "");
  const waUrl = cleanPhone
    ? `https://wa.me/${cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone}`
    : null;

  // Group messages by calendar date
  const groupedMessages = useMemo(() => {
    const groups: Array<{ dateLabel: string; items: ChatMessage[] }> = [];
    let currentLabel = "";
    let currentItems: ChatMessage[] = [];

    messages.forEach((msg) => {
      const label = getMessageDateGroup(msg.time);
      if (label !== currentLabel) {
        if (currentItems.length > 0) {
          groups.push({ dateLabel: currentLabel, items: currentItems });
        }
        currentLabel = label;
        currentItems = [msg];
      } else {
        currentItems.push(msg);
      }
    });

    if (currentItems.length > 0) {
      groups.push({ dateLabel: currentLabel, items: currentItems });
    }

    return groups;
  }, [messages]);

  const handleSendOrOpen = () => {
    if (!inputText.trim()) {
      if (waUrl) window.open(waUrl, "_blank");
      return;
    }
    if (waUrl) {
      const fullUrl = `${waUrl}?text=${encodeURIComponent(inputText.trim())}`;
      window.open(fullUrl, "_blank");
    }
    if (onSendNote) {
      onSendNote(inputText.trim());
    }
    setInputText("");
  };

  const leadName = lead.name || lead.first_name || "Lead #" + lead.lead_id?.slice(-4);
  const isOwner = lead.lead_type === "PROVIDER" || lead.property_state?.startsWith("OWNER_");
  const channel = lead.source?.toUpperCase().includes("TELEGRAM") ? "Telegram" : "WhatsApp";

  return (
    <div className="flex flex-col h-[520px] rounded-xl overflow-hidden border border-[#D1D7DB] dark:border-[#222E35] shadow-sm bg-background">
      {/* ── WhatsApp Header Bar ── */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#008069] dark:bg-[#202C33] text-white shrink-0 select-none shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar with Online Pulse */}
          <div className="relative flex size-10 items-center justify-center rounded-full bg-[#128C7E] dark:bg-[#111B21] text-white font-semibold text-sm ring-1 ring-white/20 shrink-0">
            {lead.name ? (
              lead.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()
            ) : (
              <User className="size-5 text-white/90" />
            )}
            <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-[#25D366] ring-1 ring-white dark:ring-[#202C33]" />
          </div>

          {/* User Info */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm leading-tight text-white truncate max-w-[200px] sm:max-w-xs">
                {leadName}
              </h4>
              <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-white/15 text-white/90 border border-white/20 shrink-0">
                {isOwner ? "Owner" : "Buyer"}
              </span>
            </div>
            <p className="text-[11px] text-white/80 leading-tight truncate mt-0.5">
              {lead.phone ? `${lead.phone} · ` : ""}
              <span className="text-[#D9FDD3] dark:text-[#25D366] font-medium">online</span>
              {" · "}via {channel}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {lead.phone && (
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-8.5 text-white hover:bg-white/15 rounded-full"
              title="Direct Call"
            >
              <a href={`tel:${lead.phone}`}>
                <Phone className="size-4" />
              </a>
            </Button>
          )}

          {waUrl && (
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-8.5 text-white hover:bg-white/15 rounded-full"
              title="Open in WhatsApp Web"
            >
              <a href={waUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* ── WhatsApp Chat Wallpaper Container ── */}
      <div
        className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3.5 relative bg-[#EFEAE2] dark:bg-[#0B141A]"
        style={{
          backgroundImage: `radial-gradient(rgba(0, 0, 0, 0.04) 1px, transparent 0)`,
          backgroundSize: "20px 20px",
        }}
      >
        {/* End-to-End Encryption Pill */}
        <div className="flex justify-center my-1">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#FFEECD] dark:bg-[#182229] border border-[#F4E1BD] dark:border-[#222E35] text-[11px] text-[#54656F] dark:text-[#FFD279] shadow-2xs max-w-[90%] text-center leading-snug">
            <Lock className="size-3 shrink-0 text-[#EAA123] dark:text-[#FFD279]" />
            <span>Messages are synchronized in real-time with Nextgen Realty CRM Lead Engine</span>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center py-6">
            <span className="text-xs text-[#667781] dark:text-[#8696A0] bg-white/70 dark:bg-[#202C33]/70 px-3 py-1 rounded-full shadow-2xs">
              Loading chat messages…
            </span>
          </div>
        )}

        {/* Empty State */}
        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-center px-4">
            <div className="size-12 rounded-full bg-white/80 dark:bg-[#202C33] flex items-center justify-center text-[#54656F] dark:text-[#8696A0] shadow-2xs mb-2">
              <MessageCircle className="size-6" />
            </div>
            <p className="text-xs font-semibold text-[#111B21] dark:text-[#E9EDEF]">No chat messages recorded yet</p>
            <p className="text-[11px] text-[#667781] dark:text-[#8696A0] mt-0.5">
              Incoming WhatsApp/Telegram webhook messages for this lead will appear here instantly.
            </p>
          </div>
        )}

        {/* Grouped Messages Stream */}
        {!loading &&
          groupedMessages.map((group, groupIdx) => (
            <div key={groupIdx} className="space-y-2.5">
              {/* Date Header Divider */}
              <div className="flex justify-center my-2 sticky top-0 z-10">
                <span className="px-2.5 py-0.5 rounded-md bg-white/90 dark:bg-[#182229]/95 text-[10.5px] font-semibold text-[#54656F] dark:text-[#8696A0] shadow-2xs border border-black/5 dark:border-white/5 uppercase tracking-wider">
                  {group.dateLabel}
                </span>
              </div>

              {/* Messages in this date */}
              {group.items.map((msg, idx) => {
                const isClient = msg.sender === "user";
                return (
                  <div
                    key={idx}
                    className={`flex flex-col ${isClient ? "items-start" : "items-end"} w-full`}
                  >
                    <div
                      className={`relative max-w-[84%] sm:max-w-[76%] px-3 pt-2 pb-1.5 shadow-xs transition-shadow ${
                        isClient
                          ? "bg-white dark:bg-[#202C33] text-[#111B21] dark:text-[#E9EDEF] rounded-2xl rounded-tl-xs border border-black/5 dark:border-white/5"
                          : "bg-[#D9FDD3] dark:bg-[#005C4B] text-[#111B21] dark:text-[#E9EDEF] rounded-2xl rounded-tr-xs border border-[#C2EAC0]/60 dark:border-[#005C4B]/40"
                      }`}
                    >
                      {/* Sender Label for Bot */}
                      {!isClient && (
                        <div className="flex items-center gap-1 mb-1 text-[11px] font-bold text-[#075E54] dark:text-[#25D366]">
                          <Sparkles className="size-3" />
                          <span>Nextgen AI Bot</span>
                          {msg.badge && (
                            <span className="ml-1 text-[9px] font-medium px-1 py-0.2 rounded bg-black/5 dark:bg-black/20 text-[#54656F] dark:text-white/70">
                              {msg.badge.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Client Sender Name if multiple */}
                      {isClient && (
                        <div className="text-[11px] font-bold text-[#54656F] dark:text-[#8696A0] mb-0.5">
                          {leadName}
                        </div>
                      )}

                      {/* Content with rich formatting */}
                      <RichMessageContent text={msg.text} />

                      {/* Meta Footer: Timestamp + Read Receipt Checkmarks */}
                      <div className="flex items-center justify-end gap-1 mt-1 select-none">
                        <span className="text-[10px] text-[#667781] dark:text-[#8696A0] tabular-nums font-normal">
                          {formatWhatsAppTime(msg.time)}
                        </span>
                        {!isClient && (
                          <CheckCheck className="size-3.5 text-[#53BDEB] shrink-0" title="Delivered & Read" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
      </div>

      {/* ── WhatsApp Footer Input / Quick Reply Bar ── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#F0F2F5] dark:bg-[#202C33] border-t border-[#D1D7DB] dark:border-[#222E35] shrink-0">
        <Smile className="size-5 text-[#54656F] dark:text-[#8696A0] shrink-0 cursor-pointer hover:text-foreground hidden sm:block" />
        <Paperclip className="size-5 text-[#54656F] dark:text-[#8696A0] shrink-0 cursor-pointer hover:text-foreground hidden sm:block" />

        <div className="flex-1 relative">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSendOrOpen();
              }
            }}
            placeholder={`Message ${leadName} via WhatsApp…`}
            className="w-full text-xs sm:text-sm bg-white dark:bg-[#2A3942] text-foreground dark:text-[#E9EDEF] rounded-lg px-3.5 py-2 border border-transparent focus:outline-hidden focus:border-[#008069] placeholder:text-[#8696A0]"
          />
        </div>

        <Button
          size="sm"
          onClick={handleSendOrOpen}
          className="size-9 p-0 rounded-full bg-[#008069] hover:bg-[#00705c] dark:bg-[#00A884] dark:hover:bg-[#009272] text-white shrink-0 shadow-xs"
          title={inputText.trim() ? "Send via WhatsApp Web" : "Open WhatsApp Web"}
        >
          {inputText.trim() ? <Send className="size-4" /> : <MessageCircle className="size-4.5" />}
        </Button>
      </div>
    </div>
  );
}
