import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync, unzipSync } from "fflate";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const json = async (path) =>
  JSON.parse(await readFile(resolve(root, path), "utf8"));
const [pkg, sourceManifest, manifest] = await Promise.all([
  json("package.json"),
  json("public/manifest.json"),
  json("dist/manifest.json"),
]);
const version = manifest.version;
if (
  !/^\d+(?:\.\d+){0,3}$/.test(version) ||
  version !== pkg.version ||
  version !== sourceManifest.version
)
  throw new Error(
    "Align the numeric version in package.json and public/manifest.json, then rebuild before packaging.",
  );
if (JSON.stringify(manifest) !== JSON.stringify(sourceManifest))
  throw new Error(
    "The built manifest differs from public/manifest.json. Run pnpm package to rebuild first.",
  );

function safePath(path) {
  if (
    typeof path !== "string" ||
    !path ||
    path.includes("\\") ||
    path.includes(":") ||
    path.startsWith("/") ||
    path !== posix.normalize(path) ||
    path.startsWith("../")
  )
    throw new Error(`Unsafe runtime file path: ${path}`);
  return path;
}
const required = new Set(
  [
    "manifest.json",
    manifest.background.service_worker,
    manifest.options_ui.page,
    ...manifest.content_scripts.flatMap((entry) => [
      ...(entry.js ?? []),
      ...(entry.css ?? []),
    ]),
    ...Object.values(manifest.icons),
  ].map(safePath),
);
const optionsHtml = await readFile(
  resolve(dist, manifest.options_ui.page),
  "utf8",
);
for (const match of optionsHtml.matchAll(
  /<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/g,
))
  required.add(safePath(match[1].replace(/^\.\//, "")));

async function filesIn(folder, prefix = "") {
  const entries = await readdir(folder, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink())
      throw new Error(`Cannot package a symlink: ${prefix}${entry.name}`);
    if (entry.isDirectory())
      paths.push(
        ...(await filesIn(
          resolve(folder, entry.name),
          `${prefix}${entry.name}/`,
        )),
      );
    else if (entry.isFile()) paths.push(safePath(`${prefix}${entry.name}`));
    else throw new Error(`Unsupported build entry: ${prefix}${entry.name}`);
  }
  return paths.sort();
}
const files = await filesIn(dist);
for (const path of required)
  if (!files.includes(path))
    throw new Error(`Missing extension runtime file: ${path}`);

const contents = new Map();
for (const path of files) {
  if (path.endsWith(".map")) continue;
  // Only declared entry points/icons and compiled JS/CSS assets enter the tester ZIP.
  if (
    !required.has(path) &&
    !/^assets\/[a-zA-Z0-9._-]+\.(?:js|css)$/.test(path)
  )
    throw new Error(`Unexpected file in dist; refusing to share it: ${path}`);
  let data = await readFile(resolve(dist, path));
  if (/\.(?:js|css)$/.test(path))
    data = Buffer.from(
      data
        .toString("utf8")
        .replace(/^\/\/[#@] sourceMappingURL=.*(?:\r?\n|$)/gm, "")
        .replace(/\/\*[#@] sourceMappingURL=[^*]*\*\//g, ""),
    );
  contents.set(path, data);
}
contents.set("README.txt", await readFile(resolve(root, "README.txt")));
// Fixed ZIP timestamps make the same build/input bytes reproducible.
const archive = zipSync(
  Object.fromEntries(
    [...contents]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, data]) => [path, [data, { mtime: new Date(1980, 0, 1) }]]),
  ),
  { level: 9 },
);
const unpacked = unzipSync(archive);
if (
  Object.keys(unpacked).length !== contents.size ||
  [...contents].some(
    ([path, data]) =>
      !unpacked[path] || !data.equals(Buffer.from(unpacked[path])),
  )
)
  throw new Error("Tester ZIP failed its round-trip content verification.");

const releases = resolve(root, "releases");
const name = `KosMore-${version}-test.zip`;
const hash = createHash("sha256").update(archive).digest("hex");
await mkdir(releases, { recursive: true });
await writeFile(resolve(releases, name), archive);
await writeFile(resolve(releases, `${name}.sha256`), `${hash}  ${name}\n`);
console.log(
  `Created releases/${name} (${contents.size} files, ${(archive.length / 1024).toFixed(1)} KiB)`,
);
console.log(`SHA-256: ${hash}`);
