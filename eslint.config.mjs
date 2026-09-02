import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  globalIgnores(["main.js", "esbuild.config.mjs"]),
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.mjs", "scripts/*.mjs"],
        },
      },
    },
    rules: {
      "obsidianmd/ui/sentence-case": "off",
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    rules: {
      "obsidianmd/no-nodejs-modules": "off",
    },
  },
]);
