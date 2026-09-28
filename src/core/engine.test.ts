import { describe, expect, it } from "vitest";
import { DEFAULT_ENTITLEMENT, type EntitlementState } from "./entitlements";
import { runGenerationBatch, type GenerationRequest } from "./engine";
import type {
  ClockPort,
  EntitlementStorePort,
  GenerationPorts,
  JobStorePort,
  RenderedFile,
  RenderPort,
  ResultSinkPort,
  UsagePort,
} from "./ports";
import { buildSnapshots } from "./snapshot";
import type { QuoteRenderModel } from "./render-model";
import type { QuoteSnapshot } from "./snapshot";
import type { GenerationJob } from "./jobs";
import type { ResultRow } from "./results";
import type { UsageEvent } from "./usage";
import { buildSynthetic, syntheticSettings } from "../../tests/fixtures/synthetic";

const CONTEXT = {
  issueDate: "2026-09-25",
  source: { sheetName: "Sheet1", headerRow: 1, rangeA1: "A1:F4" },
};

class MemoryJobStore implements JobStorePort {
  job: GenerationJob | null = null;
  load() {
    return this.job;
  }
  save(job: GenerationJob) {
    this.job = job;
  }
}

class MemoryEntitlementStore implements EntitlementStorePort {
  state: EntitlementState = { ...DEFAULT_ENTITLEMENT };
  load() {
    return this.state;
  }
  save(state: EntitlementState) {
    this.state = state;
  }
}

class FakeRenderer implements RenderPort {
  calls: string[] = [];
  failFor = new Set<string>();
  render(snapshot: QuoteSnapshot, _model: QuoteRenderModel, _folder: string | null): RenderedFile {
    if (this.failFor.has(snapshot.quoteId)) {
      throw new Error(`render failed for ${snapshot.quoteId}`);
    }
    this.calls.push(snapshot.quoteId);
    return {
      fileId: `file-${snapshot.quoteId}`,
      fileUrl: `https://drive.example/${snapshot.quoteId}`,
      name: `${snapshot.quoteId}.pdf`,
    };
  }
}

class FakeUsage implements UsagePort {
  events: UsageEvent[] = [];
  record(event: UsageEvent) {
    this.events.push(event);
  }
}

class FixedClock implements ClockPort {
  nowIso() {
    return "2026-09-25T00:00:00.000Z";
  }
  todayIso() {
    return "2026-09-25";
  }
}

class FakeResults implements ResultSinkPort {
  rows: ResultRow[] = [];
  write(rows: ResultRow[]) {
    this.rows.push(...rows);
  }
}

interface Harness {
  ports: GenerationPorts;
  renderer: FakeRenderer;
  jobs: MemoryJobStore;
  entitlements: MemoryEntitlementStore;
  usage: FakeUsage;
  results: FakeResults;
}

function harness(): Harness {
  const renderer = new FakeRenderer();
  const jobs = new MemoryJobStore();
  const entitlements = new MemoryEntitlementStore();
  const usage = new FakeUsage();
  const results = new FakeResults();
  return {
    renderer,
    jobs,
    entitlements,
    usage,
    results,
    ports: { render: renderer, jobs, entitlements, usage, clock: new FixedClock(), results },
  };
}

function request(terms?: string): GenerationRequest {
  const settings = syntheticSettings();
  if (terms) settings.business.terms = terms;
  const { groups } = buildSynthetic();
  return {
    spreadsheetId: "ss1",
    sheetName: "Sheet1",
    rangeA1: "A1:F4",
    snapshots: buildSnapshots(groups, settings, CONTEXT),
    outputFolderId: "folder-1",
  };
}

function requestFor(quoteIds: string[]): GenerationRequest {
  const { groups } = buildSynthetic();
  const all = buildSnapshots(groups, syntheticSettings(), CONTEXT);
  return {
    spreadsheetId: "ss1",
    sheetName: "Sheet1",
    rangeA1: "A1:F4",
    snapshots: all.filter((snapshot) => quoteIds.includes(snapshot.quoteId)),
    outputFolderId: "folder-1",
  };
}

