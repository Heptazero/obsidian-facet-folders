import { App, TFile } from "obsidian";
import {
  EMPTY_PROPERTY_VALUE,
  indexPropertyValue,
  replaceIndexedPropertyValue,
} from "./PropertyValueMutation";

export const EMPTY_VALUE = EMPTY_PROPERTY_VALUE;

export interface ValueEntry {
  value: string;
  files: TFile[];
}

export interface PropertyEntry {
  key: string;
  type: string;
  noteCount: number;
  values: Map<string, ValueEntry>;
}

export interface PropertyMutationFailure {
  file: TFile;
  error: unknown;
}

export interface PropertyMutationResult {
  updated: number;
  failures: PropertyMutationFailure[];
}

interface FilePropData {
  key: string;
  values: string[];
}

interface PropertyInfo {
  type?: string;
}

interface MetadataTypeManager {
  getPropertyInfo?: (key: string) => PropertyInfo | undefined;
  properties?: Record<string, PropertyInfo>;
  property?: Record<string, PropertyInfo>;
}

interface AppWithTypeManager {
  metadataTypeManager?: MetadataTypeManager;
}

export class PropertyDataManager {
  private readonly app: App;
  private readonly index = new Map<string, PropertyEntry>();
  private readonly fileIndex = new Map<string, FilePropData[]>();

  constructor(app: App) {
    this.app = app;
  }

  async buildIndex(): Promise<void> {
    this.index.clear();
    this.fileIndex.clear();

    const files = this.app.vault.getMarkdownFiles();
    const batchSize = 50;
    for (let i = 0; i < files.length; i += batchSize) {
      await Promise.all(files.slice(i, i + batchSize).map((file) => this.indexFile(file)));
    }
  }

  async updateFile(file: TFile): Promise<void> {
    this.removeFileFromIndex(file.path);
    await this.indexFile(file);
  }

  removeFile(file: TFile): void {
    this.removeFileFromIndex(file.path);
  }

  renameFile(file: TFile, oldPath: string): void {
    const props = this.fileIndex.get(oldPath);
    if (!props) return;
    this.fileIndex.delete(oldPath);
    this.fileIndex.set(file.path, props);
  }

  refreshTypes(): void {
    for (const entry of this.index.values()) {
      entry.type = this.getPropertyType(entry.key);
    }
  }

  getEntries(): PropertyEntry[] {
    return Array.from(this.index.values());
  }

  getFilesForProperty(key: string): TFile[] {
    const entry = this.index.get(key);
    if (!entry) return [];
    const files = new Map<string, TFile>();
    for (const valueEntry of entry.values.values()) {
      for (const file of valueEntry.files) files.set(file.path, file);
    }
    return Array.from(files.values()).sort((a, b) => a.path.localeCompare(b.path));
  }

  getRenameConflicts(oldKey: string, newKey: string): TFile[] {
    return this.getFilesForProperty(oldKey).filter((file) => {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      return Boolean(frontmatter && Object.prototype.hasOwnProperty.call(frontmatter, newKey));
    });
  }

  async deleteProperty(key: string): Promise<PropertyMutationResult> {
    return this.mutatePropertyFiles(this.getFilesForProperty(key), (frontmatter) => {
      delete frontmatter[key];
    });
  }

  async renameProperty(oldKey: string, newKey: string): Promise<PropertyMutationResult> {
    return this.mutatePropertyFiles(this.getFilesForProperty(oldKey), (frontmatter) => {
      if (!Object.prototype.hasOwnProperty.call(frontmatter, oldKey)) return;
      if (Object.prototype.hasOwnProperty.call(frontmatter, newKey)) {
        throw new Error(`目标属性已存在：${newKey}`);
      }

      const renamedEntries = Object.entries(frontmatter).map(([key, value]) =>
        key === oldKey ? ([newKey, value] as const) : ([key, value] as const),
      );
      for (const key of Object.keys(frontmatter)) delete frontmatter[key];
      for (const [key, value] of renamedEntries) frontmatter[key] = value;
    });
  }

