import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_CURRENCY_CODE,
  buildRenderModel,
  buildSnapshots,
  coerceSettings,
  groupRows,
  hasError,
  mapSheetToRows,
  runGenerationBatch,
  validateGroups,
  validateSettings,
  type AppSettings,
  type GenerationPorts,
  type Issue,
  type QuoteRenderModel,
  type QuoteSnapshot,
  type MappingOptions,
} from "../core";
import {
  createLogoFile,
  createOutputFolder,
  ensureOutputFolder,
  getAccessibleFolder,
  type FolderSummary,
} from "./drive-output";
import { GoogleDocsRenderer } from "./renderer";
import { ResultsTabSink } from "./result-sink";
import { readActiveSelection, selectionFingerprint, type SelectionRead } from "./sheet-reader";
import {
  getActiveSpreadsheet,
  loadEntitlement,
  loadJob,
  loadSettings,
  loadUsageCounters,
  recordUsageEvent,
  saveEntitlement,
  saveJob,
  saveSettings,
} from "./stores";
import {
  groupToSummaryDto,
  progressFromJob,
  type GenerationProgressDto,
  type PreviewDto,
  type QuoteSummaryDto,
  type SelectionDto,
} from "./serialize";

/**
 * Sidebar-facing controller. Every exported function in `api` is exposed as a
 * global via the build shim, so it must stay JSON-serializable in and out.
 * Failures are returned as structured `{ ok: false }` results rather than
 * thrown, because `google.script.run` only surfaces opaque error strings.
 */

export type ApiError = { code: string; message: string };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data };
}

function fail(code: string, message: string): ApiResult<never> {
  return { ok: false, error: { code, message } };
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 300);
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string" && code !== "") return code;
  }
  return "unexpected";
}

function guard<T>(work: () => ApiResult<T>): ApiResult<T> {
  try {
    return work();
  } catch (error) {
    return fail(errorCode(error), describeError(error));
  }
}

function todayIso(): string {
  const spreadsheet = getActiveSpreadsheet();
  return Utilities.formatDate(new Date(), spreadsheet.getSpreadsheetTimeZone(), "yyyy-MM-dd");
}

function nowIso(): string {
  return new Date().toISOString();
}

function mappingOptions(settings: AppSettings): MappingOptions {
  return {
    numberFormat: settings.business.numberFormat,
    defaultCurrency: DEFAULT_CURRENCY_CODE,
    rounding: "reject",
  };
}

interface BuiltPreview {
  read: SelectionRead;
  fingerprint: string;
  settingsIssues: Issue[];
  summaries: QuoteSummaryDto[];
  renderModels: (QuoteRenderModel | null)[];
  snapshots: QuoteSnapshot[];
  sourceIssues: Issue[];
}

function buildPreview(read: SelectionRead, settings: AppSettings): BuiltPreview {
  const settingsIssues = validateSettings(settings);
  const mapped = mapSheetToRows(read.rows, settings.mapping, mappingOptions(settings));
  const grouped = groupRows(mapped.rows);
  const validated = validateGroups(grouped.groups);
  const context = {
    issueDate: todayIso(),
    source: { sheetName: read.sheetName, headerRow: 1, rangeA1: read.rangeA1 },
  };
  const snapshots = buildSnapshots(validated, settings, context);
  const snapshotByQuoteId = new Map(snapshots.map((snapshot) => [snapshot.quoteId, snapshot]));
  // Keep renderModels index-aligned with summaries so the sidebar's parallel
  // indexing never shows one quote's document under another quote's heading.
  const renderModels = validated.map((group) => {
    const snapshot = snapshotByQuoteId.get(group.quoteId);
    return snapshot ? buildRenderModel(snapshot) : null;
  });
  return {
    read,
    fingerprint: selectionFingerprint(read),
    settingsIssues,
    summaries: validated.map(groupToSummaryDto),
    renderModels,
    snapshots,
    sourceIssues: [...mapped.issues, ...grouped.issues],
  };
}

