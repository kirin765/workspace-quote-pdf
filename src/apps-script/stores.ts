import {
  emptyCounters,
  incrementCounters,
  parseStoredCounters,
  parseStoredEntitlement,
  parseStoredJob,
  parseStoredSettings,
  serializeJob,
  serializeSettings,
  type AppSettings,
  type EntitlementState,
  type GenerationJob,
  type UsageCounters,
  type UsageEvent,
} from "../core";

/**
 * Apps Script storage adapters.
 *
 * Settings and entitlement are per-user (UserProperties); job state and usage
 * counters live on the spreadsheet document (DocumentProperties). No customer
 * rows, quote IDs, file IDs or amounts are stored in usage counters.
 */

const SETTINGS_PREFIX = "wpq.settings.";
const ENTITLEMENT_KEY = "wpq.entitlement";
const JOB_PREFIX = "wpq.job.";
const USAGE_PREFIX = "wpq.usage.";

const MAX_PROPERTY_BYTES = 9000;

function userProps(): GoogleAppsScript.Properties.Properties {
  return PropertiesService.getUserProperties();
}

function docProps(): GoogleAppsScript.Properties.Properties {
  return PropertiesService.getDocumentProperties();
}

function safeSet(props: GoogleAppsScript.Properties.Properties, key: string, value: string): void {
  if (value.length > MAX_PROPERTY_BYTES) {
    throw new Error(
      `Stored value for ${key} exceeds the ${MAX_PROPERTY_BYTES} byte property limit.`,
    );
  }
  props.setProperty(key, value);
}

export function getActiveSpreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error("Open this add-on from a Google Sheets spreadsheet.");
  }
  return spreadsheet;
}

export function loadSettings(spreadsheetId: string): AppSettings {
  return parseStoredSettings(userProps().getProperty(`${SETTINGS_PREFIX}${spreadsheetId}`));
}

export function saveSettings(spreadsheetId: string, settings: AppSettings): void {
  safeSet(userProps(), `${SETTINGS_PREFIX}${spreadsheetId}`, serializeSettings(settings));
}

export function loadEntitlement(): EntitlementState {
  return parseStoredEntitlement(userProps().getProperty(ENTITLEMENT_KEY));
}

export function saveEntitlement(state: EntitlementState): void {
  safeSet(userProps(), ENTITLEMENT_KEY, JSON.stringify(state));
}

export function loadJob(spreadsheetId: string, sheetName: string): GenerationJob | null {
  const raw = docProps().getProperty(`${JOB_PREFIX}${sheetName}`);
  const job = parseStoredJob(raw);
  if (job && job.spreadsheetId !== spreadsheetId) return null;
  return job;
}

export function saveJob(job: GenerationJob): void {
  safeSet(docProps(), `${JOB_PREFIX}${job.sheetName}`, serializeJob(job));
}

export function clearJob(sheetName: string): void {
  docProps().deleteProperty(`${JOB_PREFIX}${sheetName}`);
}

export function loadUsageCounters(spreadsheetId: string): UsageCounters {
  const raw = docProps().getProperty(`${USAGE_PREFIX}${spreadsheetId}`);
  return raw ? parseStoredCounters(raw) : emptyCounters();
}

export function recordUsageEvent(spreadsheetId: string, event: UsageEvent): void {
  const counters = incrementCounters(loadUsageCounters(spreadsheetId), event);
  safeSet(docProps(), `${USAGE_PREFIX}${spreadsheetId}`, JSON.stringify(counters));
}

const RESULTS_TAB_PREFIX = "wpq.resultsTab.";

/** Name of the results tab this add-on created, so it can be reused, not recreated. */
export function loadResultsTabName(spreadsheetId: string): string | null {
  const value = docProps().getProperty(`${RESULTS_TAB_PREFIX}${spreadsheetId}`);
  return value && value.trim() !== "" ? value : null;
}

export function saveResultsTabName(spreadsheetId: string, name: string): void {
  safeSet(docProps(), `${RESULTS_TAB_PREFIX}${spreadsheetId}`, name);
}

