import { describe, expect, it } from "vitest";
import {
  createJob,
  nextStatus,
  parseStoredJob,
  planGeneration,
  progressOf,
  recordResult,
  serializeJob,
  type GenerationJob,
  type QuoteJobResult,
} from "./jobs";
import { buildSnapshots } from "./snapshot";
import { buildSynthetic, syntheticSettings } from "../../tests/fixtures/synthetic";

const CONTEXT = {
  issueDate: "2026-09-25",
  source: { sheetName: "Sheet1", headerRow: 1, rangeA1: "A1:F4" },
};

function snapshots(terms?: string) {
  const settings = syntheticSettings();
  if (terms) settings.business.terms = terms;
  const { groups } = buildSynthetic();
  return buildSnapshots(groups, settings, CONTEXT);
}

function createdResult(quoteId: string, contentHash: string, at = "2026-09-25T00:00:00.000Z"): QuoteJobResult {
  return {
    quoteId,
    status: "created",
    contentHash,
    templateVersion: "quote-layout-v1",
    fileId: `file-${quoteId}`,
    fileUrl: `https://drive.example/${quoteId}`,
    name: `${quoteId}.pdf`,
    message: null,
    at,
  };
}

describe("jobs", () => {
  it("reuses a result only when the content hash and template match", () => {
    const snaps = snapshots();
    const job = createJob({
      spreadsheetId: "ss1",
      sheetName: "Sheet1",
      rangeA1: "A1:F4",
      requestedQuoteIds: snaps.map((snapshot) => snapshot.quoteId),
      now: "2026-09-25T00:00:00.000Z",
    });
    const withResult = recordResult(job, createdResult("Q-001", snaps[0]!.contentHash));

    const same = planGeneration(withResult, snaps);
    expect(same.reuse.map((result) => result.quoteId)).toEqual(["Q-001"]);
    expect(same.generate.map((snapshot) => snapshot.quoteId)).toEqual(["Q-002"]);

    const changed = snapshots("Changed terms");
    const changedPlan = planGeneration(withResult, changed);
    expect(changedPlan.generate.map((snapshot) => snapshot.quoteId)).toEqual(["Q-001", "Q-002"]);
  });

  it("does not reuse failed results", () => {
    const snaps = snapshots();
    const job = createJob({
      spreadsheetId: "ss1",
      sheetName: "Sheet1",
      rangeA1: null,
      requestedQuoteIds: ["Q-001"],
      now: "2026-09-25T00:00:00.000Z",
    });
    const failed: QuoteJobResult = {
      ...createdResult("Q-001", snaps[0]!.contentHash),
      status: "failed",
      fileId: null,
      fileUrl: null,
    };
    expect(planGeneration(recordResult(job, failed), [snaps[0]!]).generate).toHaveLength(1);
  });

  it("derives completed, partial and failed statuses from results", () => {
    let job: GenerationJob = createJob({
      spreadsheetId: "ss1",
      sheetName: "Sheet1",
      rangeA1: null,
      requestedQuoteIds: ["Q-001", "Q-002"],
      now: "2026-09-25T00:00:00.000Z",
    });
    expect(nextStatus(job, job.requestedQuoteIds)).toBe("running");

    job = recordResult(job, createdResult("Q-001", "h1"));
    job = recordResult(job, { ...createdResult("Q-002", "h2"), status: "failed" });
    expect(nextStatus(job, job.requestedQuoteIds)).toBe("partial");
    expect(progressOf(job, job.requestedQuoteIds)).toMatchObject({
      done: 2,
      total: 2,
      created: 1,
      failed: 1,
    });
  });

  it("round-trips through storage", () => {
    const job = createJob({
      spreadsheetId: "ss1",
      sheetName: "Sheet1",
      rangeA1: "A1:F4",
      requestedQuoteIds: ["Q-001"],
      now: "2026-09-25T00:00:00.000Z",
    });
    const parsed = parseStoredJob(serializeJob(job));
    expect(parsed).toMatchObject({ id: job.id, spreadsheetId: "ss1", rangeA1: "A1:F4" });
    expect(parseStoredJob("{not json")).toBeNull();
  });
});
