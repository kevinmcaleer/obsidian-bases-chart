import esbuild from "esbuild";
import process from "process";
import { readFileSync, writeFileSync } from "fs";

const prod = process.argv[2] === "production";

// Auto-bump patch version on production builds
if (prod) {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

  const parts = pkg.version.split(".").map(Number);
  parts[2]++;
  const newVersion = parts.join(".");

  pkg.version = newVersion;
  manifest.version = newVersion;

  writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
  writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

  console.log(`Version bumped to ${newVersion}`);
}

esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
}).catch(() => process.exit(1));
