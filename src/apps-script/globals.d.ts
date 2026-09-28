/**
 * Ambient declaration for the Drive API v3 advanced service, enabled in
 * `appsscript.json` with the user symbol `Drive`.
 *
 * The add-on uses this service instead of `DriveApp` because `DriveApp`
 * requires the restricted `https://www.googleapis.com/auth/drive` scope, while
 * the Drive API accepts `drive.file`. The shape mirrors the runtime API used
 * here; `files.export` returns a Blob (the generated @types declaration says
 * `void`, which is incorrect).
 */

declare namespace WpqDrive {
  interface FileResource {
    id?: string | null;
    name?: string | null;
    mimeType?: string | null;
    parents?: string[] | null;
    trashed?: boolean | null;
  }

  interface FileListResource {
    files?: FileResource[] | null;
  }

  interface Files {
    create(resource: FileResource): FileResource;
    create(resource: FileResource, mediaData: GoogleAppsScript.Base.Blob): FileResource;
    get(fileId: string, optionalArgs?: Record<string, unknown>): FileResource;
    update(resource: FileResource, fileId: string): FileResource;
    /**
     * The Apps Script advanced service requires `optionalArgs: { alt: "media" }`
     * or the API returns "Export requires alt=media to download the exported
     * content." This parameter is missing from the generated @types signature.
     */
    export(
      fileId: string,
      mimeType: string,
      optionalArgs?: Record<string, unknown>,
    ): GoogleAppsScript.Base.Blob;
    list(optionalArgs?: Record<string, unknown>): FileListResource;
  }

  interface DriveService {
    Files: Files;
  }
}

declare const Drive: WpqDrive.DriveService;
