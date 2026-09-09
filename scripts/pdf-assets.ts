import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/** PDF.js's worker needs fonts/CMaps/image decoders at stable same-origin URLs. */
export function pdfAssetsPlugin(): Plugin {
  const root = path.resolve("node_modules/pdfjs-dist");
  const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const assets = new Map<string, string>();
  for (const folder of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
    for (const name of readdirSync(path.join(root, folder))) {
      assets.set(`pdfjs/${version}/${folder}/${name}`, path.join(root, folder, name));
    }
  }
  assets.set(`pdfjs/${version}/LICENSE`, path.join(root, "LICENSE"));
  let building = false;
  return {
    name: "self-hosted-pdf-assets",
    configResolved(config) { building = config.command === "build"; },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = assets.get((req.url ?? "").split("?")[0].replace(/^\//, ""));
        if (!file) return next();
        res.setHeader("Content-Type", file.endsWith(".wasm") ? "application/wasm" : file.endsWith(".js") ? "text/javascript" : "application/octet-stream");
        res.end(readFileSync(file));
      });
    },
    buildStart() {
      if (!building) return;
      for (const [fileName, file] of assets) this.emitFile({ type: "asset", fileName, source: readFileSync(file) });
    },
  };
}
