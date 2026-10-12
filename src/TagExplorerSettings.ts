import { App } from "obsidian";
import { FacetFoldersDataStore } from "./FacetFoldersDataStore";
import type { PropertyOrderMode } from "./FfgGrouping";
import type { TagTreeNode } from "./TagDataManager";

export type ExplorerMode = "folders" | "properties" | "tags";

interface TagOrderSettings {
  mode: PropertyOrderMode;
  pinnedByParent: Record<string, string[]>;
  manualInitialized: boolean;
  manualByParent: Record<string, string[]>;
}

interface ExplorerData {
  explorerMode?: ExplorerMode;
  tagOrder?: Partial<TagOrderSettings>;
  [key: string]: unknown;
}

const ROOT_SCOPE = "__root";

export class TagExplorerSettings {
  private readonly app: App;
  private explorerMode: ExplorerMode = "properties";
  private order: TagOrderSettings = this.defaultOrder();

  constructor(app: App, private readonly store: FacetFoldersDataStore) {
    this.app = app;
  }

  async load(): Promise<void> {
    const data = await this.readData();
    this.explorerMode =
      data.explorerMode === "folders" || data.explorerMode === "tags"
        ? data.explorerMode
        : "properties";
    this.order = this.normalizeOrder(data.tagOrder);
  }

  getExplorerMode(): ExplorerMode {
    return this.explorerMode;
  }

  async setExplorerMode(mode: ExplorerMode): Promise<void> {
    this.explorerMode = mode;
    await this.save();
  }

  getOrderMode(): PropertyOrderMode {
    return this.order.mode;
  }

  async setOrderMode(mode: PropertyOrderMode, roots: TagTreeNode[]): Promise<void> {
    if (this.order.mode === mode) return;
    if (mode === "manual" && !this.order.manualInitialized) {
      this.captureManualOrder(roots);
    }
    this.order.mode = mode;
    await this.save();
  }

  orderNodes(nodes: TagTreeNode[], parentPath: string): TagTreeNode[] {
    const scope = this.scope(parentPath);
    if (this.order.mode === "alphabetical") {
      const pinned = new Map(
        (this.order.pinnedByParent[scope] ?? []).map((path, index) => [path, index]),
      );
      return [...nodes].sort((a, b) => {
        const aPin = pinned.get(a.path);
        const bPin = pinned.get(b.path);
        if (aPin !== undefined || bPin !== undefined) {
          if (aPin === undefined) return 1;
          if (bPin === undefined) return -1;
          return aPin - bPin;
        }
        return a.name.localeCompare(b.name);
      });
    }

    const manual = this.order.manualByParent[scope] ?? [];
    const index = new Map(manual.map((path, position) => [path, position]));
    return [...nodes].sort((a, b) => {
      const aIndex = index.get(a.path);
      const bIndex = index.get(b.path);
      if (aIndex !== undefined || bIndex !== undefined) {
        if (aIndex === undefined) return 1;
        if (bIndex === undefined) return -1;
        return aIndex - bIndex;
      }
      return a.name.localeCompare(b.name);
    });
  }

  isPinned(parentPath: string, tagPath: string): boolean {
    return (this.order.pinnedByParent[this.scope(parentPath)] ?? []).includes(tagPath);
  }

  async togglePinned(parentPath: string, tagPath: string): Promise<void> {
    const scope = this.scope(parentPath);
    const current = this.order.pinnedByParent[scope] ?? [];
    this.order.pinnedByParent[scope] = current.includes(tagPath)
      ? current.filter((path) => path !== tagPath)
      : [...current, tagPath];
    await this.save();
  }

  async moveTag(
    parentPath: string,
    sourcePath: string,
    targetPath: string,
    placement: "before" | "after",
    siblings: TagTreeNode[],
  ): Promise<void> {
    const scope = this.scope(parentPath);
    const current = this.orderNodes(siblings, parentPath).map((node) => node.path);
    if (
      sourcePath === targetPath ||
      !current.includes(sourcePath) ||
      !current.includes(targetPath)
    ) {
      return;
    }
    const result = current.filter((path) => path !== sourcePath);
    const targetIndex = result.indexOf(targetPath);
    result.splice(targetIndex + (placement === "after" ? 1 : 0), 0, sourcePath);
    this.order.manualByParent[scope] = result;
    this.order.manualInitialized = true;
    await this.save();
  }

  private captureManualOrder(roots: TagTreeNode[]): void {
    this.order.manualByParent = {};
    const capture = (nodes: TagTreeNode[], parentPath: string): void => {
      const ordered = this.orderNodes(nodes, parentPath);
      this.order.manualByParent[this.scope(parentPath)] = ordered.map((node) => node.path);
      for (const node of ordered) capture(node.children, node.path);
    };
    capture(roots, "");
    this.order.manualInitialized = true;
  }

  private scope(parentPath: string): string {
    return parentPath || ROOT_SCOPE;
  }

  private defaultOrder(): TagOrderSettings {
    return {
      mode: "alphabetical",
      pinnedByParent: {},
      manualInitialized: false,
      manualByParent: {},
    };
  }

  private normalizeOrder(value: Partial<TagOrderSettings> | undefined): TagOrderSettings {
    if (!value || typeof value !== "object") return this.defaultOrder();
    return {
      mode: value.mode === "manual" ? "manual" : "alphabetical",
      pinnedByParent: this.normalizeMap(value.pinnedByParent),
      manualInitialized: value.manualInitialized === true,
      manualByParent: this.normalizeMap(value.manualByParent),
    };
  }

  private normalizeMap(value: unknown): Record<string, string[]> {
    if (!value || typeof value !== "object") return {};
    const result: Record<string, string[]> = {};
    for (const [scope, paths] of Object.entries(value)) {
      result[scope] = Array.isArray(paths)
        ? Array.from(
            new Set(paths.filter((path): path is string => typeof path === "string")),
          )
        : [];
    }
    return result;
  }

  private async readData(): Promise<ExplorerData> {
    try {
      return await this.store.read<ExplorerData>();
    } catch (error) {
      console.error("Facet Folders: cannot read tag settings", error);
      return {};
    }
  }

  private async save(): Promise<void> {
    await this.store.update((data) => {
      data.explorerMode = this.explorerMode;
      data.tagOrder = this.order;
    });
  }
}
