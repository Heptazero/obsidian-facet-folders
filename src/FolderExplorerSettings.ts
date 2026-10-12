import { App, normalizePath } from "obsidian";
import { FacetFoldersDataStore } from "./FacetFoldersDataStore";

export type FolderGroupingRule =
  | { kind: "property"; key: string }
  | { kind: "tag"; prefix: string };

interface FolderExplorerState {
  expandedFolders: string[];
  expandedVirtual: string[];
  groupings: Record<string, FolderGroupingRule>;
  pins: Record<string, string[]>;
}

interface ExplorerData {
  folderExplorer?: Partial<FolderExplorerState>;
  [key: string]: unknown;
}

const LEGACY_UNSET_GROUP_SUFFIX = "::未设置";
const UNSET_GROUP_SUFFIX = "::\u0000facet-folders-unset";

export class FolderExplorerSettings {
  private state: FolderExplorerState = this.defaults();

  constructor(
    private readonly app: App,
    private readonly store: FacetFoldersDataStore,
  ) {}

  async load(): Promise<void> {
    const data = await this.readData();
    this.state = this.normalize(data.folderExplorer);
    if (Object.keys(this.state.pins).length === 0) {
      const imported = await this.readPinitPins();
      if (Object.keys(imported).length > 0) {
        this.state.pins = imported;
        await this.save();
      }
    }
  }

  isFolderExpanded(path: string): boolean {
    return this.state.expandedFolders.includes(path);
  }

  async toggleFolder(path: string): Promise<void> {
    this.state.expandedFolders = this.toggle(this.state.expandedFolders, path);
    await this.save();
  }

  isVirtualExpanded(id: string): boolean {
    return this.state.expandedVirtual.includes(id);
  }

  async toggleVirtual(id: string): Promise<void> {
    this.state.expandedVirtual = this.toggle(this.state.expandedVirtual, id);
    await this.save();
  }

  getGrouping(folderPath: string): FolderGroupingRule | null {
    const rule = this.state.groupings[folderPath];
    return rule ? { ...rule } : null;
  }

  async setGrouping(folderPath: string, rule: FolderGroupingRule): Promise<void> {
    this.state.groupings[folderPath] = { ...rule };
    const segments = folderPath.split("/").filter(Boolean);
    for (let index = 1; index <= segments.length; index += 1) {
      const path = segments.slice(0, index).join("/");
      if (!this.state.expandedFolders.includes(path)) {
        this.state.expandedFolders.push(path);
      }
    }
    const branchId = this.groupingBranchId(folderPath, rule);
    if (!this.state.expandedVirtual.includes(branchId)) {
      this.state.expandedVirtual.push(branchId);
    }
    await this.save();
  }

  async removeGrouping(folderPath: string): Promise<void> {
    const rule = this.state.groupings[folderPath];
    delete this.state.groupings[folderPath];
    if (rule) {
      const prefix = `${this.groupingBranchId(folderPath, rule)}::`;
      this.state.expandedVirtual = this.state.expandedVirtual.filter(
        (id) => id !== prefix.slice(0, -2) && !id.startsWith(prefix),
      );
    }
    await this.save();
  }

  groupingBranchId(folderPath: string, rule: FolderGroupingRule): string {
    const field = rule.kind === "property" ? rule.key : rule.prefix;
    return `group::${folderPath}::${rule.kind}::${field}`;
  }

  getPinned(folderPath: string): string[] {
    return [...(this.state.pins[folderPath] ?? [])];
  }

  isPinned(folderPath: string, filePath: string): boolean {
    return (this.state.pins[folderPath] ?? []).includes(filePath);
  }

  async togglePinned(folderPath: string, filePath: string): Promise<void> {
    const current = this.state.pins[folderPath] ?? [];
    const next = this.toggle(current, filePath);
    if (next.length > 0) this.state.pins[folderPath] = next;
    else delete this.state.pins[folderPath];
    await this.save();
  }

