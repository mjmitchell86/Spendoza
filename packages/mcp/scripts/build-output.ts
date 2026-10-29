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

// Each handler runs inside a small Express app mounted at its public path.
// The MCP SDK's OAuth handlers are Express routers that only match "/", so
// mounting strips the path; the app also gives req/res the Express methods
// (res.status().json(), res.redirect) the handlers use, and parses JSON and
// form bodies for /mcp and /callback.
function wrapperSource(name: string, publicPath: string): string {
  return `import express from "express";
import handler from ${JSON.stringify(join(ROOT, "handlers", `${name}.ts`))};

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use([${JSON.stringify(publicPath)}, ${JSON.stringify(`/api/${name}`)}], (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
});

export default app;
`;
}

rmSync(OUT, { recursive: true, force: true });
const WRAPPERS = join(ROOT, ".vercel/entries");
mkdirSync(WRAPPERS, { recursive: true });

const entries = readdirSync(join(ROOT, "handlers")).filter((f) => f.endsWith(".ts"));

for (const file of entries) {
  const name = file.replace(/\.ts$/, "");
  const publicPath = Object.keys(ROUTES).find((path) => ROUTES[path] === name);
  if (!publicPath) throw new Error(`No public route for handlers/${file}`);
  const funcDir = join(OUT, "functions/api", `${name}.func`);
  mkdirSync(funcDir, { recursive: true });

  const wrapper = join(WRAPPERS, `${name}.ts`);
  writeFileSync(wrapper, wrapperSource(name, publicPath));

  const result = await Bun.build({
    entrypoints: [wrapper],
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
      shouldAddHelpers: false,
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
