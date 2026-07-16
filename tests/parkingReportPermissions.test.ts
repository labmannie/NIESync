import { describe, it, expect } from "vitest";
import {
  canReporterCancelReport,
  canOwnerAcknowledgeReport,
  canReporterMarkUnresolved,
  canReporterResolveReport,
  canReporterRevealOwnerPhone,
  isChatWindowOpen,
  type ParkingReportAccessRow,
} from "../lib/parkingReportPermissions";

const NOW = Date.UTC(2026, 2, 22, 10, 0, 0);

function makeReport(overrides: Partial<ParkingReportAccessRow> = {}): ParkingReportAccessRow {
  return {
    reported_by: "reporter-id",
    matched_owner_id: "owner-id",
    status: "pending",
    phone_revealed: false,
    created_at: new Date(NOW - 30 * 1000).toISOString(),
    email_sent_at: null,
    ...overrides,
  };
}

describe("isChatWindowOpen", () => {
  it("is open while pending", () => {
    expect(isChatWindowOpen(makeReport({ status: "pending" }), NOW)).toBe(true);
  });

  it("is open while chatting, even after a minute has passed", () => {
    expect(
      isChatWindowOpen(
        makeReport({ status: "chatting", created_at: new Date(NOW - 61 * 1000).toISOString() }),
        NOW
      )
    ).toBe(true);
  });

  it("is open once email is sent but the phone hasn't been revealed yet", () => {
    expect(isChatWindowOpen(makeReport({ status: "email_sent", phone_revealed: false }), NOW)).toBe(true);
  });

  it("closes once the phone has been revealed", () => {
    expect(isChatWindowOpen(makeReport({ status: "email_sent", phone_revealed: true }), NOW)).toBe(false);
  });
});

describe("canOwnerAcknowledgeReport", () => {
  it("lets the matched owner acknowledge a pending report", () => {
    expect(canOwnerAcknowledgeReport(makeReport({ status: "pending" }), "owner-id")).toBe(true);
  });

  it("lets the matched owner acknowledge after the email has been sent", () => {
    expect(canOwnerAcknowledgeReport(makeReport({ status: "email_sent" }), "owner-id")).toBe(true);
  });

  it("does not allow acknowledging an already-resolved report", () => {
    expect(canOwnerAcknowledgeReport(makeReport({ status: "resolved" }), "owner-id")).toBe(false);
  });

  it("does not allow a non-owner to acknowledge", () => {
    expect(canOwnerAcknowledgeReport(makeReport({ status: "pending" }), "another-user")).toBe(false);
  });
});

describe("canReporterResolveReport", () => {
  it("lets the reporter resolve an acknowledged report", () => {
    expect(canReporterResolveReport(makeReport({ status: "acknowledged" }), "reporter-id")).toBe(true);
  });

  it("lets the reporter resolve once the phone has been revealed", () => {
    expect(
      canReporterResolveReport(makeReport({ status: "email_sent", phone_revealed: true }), "reporter-id")
    ).toBe(true);
  });

  it("does not allow resolving before the phone is revealed", () => {
    expect(
      canReporterResolveReport(makeReport({ status: "email_sent", phone_revealed: false }), "reporter-id")
    ).toBe(false);
  });

  it("does not allow a different user to resolve someone else's report", () => {
    expect(
      canReporterResolveReport(makeReport({ status: "acknowledged", reported_by: "someone-else" }), "reporter-id")
    ).toBe(false);
  });
});

describe("canReporterRevealOwnerPhone", () => {
  it("allows revealing once at least 2 minutes have passed since the email was sent", () => {
    expect(
      canReporterRevealOwnerPhone(
        makeReport({
          status: "email_sent",
          created_at: new Date(NOW - 2 * 60 * 1000).toISOString(),
          email_sent_at: new Date(NOW - 60 * 1000).toISOString(),
        }),
        "reporter-id",
        NOW
      )
    ).toBe(true);
  });

  it("does not allow revealing a second before the 2 minute mark", () => {
    expect(
      canReporterRevealOwnerPhone(
        makeReport({
          status: "email_sent",
          created_at: new Date(NOW - (2 * 60 * 1000 - 1000)).toISOString(),
          email_sent_at: new Date(NOW - (60 * 1000 - 1000)).toISOString(),
        }),
        "reporter-id",
        NOW
      )
    ).toBe(false);
  });

  it("does not allow revealing if no email has been sent", () => {
    expect(
      canReporterRevealOwnerPhone(
        makeReport({
          status: "email_sent",
          created_at: new Date(NOW - 20 * 60 * 1000).toISOString(),
          email_sent_at: null,
        }),
        "reporter-id",
        NOW
      )
    ).toBe(false);
  });

  it("does not allow revealing outside of the email_sent status", () => {
    expect(
      canReporterRevealOwnerPhone(
        makeReport({ status: "acknowledged", created_at: new Date(NOW - 10 * 60 * 1000).toISOString() }),
        "reporter-id",
        NOW
      )
    ).toBe(false);
  });
});

describe("canReporterMarkUnresolved", () => {
  it("allows marking unresolved 5+ minutes after acknowledgement", () => {
    expect(
      canReporterMarkUnresolved(
        makeReport({ status: "acknowledged", acknowledged_at: new Date(NOW - 5 * 60 * 1000).toISOString() }),
        "reporter-id",
        NOW
      )
    ).toBe(true);
  });

  it("does not allow marking unresolved a second before the 5 minute mark", () => {
    expect(
      canReporterMarkUnresolved(
        makeReport({
          status: "acknowledged",
          acknowledged_at: new Date(NOW - (5 * 60 * 1000 - 1000)).toISOString(),
        }),
        "reporter-id",
        NOW
      )
    ).toBe(false);
  });

  it("does not allow marking unresolved outside of the acknowledged status", () => {
    expect(
      canReporterMarkUnresolved(
        makeReport({ status: "email_sent", acknowledged_at: new Date(NOW - 15 * 60 * 1000).toISOString() }),
        "reporter-id",
        NOW
      )
    ).toBe(false);
  });

  it("does not allow a different user to mark someone else's report unresolved", () => {
    expect(
      canReporterMarkUnresolved(
        makeReport({
          status: "acknowledged",
          reported_by: "another-user",
          acknowledged_at: new Date(NOW - 15 * 60 * 1000).toISOString(),
        }),
        "reporter-id",
        NOW
      )
    ).toBe(false);
  });
});

describe("canReporterCancelReport", () => {
  it("allows cancelling a pending report", () => {
    expect(canReporterCancelReport(makeReport({ status: "pending" }), "reporter-id", NOW)).toBe(true);
  });

  it("allows cancelling while chatting", () => {
    expect(canReporterCancelReport(makeReport({ status: "chatting" }), "reporter-id", NOW)).toBe(true);
  });

  it("does not allow cancelling once the chat window has closed", () => {
    expect(
      canReporterCancelReport(
        makeReport({ status: "chatting", created_at: new Date(NOW - 61 * 1000).toISOString() }),
        "reporter-id",
        NOW
      )
    ).toBe(false);
  });

  it("does not allow cancelling once email has been sent", () => {
    expect(canReporterCancelReport(makeReport({ status: "email_sent" }), "reporter-id", NOW)).toBe(false);
  });

  it("does not allow a different user to cancel someone else's report", () => {
    expect(canReporterCancelReport(makeReport({ status: "pending" }), "another-user", NOW)).toBe(false);
  });
});
