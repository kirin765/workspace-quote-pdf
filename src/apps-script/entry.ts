import * as api from "./controller";
import * as main from "./main";

/**
 * Bundle entry. esbuild exposes this as `App` (see `scripts/build.mjs`), and the
 * appended global shim maps Apps Script's flat function namespace onto
 * `App.main.*` / `App.api.*`.
 */
export { api, main };