function selectionDto(read: SelectionRead): SelectionDto {
  const header = read.rows[0]?.cells.map((cell) => cell.display) ?? [];
  return {
    spreadsheetId: read.spreadsheetId,
    spreadsheetName: read.spreadsheetName,
    sheetName: read.sheetName,
    rangeA1: read.rangeA1,
    header,
    rowCount: Math.max(0, read.rows.length - 1),
    truncated: read.truncated,
  };
}

export interface InitialStateDto {
  freeAllowanceUsed: number;
  entitlement: ReturnType<typeof loadEntitlement>;
  settings: AppSettings;
  tabNames: string[];
  spreadsheetName: string;
  activeSheetName: string;
  selectionA1: string | null;
  outputFolderId: string | null;
  outputFolders: FolderSummary[];
  usage: ReturnType<typeof loadUsageCounters>;
}

export function getInitialState(): ApiResult<InitialStateDto> {
  let stage = "start";
  try {
    const spreadsheet = getActiveSpreadsheet();
    const sheet = spreadsheet.getActiveSheet();
    const range = sheet.getActiveRange();
    stage = "settings";
    const settings = loadSettings(spreadsheet.getId());
    stage = "entitlement";
    const entitlement = loadEntitlement();
    stage = "usage";
    const usage = loadUsageCounters(spreadsheet.getId());
    return ok({
      freeAllowanceUsed: entitlement.freeUsed,
      entitlement,
      settings,
      tabNames: spreadsheet.getSheets().map((entry) => entry.getName()),
      spreadsheetName: spreadsheet.getName(),
      activeSheetName: sheet.getName(),
      selectionA1: range ? range.getA1Notation() : null,
      outputFolderId: settings.outputFolderId,
      outputFolders: [],
      usage,
    });
  } catch (error) {
    return fail(errorCode(error), `getInitialState[${stage}]: ${describeError(error)}`);
  }
}

export interface ScanResponse {
  settingsIssues: Issue[];
  selection: SelectionDto;
  preview: PreviewDto | null;
}

export function scanSelection(): ApiResult<ScanResponse> {
  let stage = "start";
  try {
    const spreadsheet = getActiveSpreadsheet();
    stage = "settings";
    const settings = loadSettings(spreadsheet.getId());
    stage = "read";
    const read = readActiveSelection();
    stage = "build";
    const built = buildPreview(read, settings);
    const selection = selectionDto(built.read);
    if (hasError(built.settingsIssues)) {
      return ok({ settingsIssues: built.settingsIssues, selection, preview: null });
    }
    const ready = built.summaries.filter((summary) => summary.status === "ready").length;
    const blocked = built.summaries.length - ready;
    const warnings = built.summaries.reduce((count, summary) => count + summary.warnings.length, 0);
    return ok({
      settingsIssues: built.settingsIssues,
      selection,
      preview: {
        selection: selectionDto(built.read),
        fingerprint: built.fingerprint,
        summaries: built.summaries,
        renderModels: built.renderModels,
        sourceIssues: built.sourceIssues,
        ready,
        blocked,
        warnings,
      },
    });
  } catch (error) {
    return fail(errorCode(error), `scanSelection[${stage}]: ${describeError(error)}`);
  }
}

export interface SaveSettingsResponse {
  settings: AppSettings;
  issues: Issue[];
}

export function saveSettingsApi(payload: unknown): ApiResult<SaveSettingsResponse> {
  return guard(() => {
    const spreadsheet = getActiveSpreadsheet();
    const current = loadSettings(spreadsheet.getId());
    const candidate = coerceSettings(payload);
    if (candidate.outputFolderId === null) {
      candidate.outputFolderId = current.outputFolderId;
    } else if (candidate.outputFolderId !== current.outputFolderId) {
      const folder = getAccessibleFolder(candidate.outputFolderId);
      if (!folder) {
        return fail(
          "output_folder_unavailable",
          "The selected output folder is not accessible to this add-on.",
        );
      }
    }
    const issues = validateSettings(candidate);
    if (!hasError(issues)) saveSettings(spreadsheet.getId(), candidate);
    return ok({ settings: candidate, issues });
  });
}

