import { App, getAllTags, TFile } from "obsidian";

export interface TagTreeNode {
  name: string;
  path: string;
  parentPath: string;
  files: TFile[];
  allFiles: TFile[];
  children: TagTreeNode[];
}

interface MutableTagNode {
  name: string;
  path: string;
  parentPath: string;
  files: Map<string, TFile>;
  children: Map<string, MutableTagNode>;
}

export class TagDataManager {
  private readonly app: App;
  private readonly tagFiles = new Map<string, Map<string, TFile>>();
  private readonly fileTags = new Map<string, Set<string>>();

  constructor(app: App) {
    this.app = app;
  }

  async buildIndex(): Promise<void> {
    this.tagFiles.clear();
    this.fileTags.clear();
    for (const file of this.app.vault.getMarkdownFiles()) this.indexFile(file);
  }

  async updateFile(file: TFile): Promise<void> {
    this.removePath(file.path);
    this.indexFile(file);
  }

  removeFile(file: TFile): void {
    this.removePath(file.path);
  }

  renameFile(file: TFile, oldPath: string): void {
    this.removePath(oldPath);
    this.indexFile(file);
  }

  getTagNames(): string[] {
    return Array.from(this.tagFiles.keys()).sort((a, b) => a.localeCompare(b));
  }

  getTree(): TagTreeNode[] {
    const roots = new Map<string, MutableTagNode>();
    for (const [tagPath, files] of this.tagFiles) {
      const segments = tagPath.split("/").filter(Boolean);
      let siblings = roots;
      let parentPath = "";
      let current: MutableTagNode | null = null;
      for (const segment of segments) {
        const path = parentPath ? `${parentPath}/${segment}` : segment;
        current = siblings.get(segment) ?? {
          name: segment,
          path,
          parentPath,
          files: new Map<string, TFile>(),
          children: new Map<string, MutableTagNode>(),
        };
        siblings.set(segment, current);
        siblings = current.children;
        parentPath = path;
      }
      if (!current) continue;
      for (const [path, file] of files) current.files.set(path, file);
    }
    return Array.from(roots.values()).map((node) => this.freezeNode(node));
  }

  private indexFile(file: TFile): void {
    const cache = this.app.metadataCache.getFileCache(file);
    const rawTags = cache ? getAllTags(cache) ?? [] : [];
    const tags = new Set(
      rawTags
        .map((tag) => this.normalizeTag(tag))
        .filter((tag): tag is string => Boolean(tag)),
    );
    if (tags.size === 0) return;
    this.fileTags.set(file.path, tags);
    for (const tag of tags) {
      const files = this.tagFiles.get(tag) ?? new Map<string, TFile>();
      files.set(file.path, file);
      this.tagFiles.set(tag, files);
    }
  }

  private removePath(filePath: string): void {
    const tags = this.fileTags.get(filePath);
    if (!tags) return;
    this.fileTags.delete(filePath);
    for (const tag of tags) {
      const files = this.tagFiles.get(tag);
      if (!files) continue;
      files.delete(filePath);
      if (files.size === 0) this.tagFiles.delete(tag);
    }
  }

  private normalizeTag(tag: string): string {
    return tag.trim().replace(/^#+/, "").replace(/^\/+|\/+$/g, "");
  }

  private freezeNode(node: MutableTagNode): TagTreeNode {
    const children = Array.from(node.children.values()).map((child) =>
      this.freezeNode(child),
    );
    const allFiles = new Map(node.files);
    for (const child of children) {
      for (const file of child.allFiles) allFiles.set(file.path, file);
    }
    return {
      name: node.name,
      path: node.path,
      parentPath: node.parentPath,
      files: Array.from(node.files.values()).sort((a, b) =>
        a.basename.localeCompare(b.basename),
      ),
      allFiles: Array.from(allFiles.values()).sort((a, b) =>
        a.basename.localeCompare(b.basename),
      ),
      children,
    };
  }
}
