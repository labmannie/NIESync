import { describe, it, expect } from "vitest";
import { getOwnerDisplayName, normalizeBaseUrl } from "../lib/parkingEscalation";

describe("getOwnerDisplayName", () => {
  it("prefers full_name when present", () => {
    expect(getOwnerDisplayName({ full_name: "Jane Doe", first_name: "J", last_name: "D" })).toBe(
      "Jane Doe"
    );
  });

  it("falls back to first + last name", () => {
    expect(getOwnerDisplayName({ first_name: "Jane", last_name: "Doe" })).toBe("Jane Doe");
  });

  it("falls back to a generic label when no name is available", () => {
    expect(getOwnerDisplayName({})).toBe("Vehicle Owner");
    expect(getOwnerDisplayName(null)).toBe("Vehicle Owner");
  });

  it("trims whitespace-only names down to the generic label", () => {
    expect(getOwnerDisplayName({ first_name: "  ", last_name: "  " })).toBe("Vehicle Owner");
  });
});

describe("normalizeBaseUrl", () => {
  it("leaves an https URL unchanged", () => {
    expect(normalizeBaseUrl("https://niesync.vercel.app")).toBe("https://niesync.vercel.app");
  });

  it("strips a trailing slash", () => {
    expect(normalizeBaseUrl("https://niesync.vercel.app/")).toBe("https://niesync.vercel.app");
  });

  it("upgrades a plain http production URL to https (resolve links must not be sent over http)", () => {
    expect(normalizeBaseUrl("http://niesync.vercel.app")).toBe("https://niesync.vercel.app");
  });

  it("leaves localhost on http for local development", () => {
    expect(normalizeBaseUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("leaves 127.0.0.1 on http for local development", () => {
    expect(normalizeBaseUrl("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
  });

  it("returns an empty string for empty input", () => {
    expect(normalizeBaseUrl("")).toBe("");
    expect(normalizeBaseUrl("   ")).toBe("");
  });
});
