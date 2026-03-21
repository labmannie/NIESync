import { isPossiblePhoneNumber } from "react-phone-number-input";

export function normalizePhoneNumber(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  if (raw.startsWith("+")) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }

  if (digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }

  return raw;
}

export function isValidPhoneNumber(value: string) {
  const normalized = normalizePhoneNumber(value);
  if (!normalized) return false;
  if (!/^\+\d{10,15}$/.test(normalized)) return false;

  try {
    return isPossiblePhoneNumber(normalized);
  } catch {
    return false;
  }
}

type RequiredPhoneValidationOptions = {
  requiredMessage?: string;
  invalidMessage?: string;
};

export function validateRequiredPhoneNumber(
  value: string,
  options: RequiredPhoneValidationOptions = {}
) {
  const normalized = normalizePhoneNumber(value);

  if (!normalized) {
    return {
      normalizedPhone: "",
      error:
        options.requiredMessage ||
        "Phone number is required. Please enter your phone number.",
    };
  }

  if (!isValidPhoneNumber(normalized)) {
    return {
      normalizedPhone: normalized,
      error: options.invalidMessage || "Please enter a valid full phone number.",
    };
  }

  return {
    normalizedPhone: normalized,
    error: "",
  };
}
