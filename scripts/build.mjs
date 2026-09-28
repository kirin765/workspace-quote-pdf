import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const globalsPath = join(root, "scripts", "appsscript-globals.txt");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const esbuildBin = join(root, "node_modules", ".bin", "esbuild");
execFileSync(
  esbuildBin,
  [
    join(root, "src", "apps-script", "entry.ts"),
    "--bundle",
    "--format=iife",
    "--global-name=App",
    "--target=es2020",
    "--platform=neutral",
    "--legal-comments=none",
    `--outfile=${join(dist, "App.js")}`,
  ],
  { stdio: "inherit" },
);

const bundlePath = join(dist, "App.js");
const globals = readFileSync(globalsPath, "utf8");
writeFileSync(bundlePath, `${readFileSync(bundlePath, "utf8")}\n\n${globals}`);

cpSync(join(root, "appsscript.json"), join(dist, "appsscript.json"));

for (const file of ["Index.html", "Styles.html", "JavaScript.html"]) {
  cpSync(join(root, "src", "sidebar", file), join(dist, file));
}

const bundleBytes = readFileSync(bundlePath).length;
console.log(`Built dist/App.js (${bundleBytes} bytes) + appsscript.json + sidebar HTML.`);
console.log("Deploy with: npx clasp push (requires dist-rooted .clasp.json).");
