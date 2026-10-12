import { normalizePath, Plugin, TFolder } from "obsidian";

export type FacetFoldersLanguage = "zh-CN" | "en";

export interface FacetFoldersSettings {
  language: FacetFoldersLanguage;
  dataFolder: string;
}

export type FacetFoldersData = Record<string, unknown>;

const SETTINGS_KEY = "facetFoldersSettings";
const DATA_FILE_NAME = "facet-folders-data.json";

export class FacetFoldersDataStore {
  private settings: FacetFoldersSettings = this.defaults();
  private data: FacetFoldersData = {};
  private loaded = false;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly plugin: Plugin) {}

  async load(): Promise<void> {
    const local = this.asRecord(await this.plugin.loadData());
    this.settings = this.normalizeSettings(local[SETTINGS_KEY]);
    const legacyData = this.withoutSettings(local);

    if (!this.settings.dataFolder) {
      this.data = legacyData;
      this.loaded = true;
      return;
    }

    if (!(await this.folderExists(this.settings.dataFolder))) {
      this.settings = { ...this.settings, dataFolder: "" };
      this.data = legacyData;
      await this.persist(this.data, this.settings);
      this.loaded = true;
      return;
    }

    const path = this.customDataPath(this.settings.dataFolder);
    if (await this.plugin.app.vault.adapter.exists(path)) {
      this.data = await this.readJson(path);
    } else {
      this.data = legacyData;
      await this.writeJson(path, this.data);
    }
    await this.plugin.saveData({ [SETTINGS_KEY]: this.settings });
    this.loaded = true;
  }

  getSettings(): FacetFoldersSettings {
    this.ensureLoaded();
    return { ...this.settings };
  }

  getDataFilePath(): string {
    this.ensureLoaded();
    return this.settings.dataFolder
      ? this.customDataPath(this.settings.dataFolder)
      : normalizePath(
          `${this.plugin.app.vault.configDir}/plugins/${this.plugin.manifest.id}/data.json`,
        );
  }

  async read<T extends object>(): Promise<T> {
    await this.queue;
    this.ensureLoaded();
    return this.clone(this.data) as T;
  }

  async update(mutator: (data: FacetFoldersData) => void): Promise<void> {
    const operation = this.queue.then(async () => {
      this.ensureLoaded();
      const next = this.clone(this.data);
      mutator(next);
      await this.persist(next, this.settings);
      this.data = next;
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  async updateSettings(patch: Partial<FacetFoldersSettings>): Promise<void> {
    const operation = this.queue.then(async () => {
      this.ensureLoaded();
      const next = this.normalizeSettings({ ...this.settings, ...patch });
      let nextData = this.data;
      if (next.dataFolder !== this.settings.dataFolder && next.dataFolder) {
        const targetPath = this.customDataPath(next.dataFolder);
        if (await this.plugin.app.vault.adapter.exists(targetPath)) {
          nextData = await this.readJson(targetPath);
        }
      }
      await this.persist(nextData, next);
      this.data = nextData;
      this.settings = next;
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  private async persist(
    data: FacetFoldersData,
    settings: FacetFoldersSettings,
  ): Promise<void> {
    if (settings.dataFolder) {
      await this.writeJson(this.customDataPath(settings.dataFolder), data);
      await this.plugin.saveData({ [SETTINGS_KEY]: settings });
      return;
    }
    await this.plugin.saveData({ ...data, [SETTINGS_KEY]: settings });
  }

  private async readJson(path: string): Promise<FacetFoldersData> {
    const parsed: unknown = JSON.parse(await this.plugin.app.vault.adapter.read(path));
    return this.asRecord(parsed);
  }

  private async writeJson(path: string, data: FacetFoldersData): Promise<void> {
    await this.plugin.app.vault.adapter.write(path, JSON.stringify(data, null, 2));
  }

  private customDataPath(folder: string): string {
    return normalizePath(`${folder}/${DATA_FILE_NAME}`);
  }

  private async folderExists(folder: string): Promise<boolean> {
    return (
      folder === "." ||
      this.plugin.app.vault.getAbstractFileByPath(folder) instanceof TFolder
    );
  }

  private normalizeSettings(value: unknown): FacetFoldersSettings {
    if (!value || typeof value !== "object") return this.defaults();
    const candidate = value as Partial<FacetFoldersSettings>;
    return {
      language: candidate.language === "en" ? "en" : "zh-CN",
      dataFolder:
        typeof candidate.dataFolder === "string"
          ? normalizePath(candidate.dataFolder.trim()).replace(/^\/$/, "")
          : "",
    };
  }

  private withoutSettings(data: FacetFoldersData): FacetFoldersData {
    const result = { ...data };
    delete result[SETTINGS_KEY];
    return result;
  }

  private asRecord(value: unknown): FacetFoldersData {
    return value && typeof value === "object" && !Array.isArray(value)
      ? { ...(value as FacetFoldersData) }
      : {};
  }

  private clone(data: FacetFoldersData): FacetFoldersData {
    return JSON.parse(JSON.stringify(data)) as FacetFoldersData;
  }

  private defaults(): FacetFoldersSettings {
    return { language: "zh-CN", dataFolder: "" };
  }

  private ensureLoaded(): void {
    if (!this.loaded) throw new Error("Facet Folders data store is not loaded.");
  }
}
