import { App, Menu, Notice, setIcon, TFile } from "obsidian";
import type { PropertyOrderMode } from "./FfgGrouping";
import { OrderDragController } from "./OrderDragController";
import {
  applyFrontmatterTagBatch,
  TagBatchModal,
  TagBatchOperation,
} from "./TagBatchModal";
import { TagDataManager, TagTreeNode } from "./TagDataManager";
import {
  ExplorerMode,
  TagExplorerSettings,
} from "./TagExplorerSettings";

const HOVER_SOURCE = "grouped-property-explorer";

interface TagExplorerCallbacks {
  requestRender: () => void;
}

export class TagExplorerPanel {
  private readonly app: App;
  private readonly dataManager: TagDataManager;
  private readonly settings: TagExplorerSettings;
  private readonly callbacks: TagExplorerCallbacks;
  private readonly drag = new OrderDragController();
  private readonly expandedTags = new Set<string>();
  private readonly selectedFiles = new Map<string, TFile>();
  private selectionMode = false;

  constructor(app: App, callbacks: TagExplorerCallbacks) {
    this.app = app;
    this.callbacks = callbacks;
    this.dataManager = new TagDataManager(app);
    this.settings = new TagExplorerSettings(app);
  }

  async load(): Promise<void> {
    await Promise.all([this.settings.load(), this.dataManager.buildIndex()]);
  }

  async rebuildIndex(): Promise<void> {
    await this.dataManager.buildIndex();
  }

  async updateFile(file: TFile): Promise<void> {
    await this.dataManager.updateFile(file);
  }

  removeFile(file: TFile): void {
    this.dataManager.removeFile(file);
    this.selectedFiles.delete(file.path);
  }

  renameFile(file: TFile, oldPath: string): void {
    this.dataManager.renameFile(file, oldPath);
    if (this.selectedFiles.delete(oldPath)) this.selectedFiles.set(file.path, file);
  }

  getExplorerMode(): ExplorerMode {
    return this.settings.getExplorerMode();
  }

  async setExplorerMode(mode: ExplorerMode): Promise<void> {
    await this.settings.setExplorerMode(mode);
  }

  getOrderMode(): PropertyOrderMode {
    return this.settings.getOrderMode();
  }

  async setOrderMode(mode: PropertyOrderMode): Promise<void> {
    await this.settings.setOrderMode(mode, this.dataManager.getTree());
  }

  isSelectionMode(): boolean {
    return this.selectionMode;
  }

  toggleSelectionMode(): void {
    this.selectionMode = !this.selectionMode;
    if (!this.selectionMode) this.selectedFiles.clear();
    this.callbacks.requestRender();
  }

  render(container: HTMLElement, query: string): void {
    this.drag.setContainer(container);
    container.empty();
    if (this.selectionMode) this.renderSelectionBar(container);

    const roots = this.filterNodes(this.dataManager.getTree(), query);
    const orderedRoots = this.settings.orderNodes(roots, "");
    if (orderedRoots.length === 0) {
      const empty = container.createDiv("gpe-empty");
      setIcon(empty.createDiv("gpe-empty-icon"), query ? "search-x" : "tags");
      empty.createDiv({
        cls: "gpe-empty-text",
        text: query ? `没有匹配“${query}”的标签或笔记` : "库中没有标签",
      });
      return;
    }

    const fragment = container.ownerDocument.createDocumentFragment();
    for (const node of orderedRoots) {
      fragment.appendChild(this.buildTagNode(node, orderedRoots, query));
    }
    container.appendChild(fragment);
  }

