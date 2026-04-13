import Filter from "bad-words";

const profanityFilter = new Filter();

export const CHAT_MODERATION_BLOCK_MESSAGE =
  "Message blocked. Please avoid abusive or swear words and keep chat respectful.";

function normalizeChatMessage(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function sanitizeChatMessage(value: string) {
  return normalizeChatMessage(value);
}

export function hasProfanity(value: string) {
  const normalized = normalizeChatMessage(value);
  if (!normalized) return false;
  return profanityFilter.isProfane(normalized);
}

