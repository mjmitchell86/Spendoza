/**
 * Builds the MCP server for Vercel's Build Output API.
 *
 * Each file in handlers/ becomes one self-contained function bundle. Vercel's
 * zero-config per-file TypeScript compile (what an api/ folder triggers) left
 * ESM imports like "../src/auth/oauth" without extensions, which Node can't
 * resolve, so every function crashed on start. Bundling removes runtime module
 * resolution entirely, the same approach as packages/api. The folder is called
 * handlers/ rather than api/ so Vercel doesn't also run its zero-config build
 * over it.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const OUT = join(ROOT, ".vercel/output");
const RUNTIME = "nodejs24.x";

// Public path → handler file name (handlers/<name>.ts → /api/<name>).
const ROUTES: Record<string, string> = {
  "/mcp": "mcp",
  "/authorize": "authorize",
  "/callback": "callback",
  "/token": "token",
  "/register": "register",
  "/revoke": "revoke",
};

rmSync(OUT, { recursive: true, force: true });

const entries = readdirSync(join(ROOT, "handlers")).filter((f) => f.endsWith(".ts"));

for (const file of entries) {
  const name = file.replace(/\.ts$/, "");
  const funcDir = join(OUT, "functions/api", `${name}.func`);
  mkdirSync(funcDir, { recursive: true });

  const result = await Bun.build({
    entrypoints: [join(ROOT, "handlers", file)],
    target: "node",
    format: "esm",
    naming: "index.mjs",
    outdir: funcDir,
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error(`Failed to bundle handlers/${file}`);
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
  console.log(`[build-output] handlers/${file} -> functions/api/${name}.func`);
}

const routes = Object.entries(ROUTES).map(([path, name]) => ({
  src: `^${path}$`,
  dest: `/api/${name}`,
}));
writeFileSync(join(OUT, "config.json"), JSON.stringify({ version: 3, routes }, null, 2));
console.log(`[build-output] config.json with ${routes.length} routes`);