  private buildTagNode(
    node: TagTreeNode,
    siblings: TagTreeNode[],
    query: string,
  ): HTMLElement {
    const expanded = query ? true : this.expandedTags.has(node.path);
    const wrap = createDiv("gpe-tag-node");
    wrap.dataset.tagPath = node.path;
    const header = wrap.createDiv("gpe-tag-header");
    if (expanded) header.addClass("is-expanded");
    header.title = `#${node.path}`;

    const chevron = header.createDiv("gpe-chevron");
    setIcon(chevron, "chevron-right");
    const icon = header.createDiv("gpe-tag-icon");
    setIcon(icon, expanded ? "folder-open" : "folder");
    this.highlightText(header.createDiv("gpe-tag-name"), node.name, query);
    header.createDiv({ cls: "gpe-count", text: String(node.allFiles.length) });
    if (this.canDrag(query)) {
      this.drag.attach(header, wrap, {
        kind: "tag",
        scope: node.parentPath,
        id: node.path,
        label: `调整同级标签“${node.name}”的显示顺序`,
        onMove: async (source, target, placement) => {
          await this.settings.moveTag(
            node.parentPath,
            source,
            target,
            placement,
            siblings,
          );
          this.callbacks.requestRender();
        },
      });
    }

    header.addEventListener("click", () => {
      if (this.expandedTags.has(node.path)) this.expandedTags.delete(node.path);
      else this.expandedTags.add(node.path);
      this.callbacks.requestRender();
    });
    header.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.openTagMenu(event, node);
    });

    if (expanded) {
      const children = wrap.createDiv("gpe-tag-children");
      const orderedChildren = this.settings.orderNodes(node.children, node.path);
      for (const child of orderedChildren) {
        children.appendChild(this.buildTagNode(child, orderedChildren, query));
      }
      for (const file of node.files) children.appendChild(this.buildFileRow(file, query));
    }
    return wrap;
  }

  private buildFileRow(file: TFile, query: string): HTMLElement {
    const row = createDiv("gpe-tag-note");
    if (this.selectionMode) {
      const checkbox = row.createEl("input", {
        cls: "gpe-tag-note-checkbox",
        attr: { type: "checkbox", "aria-label": `选择“${file.basename}”` },
      });
      checkbox.checked = this.selectedFiles.has(file.path);
      checkbox.addEventListener("click", (event) => event.stopPropagation());
      checkbox.addEventListener("change", () => this.setFileSelected(file, checkbox.checked));
    } else {
      const icon = row.createDiv("gpe-note-icon");
      setIcon(icon, "file-text");
    }
    this.highlightText(row.createDiv("gpe-note-name"), file.basename, query);
    if (file.parent && file.parent.path !== "/") {
      row.createDiv({ cls: "gpe-note-path", text: file.parent.path });
    }
    row.addEventListener("click", () => {
      if (this.selectionMode) {
        this.setFileSelected(file, !this.selectedFiles.has(file.path));
        return;
      }
      void this.app.workspace.getLeaf(false).openFile(file);
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const menu = new Menu();
      this.app.workspace.trigger("file-menu", menu, file, this.app.workspace.getLeaf());
      menu.showAtMouseEvent(event);
    });
    row.addEventListener("mouseover", (event) => {
      this.app.workspace.trigger("hover-link", {
        event,
        source: HOVER_SOURCE,
        hoverParent: row,
        targetEl: row,
        linktext: file.path,
      });
    });
    return row;
  }

  private openTagMenu(event: MouseEvent, node: TagTreeNode): void {
    const menu = new Menu();
    const pinned = this.settings.isPinned(node.parentPath, node.path);
    const manual = this.settings.getOrderMode() === "manual";
    menu.addItem((item) =>
      item
        .setIcon(pinned ? "pin-off" : "pin")
        .setTitle(
          `${pinned ? "取消置顶标签" : "置顶标签"}${manual ? "（切换到 A–Z）" : ""}`,
        )
        .onClick(() => void this.togglePinned(node)),
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setIcon("list-checks")
        .setTitle(`选择此标签下的 ${node.allFiles.length} 篇笔记`)
        .onClick(() => this.selectFiles(node.allFiles)),
    );
    menu.addItem((item) =>
      item
        .setIcon("tag")
        .setTitle("批量添加标签…")
        .onClick(() => this.openBatch(node.allFiles, "add", [])),
    );
    menu.addItem((item) =>
      item
        .setIcon("tag-x")
        .setTitle("批量移除标签…")
        .onClick(() => this.openBatch(node.allFiles, "remove", [node.path])),
    );
    menu.showAtMouseEvent(event);
  }

  private renderSelectionBar(container: HTMLElement): void {
    const bar = container.createDiv("gpe-tag-selection-bar");
    bar.createSpan({
      cls: "gpe-tag-selection-count",
      text: `已选 ${this.selectedFiles.size}`,
    });
    const add = this.iconButton(bar, "tag", "添加标签");
    const remove = this.iconButton(bar, "tag-x", "移除标签");
    const clear = this.iconButton(bar, "eraser", "清空选择");
    const close = this.iconButton(bar, "x", "退出多选");
    add.toggleAttribute("disabled", this.selectedFiles.size === 0);
    remove.toggleAttribute("disabled", this.selectedFiles.size === 0);
    clear.toggleAttribute("disabled", this.selectedFiles.size === 0);
    add.addEventListener("click", () =>
      this.openBatch(Array.from(this.selectedFiles.values()), "add", []),
    );
    remove.addEventListener("click", () =>
      this.openBatch(Array.from(this.selectedFiles.values()), "remove", []),
    );
    clear.addEventListener("click", () => {
      this.selectedFiles.clear();
      this.callbacks.requestRender();
    });
    close.addEventListener("click", () => this.toggleSelectionMode());
  }

  private iconButton(parent: HTMLElement, icon: string, label: string): HTMLButtonElement {
    const button = parent.createEl("button", {
      cls: "gpe-tag-selection-button clickable-icon",
      attr: { type: "button", "aria-label": label },
    });
    setIcon(button, icon);
    return button;
  }

  private setFileSelected(file: TFile, selected: boolean): void {
    if (selected) this.selectedFiles.set(file.path, file);
    else this.selectedFiles.delete(file.path);
    this.callbacks.requestRender();
  }

  private selectFiles(files: TFile[]): void {
    this.selectionMode = true;
    for (const file of files) this.selectedFiles.set(file.path, file);
    this.callbacks.requestRender();
  }

  private openBatch(
    files: TFile[],
    operation: TagBatchOperation,
    initialTags: string[],
  ): void {
    const uniqueFiles = Array.from(new Map(files.map((file) => [file.path, file])).values());
    if (uniqueFiles.length === 0) {
      new Notice("没有可修改的笔记。");
      return;
    }
    new TagBatchModal(
      this.app,
      uniqueFiles,
      operation,
      this.dataManager.getTagNames(),
      initialTags,
      async (tags) => {
        const result = await applyFrontmatterTagBatch(
          this.app,
          uniqueFiles,
          operation,
          tags,
        );
        if (result.failures.length > 0) {
          console.error("Facet Folders: some tag updates failed", result.failures);
        }
        new Notice(
          `已更新 ${result.updated} 篇，未变化 ${result.unchanged} 篇${
            result.failures.length > 0 ? `，失败 ${result.failures.length} 篇` : ""
          }。`,
        );
        await new Promise<void>((resolve) => window.setTimeout(resolve, 300));
        await this.dataManager.buildIndex();
        this.selectedFiles.clear();
        this.callbacks.requestRender();
      },
    ).open();
  }

  private async togglePinned(node: TagTreeNode): Promise<void> {
    if (this.settings.getOrderMode() !== "alphabetical") {
      await this.settings.setOrderMode("alphabetical", this.dataManager.getTree());
    }
    await this.settings.togglePinned(node.parentPath, node.path);
    this.callbacks.requestRender();
  }

  private canDrag(query: string): boolean {
    return this.settings.getOrderMode() === "manual" && !query;
  }

  private filterNodes(nodes: TagTreeNode[], query: string): TagTreeNode[] {
    if (!query) return nodes;
    const normalized = query.toLowerCase();
    const result: TagTreeNode[] = [];
    for (const node of nodes) {
      if (node.path.toLowerCase().includes(normalized)) {
        result.push(node);
        continue;
      }
      const children = this.filterNodes(node.children, query);
      const files = node.files.filter(
        (file) =>
          file.basename.toLowerCase().includes(normalized) ||
          file.path.toLowerCase().includes(normalized),
      );
      if (children.length === 0 && files.length === 0) continue;
      const allFiles = new Map(files.map((file) => [file.path, file]));
      for (const child of children) {
        for (const file of child.allFiles) allFiles.set(file.path, file);
      }
      result.push({ ...node, children, files, allFiles: Array.from(allFiles.values()) });
    }
    return result;
  }

  private highlightText(element: HTMLElement, text: string, query: string): void {
    if (!query) {
      element.textContent = text;
      return;
    }
    const index = text.toLowerCase().indexOf(query.toLowerCase());
    if (index < 0) {
      element.textContent = text;
      return;
    }
    element.createSpan({ text: text.slice(0, index) });
    element.createEl("mark", {
      cls: "gpe-highlight",
      text: text.slice(index, index + query.length),
    });
    element.createSpan({ text: text.slice(index + query.length) });
  }
}
