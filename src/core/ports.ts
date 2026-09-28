import type { EntitlementState } from "./entitlements";
import type { GenerationJob } from "./jobs";
import type { QuoteRenderModel } from "./render-model";
import type { QuoteSnapshot } from "./snapshot";
import type { UsageEvent } from "./usage";

/**
 * Platform ports.
 *
 * The generation engine depends only on these interfaces. Apps Script supplies
 * real implementations; tests supply in-memory fakes. This is what lets the
 * orchestration be verified without a Google account.
 */

export interface RenderedFile {
  fileId: string;
  fileUrl: string;
  name: string;
}

export interface RenderPort {
  render(snapshot: QuoteSnapshot, model: QuoteRenderModel, outputFolderId: string | null): RenderedFile;
}

export interface JobStorePort {
  load(): GenerationJob | null;
  save(job: GenerationJob): void;
}

export interface EntitlementStorePort {
  load(): EntitlementState;
  save(state: EntitlementState): void;
}

export interface UsagePort {
  record(event: UsageEvent): void;
}

export interface ClockPort {
  nowIso(): string;
  /** ISO `YYYY-MM-DD` in the spreadsheet's timezone. */
  todayIso(): string;
}

export interface ResultSinkPort {
  write(rows: import("./results").ResultRow[]): void;
}

/** The complete set of platform services the generation engine needs. */
export interface GenerationPorts {
  render: RenderPort;
  jobs: JobStorePort;
  entitlements: EntitlementStorePort;
  usage: UsagePort;
  clock: ClockPort;
  results: ResultSinkPort | null;
}
