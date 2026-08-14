// The client deletion copy is dependency-free strings, so vitest runs it from
// the client tree (same pattern as voice-send-helper.test.ts). This is the
// backstop that account-deletion UI copy stays truthful about legal retention.
import { describe, it, expect } from "vitest";
import {
  DELETION_CONFIRM_BODY,
  DELETION_DONE_BODY,
  DELETION_DONE_APPLE_MANUAL_SUFFIX,
} from "../../client/src/lib/deletion-copy";

describe("account-deletion copy is truthful about retention", () => {
  it("does not claim ALL data/records are deleted", () => {
    for (const copy of [DELETION_CONFIRM_BODY, DELETION_DONE_BODY]) {
      expect(copy).not.toMatch(/all (associated )?(your )?(data|records)/i);
      expect(copy).not.toMatch(/everything (is|will be) deleted/i);
    }
  });

  it("discloses the retained legal/safety records", () => {
    expect(DELETION_CONFIRM_BODY).toMatch(/consent/i);
    expect(DELETION_CONFIRM_BODY).toMatch(/terms/i);
    expect(DELETION_CONFIRM_BODY).toMatch(/safety report|reports/i);
    expect(DELETION_CONFIRM_BODY).toMatch(/retain|kept|limited period/i);
  });

  it("the completion copy still acknowledges retained records", () => {
    expect(DELETION_DONE_BODY).toMatch(/legal|safety|retention|retained|kept/i);
  });

  it("the Apple-manual suffix gives real steps, never a false 'revoked'", () => {
    expect(DELETION_DONE_APPLE_MANUAL_SUFFIX).toMatch(/Stop Using Apple ID/i);
    expect(DELETION_DONE_APPLE_MANUAL_SUFFIX).not.toMatch(/revoked/i);
  });
});
