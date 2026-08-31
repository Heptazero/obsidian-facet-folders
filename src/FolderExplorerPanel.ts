import { App, Menu, setIcon, TFile, TFolder } from "obsidian";
import { FolderDataManager, VirtualFolderGroup } from "./FolderDataManager";
import {
  FolderExplorerSettings,
  FolderGroupingRule,
} from "./FolderExplorerSettings";
import { openFolderGroupingPicker } from "./FolderGroupingModal";

const HOVER_SOURCE = "grouped-property-explorer";
const FILE_MENU_SOURCE = "metadata-explorer-folder-view";

interface FolderPanelCallbacks {
  requestRender: () => void;
}

export class FolderExplorerPanel {
  private readonly data: FolderDataManager;
  private readonly settings: FolderExplorerSettings;
  private query = "";

  constructor(
    private readonly app: App,
    private readonly callbacks: FolderPanelCallbacks,
  ) {
    this.data = new FolderDataManager(app);
    this.settings = new FolderExplorerSettings(app);
  }

  async load(): Promise<void> {
    await this.settings.load();
    this.data.buildIndex();
  }

  refreshIndex(): void {
    this.data.buildIndex();
  }

  async renamePath(oldPath: string, newPath: string): Promise<void> {
    await this.settings.renamePath(oldPath, newPath);
    this.data.buildIndex();
  }

  async deletePath(path: string): Promise<void> {
    await this.settings.deletePath(path);
    this.data.buildIndex();
  }

  hasGrouping(folder: TFolder): boolean {
    return Boolean(this.settings.getGrouping(folder.path));
  }

  configureFolder(folder: TFolder, kind: "property" | "tag"): void {
    const options =
      kind === "property" ? this.data.getPropertyKeys() : this.data.getTagPrefixes();
    openFolderGroupingPicker(this.app, kind, options, (rule) => {
      void this.settings.setGrouping(folder.path, rule).then(() => {
        this.callbacks.requestRender();
      });
    });
  }

  async removeGrouping(folder: TFolder): Promise<void> {
    await this.settings.removeGrouping(folder.path);
    this.callbacks.requestRender();
  }

  render(container: HTMLElement, query: string): void {
    this.query = query.trim().toLowerCase();
    container.empty();
    const root = this.app.vault.getRoot();
    const folders = this.data.getDirectFolders(root).filter((folder) =>
      this.folderMatches(folder),
    );
    const files = this.filterFiles(this.orderFiles(root, this.data.getDirectFiles(root)));
    const rootRule = this.settings.getGrouping(root.path);
    if (folders.length === 0 && files.length === 0 && !rootRule) {
      const empty = container.createDiv("gpe-empty");
      setIcon(empty.createDiv("gpe-empty-icon"), this.query ? "search-x" : "folder-open");
      empty.createDiv({
        cls: "gpe-empty-text",
        text: this.query ? "没有匹配的文件夹或笔记" : "库中没有笔记",
      });
      return;
    }
    const fragment = container.ownerDocument.createDocumentFragment();
    if (rootRule) fragment.appendChild(this.buildGroupingBranch(root, rootRule));
    for (const folder of folders) fragment.appendChild(this.buildFolder(folder, 0));
    for (const file of files) fragment.appendChild(this.buildFile(file, root));
    container.appendChild(fragment);
  }

