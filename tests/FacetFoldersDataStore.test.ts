import type { Plugin } from "obsidian";
import { TFolder } from "obsidian";
import { FacetFoldersDataStore } from "../src/FacetFoldersDataStore";

interface FakePlugin {
  app: {
    vault: {
      configDir: string;
      adapter: {
        exists: (path: string) => Promise<boolean>;
        read: (path: string) => Promise<string>;
        write: (path: string, value: string) => Promise<void>;
      };
      getAbstractFileByPath: (path: string) => TFolder | null;
    };
  };
  manifest: { id: string };
  loadData: () => Promise<unknown>;
  saveData: (data: unknown) => Promise<void>;
}

(window as Window & { testPromise?: Promise<void> }).testPromise = run();

async function run(): Promise<void> {
  const fake = createPlugin({
    ffgSettings: { groups: [{ id: "status" }] },
    propertyOrder: { mode: "manual" },
  });
  const store = new FacetFoldersDataStore(fake.plugin as unknown as Plugin);
  await store.load();
  expectEqual(store.getSettings(), { language: "zh-CN", dataFolder: "" });

  fake.folders.add("99_assets/plugin-data");
  await store.updateSettings({ dataFolder: "99_assets/plugin-data" });
  expectEqual(JSON.parse(fake.files.get("99_assets/plugin-data/facet-folders-data.json") ?? ""), {
    ffgSettings: { groups: [{ id: "status" }] },
    propertyOrder: { mode: "manual" },
  });
  expectEqual(fake.localData, {
    facetFoldersSettings: {
      language: "zh-CN",
      dataFolder: "99_assets/plugin-data",
    },
  });

  fake.folders.add("profiles/other");
  fake.files.set(
    "profiles/other/facet-folders-data.json",
    JSON.stringify({ explorerMode: "tags" }),
  );
  await store.updateSettings({ dataFolder: "profiles/other" });
  expectEqual(await store.read(), { explorerMode: "tags" });
  expectEqual(JSON.parse(fake.files.get("profiles/other/facet-folders-data.json") ?? ""), {
    explorerMode: "tags",
  });

  await store.updateSettings({ dataFolder: "" });
  expectEqual(fake.localData, {
    explorerMode: "tags",
    facetFoldersSettings: { language: "zh-CN", dataFolder: "" },
  });

  const fallback = createPlugin({
    explorerMode: "folders",
    facetFoldersSettings: { language: "en", dataFolder: "missing" },
  });
  const fallbackStore = new FacetFoldersDataStore(
    fallback.plugin as unknown as Plugin,
  );
  await fallbackStore.load();
  expectEqual(fallbackStore.getSettings(), { language: "en", dataFolder: "" });
  expectEqual(await fallbackStore.read(), { explorerMode: "folders" });
}

function createPlugin(initialData: Record<string, unknown>): {
  plugin: FakePlugin;
  files: Map<string, string>;
  folders: Set<string>;
  localData: unknown;
} {
  const state = {
    files: new Map<string, string>(),
    folders: new Set<string>(),
    localData: clone(initialData) as unknown,
  };
  const plugin: FakePlugin = {
    app: {
      vault: {
        configDir: "config",
        adapter: {
          exists: async (path) => state.files.has(path) || state.folders.has(path),
          read: async (path) => {
            const value = state.files.get(path);
            if (value === undefined) throw new Error(`Missing test file: ${path}`);
            return value;
          },
          write: async (path, value) => {
            state.files.set(path, value);
          },
        },
        getAbstractFileByPath: (path) =>
          state.folders.has(path) ? new TFolder() : null,
      },
    },
    manifest: { id: "grouped-property-explorer" },
    loadData: async () => clone(state.localData),
    saveData: async (data) => {
      state.localData = clone(data);
    },
  };
  return {
    plugin,
    files: state.files,
    folders: state.folders,
    get localData() {
      return state.localData;
    },
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function expectEqual(actual: unknown, expected: unknown): void {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    throw new Error(`Expected ${expectedText}, received ${actualText}.`);
  }
}
