import { build } from "esbuild";
import path from "node:path";
import { runInNewContext } from "node:vm";

const testFiles = [
  "tests/PropertyValueMutation.test.ts",
  "tests/FacetFoldersDataStore.test.ts",
];

for (const testFile of testFiles) {
  const result = await build({
    entryPoints: [testFile],
    bundle: true,
    format: "iife",
    platform: "node",
    write: false,
    plugins: [
      {
        name: "obsidian-test-double",
        setup(buildContext) {
          buildContext.onResolve({ filter: /^obsidian$/ }, () => ({
            path: path.resolve("tests/obsidian.mock.ts"),
          }));
        },
      },
    ],
  });

  const output = result.outputFiles[0];
  if (!output) throw new Error(`Test bundle was not generated for ${testFile}.`);
  const context = { window: {} };
  runInNewContext(output.text, context);
  const testPromise = context.window.testPromise;
  if (testPromise && typeof testPromise.then === "function") await testPromise;
}