  private buildFolder(folder: TFolder, depth: number): HTMLElement {
    const expanded = Boolean(this.query) || this.settings.isFolderExpanded(folder.path);
    const wrap = createDiv("gpe-folder-node");
    wrap.dataset.folderPath = folder.path;
    wrap.style.setProperty("--gpe-folder-depth", String(depth));
    const header = wrap.createDiv("gpe-folder-header");
    if (expanded) header.addClass("is-expanded");
    setIcon(header.createDiv("gpe-chevron"), "chevron-right");
    setIcon(header.createDiv("gpe-folder-icon"), expanded ? "folder-open" : "folder");
    this.highlightText(header.createDiv("gpe-folder-name"), folder.name);
    header.createDiv({ cls: "gpe-count", text: String(this.data.getFolderCount(folder)) });
    header.addEventListener("click", () => {
      void this.settings.toggleFolder(folder.path).then(() => this.callbacks.requestRender());
    });
    header.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.openFolderMenu(event, folder);
    });
    if (expanded) this.renderFolderChildren(wrap, folder, depth);
    return wrap;
  }

  private renderFolderChildren(wrap: HTMLElement, folder: TFolder, depth: number): void {
    const children = wrap.createDiv("gpe-folder-children");
    const folders = this.data.getDirectFolders(folder).filter((child) =>
      this.folderMatches(child),
    );
    for (const child of folders) children.appendChild(this.buildFolder(child, depth + 1));
    const rule = this.settings.getGrouping(folder.path);
    if (rule) children.appendChild(this.buildGroupingBranch(folder, rule));
    const files = this.filterFiles(
      this.orderFiles(folder, this.data.getDirectFiles(folder)),
    );
    for (const file of files) children.appendChild(this.buildFile(file, folder));
  }

  private buildGroupingBranch(folder: TFolder, rule: FolderGroupingRule): HTMLElement {
    const id = this.settings.groupingBranchId(folder.path, rule);
    const groups = this.filterGroups(this.data.getVirtualGroups(folder, rule));
    const expanded = Boolean(this.query) || this.settings.isVirtualExpanded(id);
    const wrap = createDiv("gpe-virtual-node gpe-virtual-root");
    const header = wrap.createDiv("gpe-virtual-header");
    if (expanded) header.addClass("is-expanded");
    setIcon(header.createDiv("gpe-chevron"), "chevron-right");
    setIcon(header.createDiv("gpe-folder-icon"), rule.kind === "property" ? "list-tree" : "tags");
    const label = rule.kind === "property" ? rule.key : rule.prefix;
    this.highlightText(header.createDiv("gpe-folder-name"), label);
    header.createDiv({
      cls: "gpe-count",
      text: String(this.data.getRecursiveMarkdownFiles(folder).length),
    });
    header.addEventListener("click", () => {
      void this.settings.toggleVirtual(id).then(() => this.callbacks.requestRender());
    });
    header.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const menu = new Menu();
      menu.addItem((item) =>
        item
          .setIcon("pencil")
          .setTitle("更换分组字段…")
          .onClick(() => this.configureFolder(folder, rule.kind)),
      );
      menu.addItem((item) =>
        item
          .setIcon("ungroup")
          .setTitle("移除虚拟分组")
          .setWarning(true)
          .onClick(() => void this.removeGrouping(folder)),
      );
      menu.showAtMouseEvent(event);
    });
    if (expanded) {
      const children = wrap.createDiv("gpe-virtual-children");
      for (const group of groups) children.appendChild(this.buildValueGroup(id, group));
    }
    return wrap;
  }

  private buildValueGroup(parentId: string, group: VirtualFolderGroup): HTMLElement {
    const id = `${parentId}::${group.name}`;
    const expanded = Boolean(this.query) || this.settings.isVirtualExpanded(id);
    const wrap = createDiv("gpe-virtual-node");
    const header = wrap.createDiv("gpe-virtual-header");
    if (expanded) header.addClass("is-expanded");
    setIcon(header.createDiv("gpe-chevron"), "chevron-right");
    setIcon(header.createDiv("gpe-folder-icon"), expanded ? "folder-open" : "folder");
    this.highlightText(header.createDiv("gpe-folder-name"), group.name);
    header.createDiv({ cls: "gpe-count", text: String(group.files.length) });
    header.addEventListener("click", () => {
      void this.settings.toggleVirtual(id).then(() => this.callbacks.requestRender());
    });
    if (expanded) {
      const children = wrap.createDiv("gpe-virtual-files");
      for (const file of this.filterFiles(group.files)) {
        children.appendChild(this.buildFile(file, file.parent, true));
      }
    }
    return wrap;
  }

  private buildFile(
    file: TFile,
    parent: TFolder | null,
    showPath = false,
  ): HTMLElement {
    const row = createDiv("gpe-folder-file");
    if (this.app.workspace.getActiveFile()?.path === file.path) row.addClass("is-active");
    if (parent && this.settings.isPinned(parent.path, file.path)) {
      row.addClass("is-pinned");
      setIcon(row.createDiv("gpe-pin-icon"), "pin");
    } else {
      setIcon(row.createDiv("gpe-note-icon"), file.extension === "md" ? "file-text" : "file");
    }
    this.highlightText(
      row.createDiv("gpe-note-name"),
      file.extension === "md" ? file.basename : file.name,
    );
    if (showPath && file.parent && file.parent.path !== "/") {
      row.createDiv({ cls: "gpe-note-path", text: file.parent.path });
    }
    row.addEventListener("click", () => void this.app.workspace.getLeaf(false).openFile(file));
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.openFileMenu(event, file, parent);
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

  private openFolderMenu(event: MouseEvent, folder: TFolder): void {
    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setIcon("list-tree")
        .setTitle("按属性分组…")
        .onClick(() => this.configureFolder(folder, "property")),
    );
    menu.addItem((item) =>
      item
        .setIcon("tags")
        .setTitle("按标签前缀分组…")
        .onClick(() => this.configureFolder(folder, "tag")),
    );
    if (this.settings.getGrouping(folder.path)) {
      menu.addItem((item) =>
        item
          .setIcon("ungroup")
          .setTitle("移除虚拟分组")
          .setWarning(true)
          .onClick(() => void this.removeGrouping(folder)),
      );
    }
    menu.addSeparator();
    this.app.workspace.trigger("file-menu", menu, folder, FILE_MENU_SOURCE);
    menu.showAtMouseEvent(event);
  }

  private openFileMenu(event: MouseEvent, file: TFile, parent: TFolder | null): void {
    const menu = new Menu();
    if (parent) this.addPinMenu(menu, file, parent);
    menu.addSeparator();
    this.app.workspace.trigger("file-menu", menu, file, FILE_MENU_SOURCE);
    menu.showAtMouseEvent(event);
  }

  private addPinMenu(menu: Menu, file: TFile, folder: TFolder): void {
    const pinned = this.settings.isPinned(folder.path, file.path);
    menu.addItem((item) =>
      item
        .setIcon(pinned ? "pin-off" : "pin")
        .setTitle(pinned ? "取消置顶" : "置顶到文件夹顶部")
        .onClick(() => {
          void this.settings.togglePinned(folder.path, file.path).then(() =>
            this.callbacks.requestRender(),
          );
        }),
    );
    if (!pinned) return;
    const pins = this.settings.getPinned(folder.path);
    const index = pins.indexOf(file.path);
    if (index > 0) {
      menu.addItem((item) =>
        item.setIcon("arrow-up").setTitle("向上移动置顶笔记").onClick(() => {
          void this.settings.movePin(folder.path, file.path, -1).then(() =>
            this.callbacks.requestRender(),
          );
        }),
      );
    }
    if (index >= 0 && index < pins.length - 1) {
      menu.addItem((item) =>
        item.setIcon("arrow-down").setTitle("向下移动置顶笔记").onClick(() => {
          void this.settings.movePin(folder.path, file.path, 1).then(() =>
            this.callbacks.requestRender(),
          );
        }),
      );
    }
  }

  private orderFiles(folder: TFolder, files: TFile[]): TFile[] {
    const pins = this.settings.getPinned(folder.path);
    const pinIndex = new Map(pins.map((path, index) => [path, index]));
    return [...files].sort((a, b) => {
      const aPin = pinIndex.get(a.path);
      const bPin = pinIndex.get(b.path);
      if (aPin !== undefined || bPin !== undefined) {
        if (aPin === undefined) return 1;
        if (bPin === undefined) return -1;
        return aPin - bPin;
      }
      return a.basename.localeCompare(b.basename);
    });
  }

  private folderMatches(folder: TFolder): boolean {
    if (!this.query || folder.name.toLowerCase().includes(this.query)) return true;
    const rule = this.settings.getGrouping(folder.path);
    if (rule) {
      const label = rule.kind === "property" ? rule.key : rule.prefix;
      if (label.toLowerCase().includes(this.query)) return true;
      if (
        this.data
          .getVirtualGroups(folder, rule)
          .some((group) => group.name.toLowerCase().includes(this.query))
      ) {
        return true;
      }
    }
    return folder.children.some((child) => {
      if (child instanceof TFolder) return this.folderMatches(child);
      return child instanceof TFile && child.name.toLowerCase().includes(this.query);
    });
  }

  private filterFiles(files: TFile[]): TFile[] {
    if (!this.query) return files;
    return files.filter(
      (file) =>
        file.basename.toLowerCase().includes(this.query) ||
        file.path.toLowerCase().includes(this.query),
    );
  }

  private filterGroups(groups: VirtualFolderGroup[]): VirtualFolderGroup[] {
    if (!this.query) return groups;
    return groups
      .map((group) => ({ ...group, files: this.filterFiles(group.files) }))
      .filter(
        (group) =>
          group.name.toLowerCase().includes(this.query) || group.files.length > 0,
      );
  }

  private highlightText(element: HTMLElement, text: string): void {
    if (!this.query) {
      element.textContent = text;
      return;
    }
    const index = text.toLowerCase().indexOf(this.query);
    if (index < 0) {
      element.textContent = text;
      return;
    }
    element.createSpan({ text: text.slice(0, index) });
    element.createEl("mark", {
      cls: "gpe-highlight",
      text: text.slice(index, index + this.query.length),
    });
    element.createSpan({ text: text.slice(index + this.query.length) });
  }
}

export const FOLDER_FILE_MENU_SOURCE = FILE_MENU_SOURCE;
