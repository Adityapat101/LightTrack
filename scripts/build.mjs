import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(resolve(root, "dist"), { recursive: true });
cpSync(resolve(root, "web"), resolve(root, "dist"), { recursive: true });
// Package only the maintained Python source, never a local virtualenv or secrets.
const files = ["lighttrack.py", "tracker.py", "requirements.txt", "README.md", "LICENSE", "tests/test_tracker.py"];
// Vercel's build image has Python; the local preview uses exactly the same ZIP.
execFileSync("python3", ["-c", [
  "from pathlib import Path",
  "from zipfile import ZipFile, ZIP_DEFLATED",
  "import sys",
  "root=Path(sys.argv[1])",
  "with ZipFile(root/'dist'/'LightTrack-python.zip','w',ZIP_DEFLATED) as archive:",
  "    for name in sys.argv[2:]: archive.write(root/name, 'LightTrack/'+name)",
].join("\n"), root, ...files], { stdio: "inherit" });
const runtime = readFileSync(resolve(root, "dist/vendor/opencv.js"));
if (runtime.length < 1_000_000) throw new Error("The OpenCV runtime is missing or incomplete.");
writeFileSync(resolve(root, "dist/robots.txt"), "User-agent: *\nAllow: /\n");
console.log("Built the static demo and Python download in dist/.");
