const STANDARD_OWNER_PLATE_REGEX = /^[A-Z]{2}-\d{1,2}-[A-Z]{1,3}-\d{4}$/;
const BH_SERIES_OWNER_PLATE_REGEX = /^\d{2}-BH-\d{4}-[A-HJ-NP-Z]{1,2}$/;
const IN_SERIES_OWNER_PLATE_REGEX = /^\d{2}-IN-[A-Z]{2}-\d{4}$/;
const VA_SERIES_OWNER_PLATE_REGEX = /^[A-Z]{2}-VA-[A-Z]{2}-\d{4}$/;

const ALNUM_REGEX = /^[A-Z0-9]$/;
const OCR_NUMERIC_FIX_REGEX = /[OIQDL]/g;

const PLATE_FORMAT_HELP_TEXT =
  "Use a valid Indian plate format (for example: KA-09-AB-1234, 22-BH-1234-AA, 21-IN-AB-1234, KA-VA-AA-1234).";

function stripToAlnumUpper(value: string) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeNumericSegment(value: string) {
  return String(value || "").replace(OCR_NUMERIC_FIX_REGEX, (char) => {
    if (char === "I" || char === "L") return "1";
    if (char === "Q" || char === "D") return "0";
    return "0";
  });
}

function normalizeAlphaSegment(value: string) {
  return String(value || "")
    .replace(/0/g, "O")
    .replace(/1/g, "I")
    .replace(/2/g, "Z")
    .replace(/5/g, "S")
    .replace(/8/g, "B");
}

function formatFromTokens(
  raw: string,
  tokens: Array<{ kind: "letters" | "digits"; max: number }>
) {
  let index = 0;
  const segments: string[] = [];

  for (const token of tokens) {
    let segment = "";

    while (index < raw.length && segment.length < token.max) {
      const char = raw[index];
      const isDigit = /\d/.test(char);

      if (token.kind === "digits" ? isDigit : ALNUM_REGEX.test(char) && !isDigit) {
        segment += char;
        index += 1;
      } else {
        break;
      }
    }

    if (segment) {
      segments.push(segment);
    }

    if (index >= raw.length) {
      break;
    }
  }

  return segments.join("-");
}

function formatStandardOwnerPlate(raw: string) {
  return formatFromTokens(raw, [
    { kind: "letters", max: 2 },
    { kind: "digits", max: 2 },
    { kind: "letters", max: 3 },
    { kind: "digits", max: 4 },
  ]);
}

function formatBhOwnerPlate(raw: string) {
  return formatFromTokens(raw, [
    { kind: "digits", max: 2 },
    { kind: "letters", max: 2 },
    { kind: "digits", max: 4 },
    { kind: "letters", max: 2 },
  ]);
}

function formatInOwnerPlate(raw: string) {
  return formatFromTokens(raw, [
    { kind: "digits", max: 2 },
    { kind: "letters", max: 2 },
    { kind: "letters", max: 2 },
    { kind: "digits", max: 4 },
  ]);
}

function formatVaOwnerPlate(raw: string) {
  return formatFromTokens(raw, [
    { kind: "letters", max: 2 },
    { kind: "letters", max: 2 },
    { kind: "letters", max: 2 },
    { kind: "digits", max: 4 },
  ]);
}

function looksLikeBh(raw: string) {
  if (!/^\d/.test(raw)) return false;
  const marker = raw.slice(2, 4);
  return marker.length === 0 || "BH".startsWith(marker);
}

function looksLikeIn(raw: string) {
  if (!/^\d/.test(raw)) return false;
  const marker = raw.slice(2, 4);
  return marker.length > 0 && "IN".startsWith(marker);
}

function looksLikeVa(raw: string) {
  if (!/^[A-Z]/.test(raw)) return false;
  const marker = raw.slice(2, 4);
  return marker.length > 0 && "VA".startsWith(marker);
}

export function normalizeVehiclePlate(value: string) {
  return stripToAlnumUpper(value);
}

export function formatOwnerVehiclePlateInput(value: string) {
  const normalized = stripToAlnumUpper(value).slice(0, 14);
  if (!normalized) return "";

  if (looksLikeIn(normalized)) {
    return formatInOwnerPlate(normalized);
  }

  if (looksLikeBh(normalized)) {
    return formatBhOwnerPlate(normalized);
  }

  if (looksLikeVa(normalized)) {
    return formatVaOwnerPlate(normalized);
  }

  return formatStandardOwnerPlate(normalized);
}

export function formatParkingReportPlateInput(value: string) {
  const normalized = stripToAlnumUpper(value).slice(0, 14);
  if (!normalized) return "";

  const ownerLike = formatOwnerVehiclePlateInput(normalized);
  const ownerValidation = validateOwnerVehiclePlate(ownerLike, { required: false });
  if (!ownerValidation.error && ownerValidation.plate) {
    return ownerValidation.plate;
  }

  return normalized;
}

export function extractKaPlateFromText(value: string) {
  const normalized = stripToAlnumUpper(value);
  if (!normalized) {
    return {
      plate: "",
      normalizedPlate: "",
      source: "",
    };
  }

  const kaMatch = normalized.match(/KA([0-9OIQLD]{1,2})([A-Z0-9]{1,3})([0-9OIQLD]{4})/);
  if (!kaMatch) {
    return {
      plate: "",
      normalizedPlate: "",
      source: normalized,
    };
  }

  const areaCode = normalizeNumericSegment(kaMatch[1]);
  const series = normalizeAlphaSegment(kaMatch[2]).replace(/[^A-Z]/g, "").slice(0, 3);
  const digits = normalizeNumericSegment(kaMatch[3]);

  if (!areaCode || !series || digits.length !== 4) {
    return {
      plate: "",
      normalizedPlate: "",
      source: normalized,
    };
  }

  const plate = `KA-${areaCode}-${series}-${digits}`;
  return {
    plate,
    normalizedPlate: stripToAlnumUpper(plate),
    source: normalized,
  };
}

