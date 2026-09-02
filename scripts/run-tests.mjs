import { build } from "esbuild";
import { runInNewContext } from "node:vm";

const result = await build({
  entryPoints: ["tests/PropertyValueMutation.test.ts"],
  bundle: true,
  format: "iife",
  platform: "node",
  write: false,
});

const output = result.outputFiles[0];
if (!output) throw new Error("Test bundle was not generated.");
runInNewContext(output.text);
