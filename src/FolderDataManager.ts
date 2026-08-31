import { App, getAllTags, TFile, TFolder } from "obsidian";
import type { FolderGroupingRule } from "./FolderExplorerSettings";

export const UNSET_GROUP = "未设置";

export interface VirtualFolderGroup {
  name: string;
  files: TFile[];
}

export class FolderDataManager {
  private readonly folderCounts = new Map<string, number>();
  private propertyKeys: string[] = [];
  private tagPrefixes: string[] = [];

  constructor(private readonly app: App) {}

  buildIndex(): void {
    this.folderCounts.clear();
    const properties = new Set<string>();
    const prefixes = new Set<string>();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      for (const key of Object.keys(cache?.frontmatter ?? {})) {
        if (key && key !== "position") properties.add(key);
      }
      for (const rawTag of cache ? getAllTags(cache) ?? [] : []) {
        const tag = this.normalizeTag(rawTag);
        const segments = tag.split("/").filter(Boolean);
        for (let index = 1; index < segments.length; index += 1) {
          prefixes.add(segments.slice(0, index).join("/"));
        }
      }
    }
    this.propertyKeys = Array.from(properties).sort((a, b) => a.localeCompare(b));
    this.tagPrefixes = Array.from(prefixes).sort((a, b) => a.localeCompare(b));
    this.countFolder(this.app.vault.getRoot());
  }

  getPropertyKeys(): string[] {
    return [...this.propertyKeys];
  }

  getTagPrefixes(): string[] {
    return [...this.tagPrefixes];
  }

  getFolderCount(folder: TFolder): number {
    return this.folderCounts.get(folder.path) ?? this.countFolder(folder);
  }

  getDirectFolders(folder: TFolder): TFolder[] {
    return folder.children
      .filter((child): child is TFolder => child instanceof TFolder)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getDirectMarkdownFiles(folder: TFolder): TFile[] {
    return folder.children
      .filter(
        (child): child is TFile => child instanceof TFile && child.extension === "md",
      )
      .sort((a, b) => a.basename.localeCompare(b.basename));
  }

  getDirectFiles(folder: TFolder): TFile[] {
    return folder.children
      .filter((child): child is TFile => child instanceof TFile)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getRecursiveMarkdownFiles(folder: TFolder): TFile[] {
    const result: TFile[] = [];
    const visit = (current: TFolder): void => {
      for (const child of current.children) {
        if (child instanceof TFolder) visit(child);
        else if (child instanceof TFile && child.extension === "md") result.push(child);
      }
    };
    visit(folder);
    return result.sort((a, b) => a.path.localeCompare(b.path));
  }

  getVirtualGroups(folder: TFolder, rule: FolderGroupingRule): VirtualFolderGroup[] {
    const groups = new Map<string, Map<string, TFile>>();
    for (const file of this.getRecursiveMarkdownFiles(folder)) {
      const values =
        rule.kind === "property"
          ? this.getPropertyValues(file, rule.key)
          : this.getTagValues(file, rule.prefix);
      for (const value of values.length > 0 ? values : [UNSET_GROUP]) {
        const files = groups.get(value) ?? new Map<string, TFile>();
        files.set(file.path, file);
        groups.set(value, files);
      }
    }
    return Array.from(groups.entries())
      .map(([name, files]) => ({
        name,
        files: Array.from(files.values()).sort((a, b) =>
          a.basename.localeCompare(b.basename),
        ),
      }))
      .sort((a, b) => {
        if (a.name === UNSET_GROUP) return 1;
        if (b.name === UNSET_GROUP) return -1;
        return a.name.localeCompare(b.name);
      });
  }

  private getPropertyValues(file: TFile, key: string): string[] {
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter || !Object.prototype.hasOwnProperty.call(frontmatter, key)) return [];
    return this.normalizeValue(frontmatter[key]).filter((value) => value !== "（空值）");
  }

  private getTagValues(file: TFile, prefix: string): string[] {
    const cache = this.app.metadataCache.getFileCache(file);
    const tags = cache ? getAllTags(cache) ?? [] : [];
    const values = new Set<string>();
    for (const rawTag of tags) {
      const tag = this.normalizeTag(rawTag);
      if (!tag.startsWith(`${prefix}/`)) continue;
      const remainder = tag.slice(prefix.length + 1);
      const firstSegment = remainder.split("/")[0];
      if (firstSegment) values.add(firstSegment);
    }
    return Array.from(values);
  }

  private countFolder(folder: TFolder): number {
    let count = 0;
    for (const child of folder.children) {
      if (child instanceof TFolder) count += this.countFolder(child);
      else if (child instanceof TFile && child.extension === "md") count += 1;
    }
    this.folderCounts.set(folder.path, count);
    return count;
  }

  private normalizeTag(tag: string): string {
    return tag.trim().replace(/^#+/, "").replace(/^\/+|\/+$/g, "");
  }

  private normalizeValue(raw: unknown): string[] {
    if (raw === null || raw === undefined) return [];
    if (Array.isArray(raw)) {
      return Array.from(new Set(raw.flatMap((value) => this.normalizeValue(value))));
    }
    if (typeof raw === "object") {
      try {
        const serialized = JSON.stringify(raw);
        return serialized ? [serialized] : [];
      } catch {
        return ["[无法序列化的对象]"];
      }
    }
    if (
      typeof raw !== "string" &&
      typeof raw !== "number" &&
      typeof raw !== "boolean" &&
      typeof raw !== "bigint"
    ) {
      return [];
    }
    const value = String(raw).trim();
    return value ? [value] : [];
  }
}