export interface CreateOutputFolderResponse {
  folder: FolderSummary;
  settings: AppSettings;
}

export function createOutputFolderApi(): ApiResult<CreateOutputFolderResponse> {
  return guard(() => {
    const spreadsheet = getActiveSpreadsheet();
    const settings = loadSettings(spreadsheet.getId());
    const folder = createOutputFolder();
    settings.outputFolderId = folder.id;
    saveSettings(spreadsheet.getId(), settings);
    return ok({ folder, settings });
  });
}

export interface LogoPayload {
  base64: string;
  mimeType: string;
  fileName: string;
}

export function saveLogo(payload: LogoPayload): ApiResult<{ logoId: string }> {
  return guard(() => {
    const spreadsheet = getActiveSpreadsheet();
    const settings = loadSettings(spreadsheet.getId());
    if (!payload || typeof payload.base64 !== "string" || payload.base64.length === 0) {
      return fail("invalid_logo", "No logo data was provided.");
    }
    if (payload.base64.length > 2_000_000) {
      return fail("logo_too_large", "Logo must be smaller than 1.5 MB.");
    }
    const logoId = createLogoFile(
      payload.base64,
      payload.mimeType || "image/png",
      payload.fileName || "quote-logo.png",
    );
    settings.business.logoUrl = logoId;
    saveSettings(spreadsheet.getId(), settings);
    return ok({ logoId });
  });
}

function runBatch(expectedFingerprint: string | null): ApiResult<GenerationProgressDto> {
  return guard(() => {
    const spreadsheet = getActiveSpreadsheet();
    const lock = LockService.getDocumentLock();
    if (!lock.tryLock(15000)) {
      return fail("busy", "Another generation is already running. Wait a moment and try again.");
    }
    try {
      const settings = loadSettings(spreadsheet.getId());
      const settingsIssues = validateSettings(settings);
      if (hasError(settingsIssues)) {
        return fail("settings_invalid", "Complete the mapping and branding settings first.");
      }

      const read = readActiveSelection();
      if (expectedFingerprint !== null && selectionFingerprint(read) !== expectedFingerprint) {
        return fail(
          "source_changed",
          "The selected data changed since the preview. Refresh the preview, then generate again.",
        );
      }

      const built = buildPreview(read, settings);
      if (built.snapshots.length === 0) {
        return fail("no_ready_quotes", "No valid quotes are available to generate.");
      }

      const folderId = ensureOutputFolder(settings);
      settings.outputFolderId = folderId;
      saveSettings(spreadsheet.getId(), settings);

      const ports: GenerationPorts = {
        render: new GoogleDocsRenderer(folderId),
        jobs: {
          load: () => loadJob(spreadsheet.getId(), read.sheetName),
          save: (job) => saveJob(job),
        },
        entitlements: { load: loadEntitlement, save: saveEntitlement },
        usage: { record: (event) => recordUsageEvent(spreadsheet.getId(), event) },
        clock: { nowIso, todayIso },
        results: new ResultsTabSink(),
      };

      const outcome = runGenerationBatch(
        {
          spreadsheetId: spreadsheet.getId(),
          sheetName: read.sheetName,
          rangeA1: read.rangeA1,
          snapshots: built.snapshots,
          outputFolderId: folderId,
        },
        ports,
        DEFAULT_BATCH_SIZE,
      );

      return ok(
        progressFromJob(
          outcome.job,
          outcome.job.requestedQuoteIds,
          outcome.remainingToGenerate,
          outcome.allowance,
          outcome.results.map((result) => ({
            quoteId: result.quoteId,
            status: result.status,
            fileUrl: result.fileUrl,
            name: result.name,
            message: result.message,
          })),
        ),
      );
    } finally {
      lock.releaseLock();
    }
  });
}

export function startGeneration(payload: { fingerprint: string }): ApiResult<GenerationProgressDto> {
  const fingerprint = payload && typeof payload.fingerprint === "string" ? payload.fingerprint : null;
  return runBatch(fingerprint);
}

export function continueGeneration(): ApiResult<GenerationProgressDto> {
  return runBatch(null);
}