describe("runGenerationBatch", () => {
  it("creates one PDF per quote and completes the job", () => {
    const h = harness();
    const outcome = runGenerationBatch(request(), h.ports, 10);

    expect(h.renderer.calls).toEqual(["Q-001", "Q-002"]);
    expect(outcome.results.map((result) => result.status)).toEqual(["created", "created"]);
    expect(outcome.job.status).toBe("completed");
    expect(outcome.entitlement.freeUsed).toBe(2);
    expect(outcome.generatedThisBatch).toBe(2);
    expect(outcome.remainingToGenerate).toBe(0);
  });

  it("reuses existing files on retry without consuming allowance", () => {
    const h = harness();
    runGenerationBatch(request(), h.ports, 10);
    const retry = runGenerationBatch(request(), h.ports, 10);

    expect(h.renderer.calls).toEqual(["Q-001", "Q-002"]);
    expect(retry.results.every((result) => result.status === "existing")).toBe(true);
    expect(retry.entitlement.freeUsed).toBe(2);
  });

  it("resumes in bounded batches", () => {
    const h = harness();
    const first = runGenerationBatch(request(), h.ports, 1);
    expect(first.generatedThisBatch).toBe(1);
    expect(first.remainingToGenerate).toBe(1);
    expect(first.job.status).toBe("running");

    const second = runGenerationBatch(request(), h.ports, 1);
    expect(second.generatedThisBatch).toBe(1);
    expect(second.remainingToGenerate).toBe(0);
    expect(second.job.status).toBe("completed");
    expect(h.renderer.calls).toEqual(["Q-001", "Q-002"]);
  });

  it("records a failure without aborting the batch and without consuming allowance", () => {
    const h = harness();
    h.renderer.failFor.add("Q-001");
    const outcome = runGenerationBatch(request(), h.ports, 10);

    expect(outcome.results.map((result) => result.status)).toEqual(["failed", "created"]);
    expect(outcome.job.status).toBe("partial");
    expect(outcome.entitlement.freeUsed).toBe(1);
  });

  it("blocks quotes explicitly once the free allowance is spent", () => {
    const h = harness();
    h.entitlements.state = { ...DEFAULT_ENTITLEMENT, freeUsed: 5 };
    const outcome = runGenerationBatch(request(), h.ports, 10);

    expect(outcome.results.map((result) => result.status)).toEqual(["skipped", "skipped"]);
    expect(outcome.allowance.reason).toBe("free_allowance_exhausted");
    expect(h.renderer.calls).toEqual([]);
  });

  it("regenerates when the visible document changes", () => {
    const h = harness();
    runGenerationBatch(request(), h.ports, 10);
    const changed = runGenerationBatch(request("Updated terms"), h.ports, 10);

    expect(changed.results.map((result) => result.status)).toEqual(["created", "created"]);
    expect(h.renderer.calls).toEqual(["Q-001", "Q-002", "Q-001", "Q-002"]);
    expect(changed.entitlement.freeUsed).toBe(4);
  });

  it("writes content-free result rows to the results tab", () => {
    const h = harness();
    runGenerationBatch(request(), h.ports, 10);
    expect(h.results.rows.map((row) => row.quoteId)).toEqual(["Q-001", "Q-002"]);
    expect(h.results.rows[0]).toMatchObject({ status: "created", itemCount: 2 });
    expect(h.results.rows[0]!.fileUrl).toContain("Q-001");
  });

  it("emits only content-free usage events", () => {
    const h = harness();
    runGenerationBatch(request(), h.ports, 10);
    const names = h.usage.events.map((event) => event.name);
    expect(names).toContain("quote_created");
    expect(names).toContain("generation_completed");
    for (const event of h.usage.events) {
      expect(Object.keys(event).sort()).toEqual(["at", "count", "name", "plan", "reason"]);
    }
  });

  it("does not charge the free allowance for reused quotes", () => {
    const h = harness();
    runGenerationBatch(requestFor(["Q-001"]), h.ports, 10);
    h.entitlements.state = { ...DEFAULT_ENTITLEMENT, freeUsed: 4 };

    const outcome = runGenerationBatch(requestFor(["Q-001", "Q-002"]), h.ports, 10);

    expect(outcome.results.find((result) => result.quoteId === "Q-001")!.status).toBe("existing");
    expect(outcome.results.find((result) => result.quoteId === "Q-002")!.status).toBe("created");
    expect(outcome.entitlement.freeUsed).toBe(5);
    expect(h.renderer.calls).toEqual(["Q-001", "Q-002"]);
    expect(outcome.job.status).toBe("completed");
  });

  it("records skipped quotes and reports exhaustion for a partial allowance", () => {
    const h = harness();
    h.entitlements.state = { ...DEFAULT_ENTITLEMENT, freeUsed: 4 };

    const outcome = runGenerationBatch(requestFor(["Q-001", "Q-002"]), h.ports, 10);

    const statuses = outcome.results.map((result) => `${result.quoteId}:${result.status}`);
    expect(statuses).toContain("Q-001:created");
    expect(statuses).toContain("Q-002:skipped");
    expect(outcome.entitlement.freeUsed).toBe(5);
    expect(outcome.job.status).toBe("completed");
    expect(outcome.remainingToGenerate).toBe(0);
    const blocked = h.usage.events.find((event) => event.name === "allowance_blocked");
    expect(blocked?.reason).toBe("free_allowance_exhausted");
    expect(outcome.results.find((result) => result.quoteId === "Q-002")!.message).toMatch(
      /allowance/i,
    );
  });
});

