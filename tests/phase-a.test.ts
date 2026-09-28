import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENTITLEMENT,
  buildRenderModel,
  buildSnapshots,
  groupRows,
  mapSheetToRows,
  runGenerationBatch,
  validateGroups,
  type ClockPort,
  type EntitlementStorePort,
  type EntitlementState,
  type GenerationJob,
  type GenerationPorts,
  type JobStorePort,
  type RenderPort,
  type RenderedFile,
  type ResultSinkPort,
  type ResultRow,
  type UsageEvent,
  type UsagePort,
} from "../src/core";
import {
  DEFAULT_MAPPING_OPTIONS,
  SYNTHETIC_ROWS,
  syntheticMapping,
  syntheticSettings,
} from "./fixtures/synthetic";

const CONTEXT = {
  issueDate: "2026-09-25",
  source: { sheetName: "Sheet1", headerRow: 1, rangeA1: "A1:F4" },
};

describe("Phase A — grouped rows to two quotation PDFs", () => {
  it("turns the three synthetic rows into exactly two validated quotes", () => {
    const mapped = mapSheetToRows(SYNTHETIC_ROWS, syntheticMapping(), DEFAULT_MAPPING_OPTIONS);
    const validated = validateGroups(groupRows(mapped.rows).groups);
    expect(validated).toHaveLength(2);
    expect(validated.every((group) => group.status === "ready")).toBe(true);
  });

  it("matches the plan's expected line counts and totals in the preview", () => {
    const mapped = mapSheetToRows(SYNTHETIC_ROWS, syntheticMapping(), DEFAULT_MAPPING_OPTIONS);
    const validated = validateGroups(groupRows(mapped.rows).groups);
    const snapshots = buildSnapshots(validated, syntheticSettings(), CONTEXT);

    const q1 = snapshots.find((snapshot) => snapshot.quoteId === "Q-001")!;
    const q2 = snapshots.find((snapshot) => snapshot.quoteId === "Q-002")!;

    const q1Model = buildRenderModel(q1);
    expect(q1Model.items).toHaveLength(2);
    expect(q1Model.totals[1]!.value).toBe("USD 1,800.00");

    const q2Model = buildRenderModel(q2);
    expect(q2Model.items).toHaveLength(1);
    expect(q2Model.totals[1]!.value).toBe("USD 750.00");
  });

  it("generates one file per quote through the engine", () => {
    const snapshots = buildSnapshots(
      validateGroups(groupRows(mapSheetToRows(SYNTHETIC_ROWS, syntheticMapping(), DEFAULT_MAPPING_OPTIONS).rows).groups),
      syntheticSettings(),
      CONTEXT,
    );

    const files: string[] = [];
    const render: RenderPort = {
      render(snapshot): RenderedFile {
        files.push(`${snapshot.quoteId}.pdf`);
        return {
          fileId: `file-${snapshot.quoteId}`,
          fileUrl: `https://drive.example/${snapshot.quoteId}`,
          name: `${snapshot.quoteId}.pdf`,
        };
      },
    };
    let job: GenerationJob | null = null;
    const jobs: JobStorePort = {
      load: () => job,
      save: (next) => {
        job = next;
      },
    };
    let state: EntitlementState = { ...DEFAULT_ENTITLEMENT };
    const entitlements: EntitlementStorePort = {
      load: () => state,
      save: (next) => {
        state = next;
      },
    };
    const events: UsageEvent[] = [];
    const usage: UsagePort = { record: (event) => events.push(event) };
    const clock: ClockPort = { nowIso: () => "2026-09-25T00:00:00.000Z", todayIso: () => "2026-09-25" };
    const written: ResultRow[] = [];
    const results: ResultSinkPort = { write: (rows) => written.push(...rows) };
    const ports: GenerationPorts = { render, jobs, entitlements, usage, clock, results };

    const outcome = runGenerationBatch(
      { spreadsheetId: "ss1", sheetName: "Sheet1", rangeA1: "A1:F4", snapshots, outputFolderId: null },
      ports,
      10,
    );

    expect(files).toEqual(["Q-001.pdf", "Q-002.pdf"]);
    expect(outcome.job.status).toBe("completed");
    expect(written.map((row) => row.fileUrl)).toEqual([
      "https://drive.example/Q-001",
      "https://drive.example/Q-002",
    ]);
  });
});