  getValueReplacementError(
    key: string,
    oldValue: string,
    newValue: string,
    files: TFile[],
  ): string | null {
    for (const file of files) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!frontmatter || !Object.prototype.hasOwnProperty.call(frontmatter, key)) continue;
      try {
        replaceIndexedPropertyValue(frontmatter[key], oldValue, newValue);
      } catch (error) {
        return error instanceof Error ? error.message : `无法转换 ${file.basename} 中的值。`;
      }
    }
    return null;
  }

  async replacePropertyValue(
    key: string,
    oldValue: string,
    newValue: string,
    files: TFile[],
  ): Promise<PropertyMutationResult> {
    return this.mutatePropertyFiles(files, (frontmatter) => {
      if (!Object.prototype.hasOwnProperty.call(frontmatter, key)) return false;
      const result = replaceIndexedPropertyValue(frontmatter[key], oldValue, newValue);
      if (!result.changed) return false;
      frontmatter[key] = result.value;
      return true;
    });
  }

  private async indexFile(file: TFile): Promise<void> {
    const props = this.extractProperties(file);
    if (props.length === 0) return;

    this.fileIndex.set(file.path, props);
    for (const { key, values } of props) {
      let entry = this.index.get(key);
      if (!entry) {
        entry = {
          key,
          type: this.getPropertyType(key),
          noteCount: 0,
          values: new Map(),
        };
        this.index.set(key, entry);
      }

      entry.noteCount += 1;
      for (const value of values) {
        let valueEntry = entry.values.get(value);
        if (!valueEntry) {
          valueEntry = { value, files: [] };
          entry.values.set(value, valueEntry);
        }
        valueEntry.files.push(file);
      }
    }
  }

  private async mutatePropertyFiles(
    files: TFile[],
    mutate: (frontmatter: Record<string, unknown>) => boolean | void,
  ): Promise<PropertyMutationResult> {
    const failures: PropertyMutationFailure[] = [];
    let updated = 0;
    const batchSize = 12;

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (file) => {
          let changed = true;
          await this.app.fileManager.processFrontMatter(
            file,
            (frontmatter: Record<string, unknown>) => {
              changed = mutate(frontmatter) !== false;
            },
          );
          return changed;
        }),
      );
      results.forEach((result, index) => {
        const file = batch[index];
        if (!file) return;
        if (result.status === "fulfilled") {
          if (result.value) updated += 1;
          return;
        }
        failures.push({ file, error: result.reason });
      });
    }

    return { updated, failures };
  }

  private removeFileFromIndex(path: string): void {
    const oldProps = this.fileIndex.get(path);
    if (!oldProps) return;

    for (const { key, values } of oldProps) {
      const entry = this.index.get(key);
      if (!entry) continue;

      entry.noteCount = Math.max(0, entry.noteCount - 1);
      for (const value of values) {
        const valueEntry = entry.values.get(value);
        if (!valueEntry) continue;
        valueEntry.files = valueEntry.files.filter((file) => file.path !== path);
        if (valueEntry.files.length === 0) entry.values.delete(value);
      }
      if (entry.noteCount === 0) this.index.delete(key);
    }

    this.fileIndex.delete(path);
  }

  private extractProperties(file: TFile): FilePropData[] {
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter) return [];

    const result: FilePropData[] = [];
    for (const [key, rawValue] of Object.entries(frontmatter)) {
      if (!key || key === "position") continue;
      result.push({ key, values: indexPropertyValue(rawValue) });
    }
    return result;
  }

  private getPropertyType(key: string): string {
    try {
      const manager = (this.app as unknown as AppWithTypeManager).metadataTypeManager;
      if (!manager) return "text";
      const info = manager.getPropertyInfo?.(key);
      if (info?.type) return info.type;
      const map = manager.properties ?? manager.property;
      return map?.[key.toLowerCase()]?.type ?? "text";
    } catch {
      return "text";
    }
  }
}
