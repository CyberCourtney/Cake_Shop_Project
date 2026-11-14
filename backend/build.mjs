// Bundles each Lambda into backend/dist/<name>/index.mjs with esbuild.
//
// Why bundle: each function ships only the code it uses (tens of KB, except admin-export,
// which includes exceljs), so cold starts are fast and the zips are small.
// Why the AWS SDK is left out: the nodejs24.x runtime already contains AWS SDK v3, so
// bundling it would only make the zips bigger. Tests use the same SDK version from npm.
import { build } from "esbuild";
import { rmSync } from "node:fs";

const functions = ["public-catalogue", "public-create-order", "admin-api", "admin-export", "notifier"];
rmSync("dist", { recursive: true, force: true });

for (const name of functions) {
  await build({
    entryPoints: [`functions/${name}/handler.ts`],
    outfile: `dist/${name}/index.mjs`,
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    sourcemap: true,
    minify: true,
    external: ["@aws-sdk/*"],
    // Some CommonJS dependencies (exceljs) call require(); give ESM output a require().
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    legalComments: "linked",
    logLevel: "warning",
  });
  console.log(`built dist/${name}/index.mjs`);
}
