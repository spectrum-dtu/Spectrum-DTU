-- At most one open revision per content item, so concurrent edits cannot fork a draft.
CREATE UNIQUE INDEX "ContentRevision_one_open_per_item"
  ON "ContentRevision" ("itemId")
  WHERE "state" IN ('DRAFT', 'AWAITING_CORE_APPROVAL', 'CHANGES_REQUESTED');

-- At most one open removal vote per target member.
CREATE UNIQUE INDEX "RemovalRequest_one_open_per_target"
  ON "RemovalRequest" ("targetUserId")
  WHERE "status" = 'OPEN';

-- OTP attempt counter can never go negative.
ALTER TABLE "EmailOtp" ADD CONSTRAINT "EmailOtp_attempts_nonneg" CHECK ("attempts" >= 0);
