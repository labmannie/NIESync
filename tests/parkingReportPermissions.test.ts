import assert from "node:assert/strict";
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

function runTests() {
  assert.equal(isChatWindowOpen(makeReport({ status: "pending" }), NOW), true);
  assert.equal(
    isChatWindowOpen(
      makeReport({ status: "chatting", created_at: new Date(NOW - 61 * 1000).toISOString() }),
      NOW
    ),
    true
  );
  assert.equal(
    isChatWindowOpen(makeReport({ status: "email_sent", phone_revealed: false }), NOW),
    true
  );
  assert.equal(
    isChatWindowOpen(makeReport({ status: "email_sent", phone_revealed: true }), NOW),
    false
  );

  assert.equal(canOwnerAcknowledgeReport(makeReport({ status: "pending" }), "owner-id"), true);
  assert.equal(canOwnerAcknowledgeReport(makeReport({ status: "email_sent" }), "owner-id"), true);
  assert.equal(canOwnerAcknowledgeReport(makeReport({ status: "resolved" }), "owner-id"), false);
  assert.equal(canOwnerAcknowledgeReport(makeReport({ status: "pending" }), "another-user"), false);

  assert.equal(canReporterResolveReport(makeReport({ status: "acknowledged" }), "reporter-id"), true);
  assert.equal(
    canReporterResolveReport(
      makeReport({ status: "email_sent", phone_revealed: true }),
      "reporter-id"
    ),
    true
  );
  assert.equal(
    canReporterResolveReport(
      makeReport({ status: "email_sent", phone_revealed: false }),
      "reporter-id"
    ),
    false
  );
  assert.equal(
    canReporterResolveReport(
      makeReport({ status: "acknowledged", reported_by: "someone-else" }),
      "reporter-id"
    ),
    false
  );

  assert.equal(
    canReporterRevealOwnerPhone(
      makeReport({
        status: "email_sent",
        created_at: new Date(NOW - 2 * 60 * 1000).toISOString(),
        email_sent_at: new Date(NOW - 60 * 1000).toISOString(),
      }),
      "reporter-id",
      NOW
    ),
    true
  );
  assert.equal(
    canReporterRevealOwnerPhone(
      makeReport({
        status: "email_sent",
        created_at: new Date(NOW - (2 * 60 * 1000 - 1000)).toISOString(),
        email_sent_at: new Date(NOW - (60 * 1000 - 1000)).toISOString(),
      }),
      "reporter-id",
      NOW
    ),
    false
  );
  assert.equal(
    canReporterRevealOwnerPhone(
      makeReport({
        status: "email_sent",
        created_at: new Date(NOW - 20 * 60 * 1000).toISOString(),
        email_sent_at: null,
      }),
      "reporter-id",
      NOW
    ),
    false
  );
  assert.equal(
    canReporterRevealOwnerPhone(
      makeReport({ status: "acknowledged", created_at: new Date(NOW - 10 * 60 * 1000).toISOString() }),
      "reporter-id",
      NOW
    ),
    false
  );

  assert.equal(
    canReporterMarkUnresolved(
      makeReport({
        status: "acknowledged",
        acknowledged_at: new Date(NOW - 5 * 60 * 1000).toISOString(),
      }),
      "reporter-id",
      NOW
    ),
    true
  );
  assert.equal(
    canReporterMarkUnresolved(
      makeReport({
        status: "acknowledged",
        acknowledged_at: new Date(NOW - (5 * 60 * 1000 - 1000)).toISOString(),
      }),
      "reporter-id",
      NOW
    ),
    false
  );
  assert.equal(
    canReporterMarkUnresolved(
      makeReport({
        status: "email_sent",
        acknowledged_at: new Date(NOW - 15 * 60 * 1000).toISOString(),
      }),
      "reporter-id",
      NOW
    ),
    false
  );
  assert.equal(
    canReporterMarkUnresolved(
      makeReport({
        status: "acknowledged",
        reported_by: "another-user",
        acknowledged_at: new Date(NOW - 15 * 60 * 1000).toISOString(),
      }),
      "reporter-id",
      NOW
    ),
    false
  );

  assert.equal(canReporterCancelReport(makeReport({ status: "pending" }), "reporter-id", NOW), true);
  assert.equal(canReporterCancelReport(makeReport({ status: "chatting" }), "reporter-id", NOW), true);
  assert.equal(
    canReporterCancelReport(
      makeReport({ status: "chatting", created_at: new Date(NOW - 61 * 1000).toISOString() }),
      "reporter-id",
      NOW
    ),
    false
  );
  assert.equal(
    canReporterCancelReport(makeReport({ status: "email_sent" }), "reporter-id", NOW),
    false
  );
  assert.equal(
    canReporterCancelReport(makeReport({ status: "pending" }), "another-user", NOW),
    false
  );

  console.log("parkingReportPermissions tests passed");
}

runTests();