function normalizeForStrictOwnerValidation(value: string) {
  const normalized = stripToAlnumUpper(value);
  if (!normalized) return "";

  let match = normalized.match(/^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{4})$/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}-${match[4]}`;

  match = normalized.match(/^(\d{2})BH(\d{4})([A-HJ-NP-Z]{1,2})$/);
  if (match) return `${match[1]}-BH-${match[2]}-${match[3]}`;

  match = normalized.match(/^(\d{2})IN([A-Z]{2})(\d{4})$/);
  if (match) return `${match[1]}-IN-${match[2]}-${match[3]}`;

  match = normalized.match(/^([A-Z]{2})VA([A-Z]{2})(\d{4})$/);
  if (match) return `${match[1]}-VA-${match[2]}-${match[3]}`;

  return "";
}

export function isStrictOwnerVehiclePlate(value: string) {
  const candidate = normalizeForStrictOwnerValidation(value);
  if (!candidate) return false;

  return (
    STANDARD_OWNER_PLATE_REGEX.test(candidate) ||
    BH_SERIES_OWNER_PLATE_REGEX.test(candidate) ||
    IN_SERIES_OWNER_PLATE_REGEX.test(candidate) ||
    VA_SERIES_OWNER_PLATE_REGEX.test(candidate)
  );
}

type OwnerValidationOptions = {
  required?: boolean;
  requiredMessage?: string;
  invalidMessage?: string;
};

export function validateOwnerVehiclePlate(
  value: string,
  options: OwnerValidationOptions = {}
) {
  const required = options.required !== false;
  const normalized = normalizeVehiclePlate(value);

  if (!normalized) {
    if (!required) {
      return { plate: "", normalizedPlate: "", error: "" };
    }

    return {
      plate: "",
      normalizedPlate: "",
      error:
        options.requiredMessage || "Vehicle number is required for this selection.",
    };
  }

  const canonicalPlate = normalizeForStrictOwnerValidation(normalized);
  if (!canonicalPlate || !isStrictOwnerVehiclePlate(canonicalPlate)) {
    return {
      plate: "",
      normalizedPlate: normalized,
      error: options.invalidMessage || PLATE_FORMAT_HELP_TEXT,
    };
  }

  return {
    plate: canonicalPlate,
    normalizedPlate: normalizeVehiclePlate(canonicalPlate),
    error: "",
  };
}

type ReportValidationOptions = {
  requiredMessage?: string;
  invalidMessage?: string;
};

export function validateParkingReportPlate(
  value: string,
  options: ReportValidationOptions = {}
) {
  const normalized = normalizeVehiclePlate(value);
  if (!normalized) {
    return {
      plate: "",
      normalizedPlate: "",
      isStrictOwnerMatch: false,
      error: options.requiredMessage || "Vehicle number is required.",
    };
  }

  const ownerValidation = validateOwnerVehiclePlate(value, {
    required: true,
    requiredMessage: options.requiredMessage || "Vehicle number is required.",
    invalidMessage: options.invalidMessage || PLATE_FORMAT_HELP_TEXT,
  });
  if (ownerValidation.error) {
    return {
      plate: "",
      normalizedPlate: normalized,
      isStrictOwnerMatch: false,
      error: ownerValidation.error,
    };
  }

  return {
    plate: ownerValidation.plate,
    normalizedPlate: ownerValidation.normalizedPlate,
    isStrictOwnerMatch: true,
    error: "",
  };
}

type SubmissionPlateNormalizationInput = {
  manualPlate: string;
  ocrRawText?: string | null;
};

export function normalizeParkingReportPlateForSubmission(
  input: SubmissionPlateNormalizationInput
) {
  const ocrRawText = String(input.ocrRawText || "");
  const manualPlate = String(input.manualPlate || "");

  const extractedFromManual = extractKaPlateFromText(manualPlate);
  if (extractedFromManual.plate) {
    return {
      plate: extractedFromManual.plate,
      normalizedPlate: extractedFromManual.normalizedPlate,
      rawOcrText: ocrRawText,
      source: "manual-ka" as const,
      error: "",
    };
  }

  const extractedFromOcr = extractKaPlateFromText(ocrRawText);
  if (extractedFromOcr.plate) {
    return {
      plate: extractedFromOcr.plate,
      normalizedPlate: extractedFromOcr.normalizedPlate,
      rawOcrText: ocrRawText,
      source: "ocr-ka" as const,
      error: "",
    };
  }

  const combinedInput = manualPlate || ocrRawText;
  const parsed = validateParkingReportPlate(combinedInput);
  if (parsed.error) {
    return {
      plate: "",
      normalizedPlate: "",
      rawOcrText: ocrRawText,
      source: "invalid" as const,
      error: parsed.error,
    };
  }

  return {
    plate: parsed.plate,
    normalizedPlate: parsed.normalizedPlate,
    rawOcrText: ocrRawText,
    source: "fallback" as const,
    error: "",
  };
}

export function getOwnerVehiclePlateFormatsHint() {
  return PLATE_FORMAT_HELP_TEXT;
}

export {
  STANDARD_OWNER_PLATE_REGEX,
  BH_SERIES_OWNER_PLATE_REGEX,
  IN_SERIES_OWNER_PLATE_REGEX,
  VA_SERIES_OWNER_PLATE_REGEX,
};