  async movePin(folderPath: string, filePath: string, delta: -1 | 1): Promise<void> {
    const current = [...(this.state.pins[folderPath] ?? [])];
    const index = current.indexOf(filePath);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= current.length) return;
    const sourcePath = current[index];
    const targetPath = current[target];
    if (!sourcePath || !targetPath) return;
    current[index] = targetPath;
    current[target] = sourcePath;
    this.state.pins[folderPath] = current;
    await this.save();
  }

  async renamePath(oldPath: string, newPath: string): Promise<void> {
    const replace = (path: string): string =>
      path === oldPath || path.startsWith(`${oldPath}/`)
        ? `${newPath}${path.slice(oldPath.length)}`
        : path;
    this.state.expandedFolders = this.state.expandedFolders.map(replace);
    const oldVirtualPrefix = `group::${oldPath}`;
    this.state.expandedVirtual = this.state.expandedVirtual.map((id) =>
      id.startsWith(`${oldVirtualPrefix}::`) || id.startsWith(`${oldVirtualPrefix}/`)
        ? `group::${newPath}${id.slice(oldVirtualPrefix.length)}`
        : id,
    );
    this.state.groupings = this.renameMapKeys(this.state.groupings, replace);
    const pins: Record<string, string[]> = {};
    for (const [folder, paths] of Object.entries(this.state.pins)) {
      pins[replace(folder)] = paths.map(replace);
    }
    this.state.pins = pins;
    await this.save();
  }

  async deletePath(path: string): Promise<void> {
    const contains = (value: string): boolean =>
      value === path || value.startsWith(`${path}/`);
    this.state.expandedFolders = this.state.expandedFolders.filter(
      (value) => !contains(value),
    );
    const virtualPrefix = `group::${path}`;
    this.state.expandedVirtual = this.state.expandedVirtual.filter(
      (id) =>
        !id.startsWith(`${virtualPrefix}::`) && !id.startsWith(`${virtualPrefix}/`),
    );
    for (const folder of Object.keys(this.state.groupings)) {
      if (contains(folder)) delete this.state.groupings[folder];
    }
    for (const folder of Object.keys(this.state.pins)) {
      if (contains(folder)) {
        delete this.state.pins[folder];
        continue;
      }
      this.state.pins[folder] = (this.state.pins[folder] ?? []).filter(
        (filePath) => !contains(filePath),
      );
    }
    await this.save();
  }

  private defaults(): FolderExplorerState {
    return {
      expandedFolders: [],
      expandedVirtual: [],
      groupings: {},
      pins: {},
    };
  }

  private normalize(value: Partial<FolderExplorerState> | undefined): FolderExplorerState {
    const defaults = this.defaults();
    if (!value || typeof value !== "object") return defaults;
    return {
      expandedFolders: this.stringArray(value.expandedFolders),
      expandedVirtual: this.stringArray(value.expandedVirtual).map((id) =>
        id.endsWith(LEGACY_UNSET_GROUP_SUFFIX)
          ? `${id.slice(0, -LEGACY_UNSET_GROUP_SUFFIX.length)}${UNSET_GROUP_SUFFIX}`
          : id,
      ),
      groupings: this.normalizeGroupings(value.groupings),
      pins: this.stringMap(value.pins),
    };
  }

  private normalizeGroupings(value: unknown): Record<string, FolderGroupingRule> {
    if (!value || typeof value !== "object") return {};
    const result: Record<string, FolderGroupingRule> = {};
    for (const [path, rule] of Object.entries(value)) {
      if (!rule || typeof rule !== "object") continue;
      const candidate = rule as Partial<FolderGroupingRule> & {
        kind?: string;
        key?: string;
        prefix?: string;
      };
      if (candidate.kind === "property" && candidate.key) {
        result[path] = { kind: "property", key: candidate.key };
      } else if (candidate.kind === "tag" && candidate.prefix) {
        result[path] = { kind: "tag", prefix: candidate.prefix };
      }
    }
    return result;
  }

  private stringMap(value: unknown): Record<string, string[]> {
    if (!value || typeof value !== "object") return {};
    const result: Record<string, string[]> = {};
    for (const [key, items] of Object.entries(value)) {
      result[key] = this.stringArray(items);
    }
    return result;
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? Array.from(new Set(value.filter((item): item is string => typeof item === "string")))
      : [];
  }

  private toggle(items: string[], value: string): string[] {
    return items.includes(value)
      ? items.filter((item) => item !== value)
      : [...items, value];
  }

  private renameMapKeys<T>(source: Record<string, T>, rename: (key: string) => string): Record<string, T> {
    const result: Record<string, T> = {};
    for (const [key, value] of Object.entries(source)) result[rename(key)] = value;
    return result;
  }

  private async readPinitPins(): Promise<Record<string, string[]>> {
    const path = normalizePath(`${this.app.vault.configDir}/plugins/pinit/data.json`);
    try {
      if (!(await this.app.vault.adapter.exists(path))) return {};
      const parsed: unknown = JSON.parse(await this.app.vault.adapter.read(path));
      if (!parsed || typeof parsed !== "object") return {};
      return this.stringMap((parsed as { pins?: unknown }).pins);
    } catch {
      return {};
    }
  }

  private async readData(): Promise<ExplorerData> {
    try {
      return await this.store.read<ExplorerData>();
    } catch (error) {
      console.error("Facet Folders: cannot read folder settings", error);
      return {};
    }
  }

  private async save(): Promise<void> {
    await this.store.update((data) => {
      data.folderExplorer = this.state;
    });
  }
}
