/**
 * Post-build processing for the bundled API.
 *
 * 1. Prepends browser-API polyfills (DOMMatrix, ImageData, Path2D)
 * 2. Fixes PDFKit's hardcoded __dirname so font .afm files are found at runtime
 */
const fs = require("fs");

const BUNDLE = ".vercel/output/functions/api.func/index.mjs";

let code = fs.readFileSync(BUNDLE, "utf8");

// 1. Polyfill browser globals that some transitive deps reference
const polyfill = [
  'if(typeof globalThis.DOMMatrix==="undefined"){',
  "globalThis.DOMMatrix=class DOMMatrix{};",
  "globalThis.ImageData=class ImageData{};",
  "globalThis.Path2D=class Path2D{};",
  "}\n",
].join("");

code = polyfill + code;

// 2. Bun's bundler resolves __dirname at build time, hard-coding the local
//    machine path.  At runtime on Vercel the path doesn't exist, so PDFKit
//    can't find its .afm font-metrics files.  Replace with a runtime expression
//    that resolves to the directory of the deployed bundle (where we copy the
//    data/ folder during build).
code = code.replace(
  /var __dirname = "\/[^"]*pdfkit[^"]*";/,
  'var __dirname = __require("path").dirname(__require("url").fileURLToPath(import.meta.url));'
);

fs.writeFileSync(BUNDLE, code);
console.log("[post-build] polyfill + __dirname fix applied");
