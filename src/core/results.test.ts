import { describe, expect, it } from "vitest";
import {
  RESULTS_TAB_BASE_NAME,
  buildResultRows,
  collisionSafeTabName,
} from "./results";
import type { QuoteSnapshot } from "./snapshot";
import type { QuoteJobResult } from "./jobs";

function snapshot(quoteId: string, customer: string, itemCount: number): QuoteSnapshot {
  return {
    quoteId,
    customer,
    items: Array.from({ length: itemCount }, (_, index) => ({ index: index + 1 })),
  } as unknown as QuoteSnapshot;
}

function result(quoteId: string, status: QuoteJobResult["status"]): QuoteJobResult {
  return {
    quoteId,
    status,
    contentHash: "h",
    templateVersion: "v1",
    fileId: status === "created" || status === "existing" ? `f-${quoteId}` : null,
    fileUrl: status === "created" ? `https://drive.example/${quoteId}` : null,
    name: `${quoteId}.pdf`,
    message: status === "failed" ? "boom" : null,
    at: "2026-09-25T00:00:00.000Z",
  };
}

describe("results", () => {
  it("uses the base tab name when it is free", () => {
    expect(collisionSafeTabName(["Sheet1", "Quotes"])).toBe(RESULTS_TAB_BASE_NAME);
  });

  it("never collides with an existing user tab", () => {
    expect(collisionSafeTabName([RESULTS_TAB_BASE_NAME])).toBe(`${RESULTS_TAB_BASE_NAME} (2)`);
    expect(collisionSafeTabName([RESULTS_TAB_BASE_NAME, `${RESULTS_TAB_BASE_NAME} (2)`])).toBe(
      `${RESULTS_TAB_BASE_NAME} (3)`,
    );
  });

  it("matches tab names case-insensitively", () => {
    expect(collisionSafeTabName([RESULTS_TAB_BASE_NAME.toLowerCase()])).toBe(
      `${RESULTS_TAB_BASE_NAME} (2)`,
    );
  });

  it("builds rows from snapshots and results", () => {
    const rows = buildResultRows([
      { snapshot: snapshot("Q-001", "Alpha", 2), result: result("Q-001", "created") },
      { snapshot: snapshot("Q-002", "Beta", 1), result: result("Q-002", "failed") },
    ]);
    expect(rows).toEqual([
      {
        quoteId: "Q-001",
        customer: "Alpha",
        itemCount: 2,
        generatedAt: "2026-09-25T00:00:00.000Z",
        status: "created",
        fileUrl: "https://drive.example/Q-001",
        message: null,
      },
      {
        quoteId: "Q-002",
        customer: "Beta",
        itemCount: 1,
        generatedAt: "2026-09-25T00:00:00.000Z",
        status: "failed",
        fileUrl: null,
        message: "boom",
      },
    ]);
  });
});
