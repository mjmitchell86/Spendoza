/**
 * Builds the MCP server for Vercel's Build Output API.
 *
 * Each file in api/ becomes one self-contained function bundle. Vercel's
 * default per-file TypeScript compile left ESM imports like "../src/auth/oauth"
 * without extensions, which Node can't resolve, so every function crashed on
 * start. Bundling removes runtime module resolution entirely (the same
 * approach as packages/api).
 *
 * The rewrites in vercel.json are carried over as routes, since Vercel doesn't
 * apply vercel.json rewrites to prebuilt output.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const OUT = join(ROOT, ".vercel/output");
const RUNTIME = "nodejs24.x";

rmSync(OUT, { recursive: true, force: true });

const entries = readdirSync(join(ROOT, "api")).filter((f) => f.endsWith(".ts"));

for (const file of entries) {
  const name = file.replace(/\.ts$/, "");
  const funcDir = join(OUT, "functions/api", `${name}.func`);
  mkdirSync(funcDir, { recursive: true });

  const result = await Bun.build({
    entrypoints: [join(ROOT, "api", file)],
    target: "node",
    format: "esm",
    naming: "index.mjs",
    outdir: funcDir,
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error(`Failed to bundle api/${file}`);
  }

  writeFileSync(
    join(funcDir, ".vc-config.json"),
    JSON.stringify({
      runtime: RUNTIME,
      handler: "index.mjs",
      launcherType: "Nodejs",
      shouldAddHelpers: true,
      maxDuration: 60,
    }),
  );
  console.log(`[build-output] api/${file} -> functions/api/${name}.func`);
}

const vercelJson = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as {
  rewrites?: { source: string; destination: string }[];
};
const routes = (vercelJson.rewrites ?? []).map((r) => ({ src: `^${r.source}$`, dest: r.destination }));

writeFileSync(join(OUT, "config.json"), JSON.stringify({ version: 3, routes }, null, 2));
console.log(`[build-output] config.json with ${routes.length} routes`);
