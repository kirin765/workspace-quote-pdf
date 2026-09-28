import type { AppSettings, RenderedFile } from "../core";

/**
 * Drive output via the Drive API v3 advanced service.
 *
 * `DriveApp` requires the restricted `https://www.googleapis.com/auth/drive`
 * scope; the Drive API accepts the narrower `drive.file`, which grants access
 * only to files this add-on creates. Files are created only inside the folder
 * the add-on selected or created, and sharing is never changed. Temporary
 * Google Docs are trashed after export.
 */

export const DEFAULT_OUTPUT_FOLDER_NAME = "Quote PDFs";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export interface FolderSummary {
  id: string;
  name: string;
}

/**
 * Folders the add-on can see. Under `drive.file` this is only folders the app
 * created, which is why folder choice is limited to app-managed folders rather
 * than an arbitrary pre-existing folder (that needs the Google Picker + an API
 * key). Sharing settings are never changed.
 */
export function listOutputFolders(): FolderSummary[] {
  try {
    const result = Drive.Files.list({
      q: `mimeType='${FOLDER_MIME}' and trashed=false`,
      fields: "files(id,name)",
      orderBy: "name",
      pageSize: "50",
    });
    const folders: FolderSummary[] = [];
    for (const file of result.files ?? []) {
      if (file.id) folders.push({ id: file.id, name: file.name ?? "(untitled)" });
    }
    return folders;
  } catch {
    // Listing is optional. Some scope configurations deny files.list; the user
    // can still keep the current folder or create a new one.
    return [];
  }
}

export function createOutputFolder(name?: string): FolderSummary {
  const desiredName = name && name.trim() !== "" ? name.trim() : DEFAULT_OUTPUT_FOLDER_NAME;
  const created = Drive.Files.create({ name: desiredName, mimeType: FOLDER_MIME });
  if (!created.id) throw new Error("Could not create the output folder in Drive.");
  return { id: created.id, name: created.name ?? desiredName };
}

export function getAccessibleFolder(folderId: string): FolderSummary | null {
  try {
    const folder = Drive.Files.get(folderId);
    if (folder && folder.trashed !== true && folder.id && folder.mimeType === FOLDER_MIME) {
      return { id: folder.id, name: folder.name ?? "(untitled)" };
    }
  } catch {
    return null;
  }
  return null;
}

export function ensureOutputFolder(settings: AppSettings): string {
  if (settings.outputFolderId) {
    const existing = getAccessibleFolder(settings.outputFolderId);
    if (existing) return existing.id;
  }
  return createOutputFolder().id;
}

export function savePdfToFolder(
  blob: GoogleAppsScript.Base.Blob,
  folderId: string,
): RenderedFile {
  const file = Drive.Files.create(
    { name: blob.getName(), mimeType: MimeType.PDF, parents: [folderId] },
    blob,
  );
  if (!file.id) throw new Error("Could not save the PDF to the output folder.");
  return {
    fileId: file.id,
    fileUrl: `https://drive.google.com/file/d/${file.id}/view`,
    name: file.name ?? blob.getName() ?? "quotation.pdf",
  };
}

export function exportDocAsPdf(docId: string, fileName: string): GoogleAppsScript.Base.Blob {
  // The Apps Script advanced service's `files.export` requires an undocumented
  // `alt=media` and then throws the binary response instead of returning it, so
  // call the documented REST endpoint directly with the user's OAuth token.
  const url =
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(docId)}/export` +
    `?mimeType=${encodeURIComponent(MimeType.PDF)}&alt=media`;
  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
    muteHttpExceptions: true,
  });
  const code = response.getResponseCode();
  if (code !== 200) {
    throw new Error(`Drive export failed (${code}): ${response.getContentText().slice(0, 200)}`);
  }
  return response.getBlob().setName(fileName);
}

export function trashFileQuietly(fileId: string): void {
  try {
    Drive.Files.update({ trashed: true }, fileId);
  } catch {
    // Temporary-document cleanup is best-effort; never fail a successful export.
  }
}

export function createLogoFile(base64: string, mimeType: string, fileName: string): string {
  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const file = Drive.Files.create({ name: fileName, mimeType }, blob);
  if (!file.id) throw new Error("Could not store the logo file.");
  return file.id;
}
