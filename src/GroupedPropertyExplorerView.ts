import {
  debounce,
  Events,
  ItemView,
  Notice,
  setIcon,
  TAbstractFile,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import type { PropertyOrderMode } from "./FfgGrouping";
import { FolderExplorerPanel } from "./FolderExplorerPanel";
import { PropertyExplorerPanel } from "./PropertyExplorerPanel";
import { TagExplorerPanel } from "./TagExplorerPanel";
import type { ExplorerMode } from "./TagExplorerSettings";
import type GroupedPropertyExplorerPlugin from "./main";

export const VIEW_TYPE_GROUPED_PROPERTY_EXPLORER = "grouped-property-explorer";

export class GroupedPropertyExplorerView extends ItemView {
  private readonly propertyExplorer: PropertyExplorerPanel;
  private readonly tagExplorer: TagExplorerPanel;
  private readonly folderExplorer: FolderExplorerPanel;
  private explorerMode: ExplorerMode = "properties";
  private searchQuery = "";
  private listEl!: HTMLElement;
  private loadingEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private alphabeticalModeButton!: HTMLButtonElement;
  private manualModeButton!: HTMLButtonElement;
  private propertyViewButton!: HTMLButtonElement;
  private tagViewButton!: HTMLButtonElement;
  private folderViewButton!: HTMLButtonElement;
  private orderSwitchEl!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private clearSearchButton!: HTMLElement;
  private addGroupButton!: HTMLElement;
  private tagSelectionButton!: HTMLElement;
  private loadStarted = false;

  constructor(leaf: WorkspaceLeaf, plugin: GroupedPropertyExplorerPlugin) {
    super(leaf);
    this.tagExplorer = new TagExplorerPanel(plugin.app, {
      requestRender: () => this.renderList(),
    });
    this.folderExplorer = new FolderExplorerPanel(plugin.app, {
      requestRender: () => this.renderList(),
    });
    this.propertyExplorer = new PropertyExplorerPanel(plugin.app, {
      requestRender: () => this.renderList(),
      setLoading: (text) => this.setLoading(text),
      hideLoading: () => this.loadingEl.hide(),
      rebuildTagIndex: () => this.tagExplorer.rebuildIndex(),
    });
  }

  getViewType(): string {
    return VIEW_TYPE_GROUPED_PROPERTY_EXPLORER;
  }

  getDisplayText(): string {
    return "多维文件夹";
  }

  getIcon(): string {
    return "list-tree";
  }

  async onOpen(): Promise<void> {
    this.buildStaticUi();
    this.registerVaultEvents();
    const start = () => {
      if (this.loadStarted) return;
      this.loadStarted = true;
      void this.reloadEverything();
    };
    this.registerEvent(this.app.metadataCache.on("resolved", start));
    this.app.workspace.onLayoutReady(start);
  }

  async onClose(): Promise<void> {
    (
      this.app.workspace as unknown as {
        unregisterHoverLinkSource: (source: string) => void;
      }
    ).unregisterHoverLinkSource(VIEW_TYPE_GROUPED_PROPERTY_EXPLORER);
  }

  async refresh(): Promise<void> {
    await this.reloadEverything();
  }

  async openFolderGrouping(
    folder: import("obsidian").TFolder,
    kind: "property" | "tag",
  ): Promise<void> {
    await this.setExplorerMode("folders");
    this.folderExplorer.configureFolder(folder, kind);
  }

  async removeFolderGrouping(folder: import("obsidian").TFolder): Promise<void> {
    await this.setExplorerMode("folders");
    await this.folderExplorer.removeGrouping(folder);
  }

  hasFolderGrouping(folder: import("obsidian").TFolder): boolean {
    return this.folderExplorer.hasGrouping(folder);
  }

  private buildStaticUi(): void {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("gpe-root");
    this.buildViewSwitch(root);
    this.buildToolbar(root);
    this.statusEl = root.createDiv("gpe-status");
    this.statusEl.hide();
    this.loadingEl = root.createDiv("gpe-loading");
    setIcon(this.loadingEl.createDiv("gpe-loading-icon"), "loader");
    this.loadingEl.createSpan({ text: "正在索引属性…" });
    this.loadingEl.hide();
    this.listEl = root.createDiv("gpe-list");
    this.updateExplorerModeControl();
  }

  private buildViewSwitch(root: HTMLElement): void {
    const switchEl = root.createDiv({
      cls: "gpe-view-switch",
      attr: { role: "group", "aria-label": "浏览内容" },
    });
    this.folderViewButton = switchEl.createEl("button", {
      cls: "gpe-view-mode-button",
      text: "文件夹",
      attr: { type: "button", "aria-label": "浏览文件夹" },
    });
    this.propertyViewButton = switchEl.createEl("button", {
      cls: "gpe-view-mode-button",
      text: "属性",
      attr: { type: "button", "aria-label": "浏览属性" },
    });
    this.tagViewButton = switchEl.createEl("button", {
      cls: "gpe-view-mode-button",
      text: "标签",
      attr: { type: "button", "aria-label": "浏览标签" },
    });
    this.folderViewButton.addEventListener("click", () => {
      void this.setExplorerMode("folders");
    });
    this.propertyViewButton.addEventListener("click", () => {
      void this.setExplorerMode("properties");
    });
    this.tagViewButton.addEventListener("click", () => {
      void this.setExplorerMode("tags");
    });
  }

  private buildToolbar(root: HTMLElement): void {
    const toolbar = root.createDiv("gpe-toolbar");
    const searchWrap = toolbar.createDiv("gpe-search-wrap");
    setIcon(searchWrap.createDiv("gpe-search-icon"), "search");
    this.searchInput = searchWrap.createEl("input", {
      cls: "gpe-search-input",
      attr: {
        type: "search",
        placeholder: "搜索属性、值或笔记…",
        spellcheck: "false",
      },
    });
    this.clearSearchButton = searchWrap.createDiv({
      cls: "gpe-search-clear",
      attr: { "aria-label": "清除搜索" },
    });
    setIcon(this.clearSearchButton, "x");
    this.clearSearchButton.hide();
    this.clearSearchButton.addEventListener("click", () => this.clearSearch());
    this.searchInput.addEventListener(
      "input",
      debounce(() => this.updateSearch(), 120, true),
    );
    this.buildOrderSwitch(toolbar);
    this.addGroupButton = this.toolbarButton(toolbar, "plus", "新建属性组");
    this.addGroupButton.addEventListener("click", () => {
      this.propertyExplorer.openGroupEditor();
    });
    this.tagSelectionButton = this.toolbarButton(
      toolbar,
      "list-checks",
      "多选笔记并批量修改标签",
    );
    this.tagSelectionButton.addEventListener("click", () => {
      this.tagExplorer.toggleSelectionMode();
    });
    const refresh = this.toolbarButton(toolbar, "refresh-cw", "刷新当前索引");
    refresh.addEventListener("click", () => void this.reloadEverything());
  }

  private buildOrderSwitch(toolbar: HTMLElement): void {
    const orderSwitch = toolbar.createDiv({
      cls: "gpe-order-switch",
      attr: { role: "group", "aria-label": "排序方式" },
    });
    this.orderSwitchEl = orderSwitch;
    this.alphabeticalModeButton = orderSwitch.createEl("button", {
      cls: "gpe-order-mode-button",
      attr: { type: "button", "aria-label": "按字母排序；右键可置顶" },
    });
    setIcon(this.alphabeticalModeButton, "arrow-down-a-z");
    this.alphabeticalModeButton.addEventListener("click", () => {
      void this.setOrderMode("alphabetical");
    });
    this.manualModeButton = orderSwitch.createEl("button", {
      cls: "gpe-order-mode-button",
      attr: { type: "button", "aria-label": "手动排序；拖动行尾把手" },
    });
    setIcon(this.manualModeButton, "grip-vertical");
    this.manualModeButton.addEventListener("click", () => {
      void this.setOrderMode("manual");
    });
  }

  private toolbarButton(parent: HTMLElement, icon: string, label: string): HTMLElement {
    const button = parent.createDiv({
      cls: "gpe-toolbar-button clickable-icon",
      attr: { "aria-label": label },
    });
    setIcon(button, icon);
    return button;
  }

  private async reloadEverything(): Promise<void> {
    this.loadingEl.show();
    this.listEl.empty();
    await Promise.all([
      this.propertyExplorer.load(),
      this.tagExplorer.load(),
      this.folderExplorer.load(),
    ]);
    this.explorerMode = this.tagExplorer.getExplorerMode();
    this.loadingEl.hide();
    this.renderList();
  }

  private registerVaultEvents(): void {
    const onChanged = debounce(async (file: TFile) => {
      if (file.extension !== "md") return;
      await Promise.all([
        this.propertyExplorer.updateFile(file),
        this.tagExplorer.updateFile(file),
      ]);
      this.folderExplorer.refreshIndex();
      this.renderList();
    }, 350, true);
    this.registerEvent(this.app.metadataCache.on("changed", onChanged));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      if (this.explorerMode === "folders") this.renderList();
    }));
    this.registerEvent(this.app.vault.on("create", () => {
      this.folderExplorer.refreshIndex();
      this.renderList();
    }));
    this.registerEvent(this.app.vault.on("delete", (file: TAbstractFile) => {
      if (file instanceof TFile && file.extension === "md") {
        this.propertyExplorer.removeFile(file);
        this.tagExplorer.removeFile(file);
      }
      void this.folderExplorer.deletePath(file.path).then(() => this.renderList());
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (file instanceof TFile && file.extension === "md") {
        this.propertyExplorer.renameFile(file, oldPath);
        this.tagExplorer.renameFile(file, oldPath);
      }
      void this.folderExplorer.renamePath(oldPath, file.path).then(() => this.renderList());
    }));
    const typeManager = (this.app as unknown as { metadataTypeManager?: Events })
      .metadataTypeManager;
    if (typeManager) {
      this.registerEvent(typeManager.on("changed", () => {
        this.propertyExplorer.refreshTypes();
        this.renderList();
      }));
    }
    (
      this.app.workspace as unknown as {
        registerHoverLinkSource: (
          source: string,
          options: { defaultMod: boolean; display: string },
        ) => void;
      }
    ).registerHoverLinkSource(VIEW_TYPE_GROUPED_PROPERTY_EXPLORER, {
      defaultMod: true,
      display: "Facet Folders",
    });
  }

  private renderList(preserveScroll = true): void {
    const previousScrollTop = preserveScroll ? this.listEl.scrollTop : 0;
    this.listEl.empty();
    this.updateExplorerModeControl();
    this.updateOrderModeControl();
    if (this.explorerMode === "folders") {
      this.statusEl.hide();
      this.folderExplorer.render(this.listEl, this.searchQuery);
      this.restoreScroll(previousScrollTop);
      return;
    }
    if (this.explorerMode === "tags") {
      this.statusEl.hide();
      this.tagExplorer.render(this.listEl, this.searchQuery);
      this.restoreScroll(previousScrollTop);
      return;
    }
    this.propertyExplorer.render(this.listEl, this.statusEl, this.searchQuery);
    this.restoreScroll(previousScrollTop);
  }

  private async setOrderMode(mode: PropertyOrderMode): Promise<void> {
    try {
      if (this.explorerMode === "tags") await this.tagExplorer.setOrderMode(mode);
      else await this.propertyExplorer.setOrderMode(mode);
      this.renderList();
    } catch (error) {
      console.error("Facet Folders: cannot change order mode", error);
      new Notice("无法保存排序方式，请查看控制台。");
    }
  }

  private async setExplorerMode(mode: ExplorerMode): Promise<void> {
    if (this.explorerMode === mode) return;
    this.explorerMode = mode;
    this.resetSearch();
    await this.tagExplorer.setExplorerMode(mode);
    this.renderList(false);
  }

  private updateExplorerModeControl(): void {
    if (!this.folderViewButton || !this.propertyViewButton || !this.tagViewButton) return;
    this.setModeState(this.folderViewButton, this.explorerMode === "folders");
    this.setModeState(this.propertyViewButton, this.explorerMode === "properties");
    this.setModeState(this.tagViewButton, this.explorerMode === "tags");
    if (this.searchInput) {
      this.searchInput.placeholder =
        this.explorerMode === "folders"
          ? "搜索文件夹或笔记…"
          : this.explorerMode === "tags"
            ? "搜索标签或笔记…"
            : "搜索属性、值或笔记…";
    }
    this.orderSwitchEl?.toggle(this.explorerMode !== "folders");
    this.addGroupButton?.toggle(this.explorerMode === "properties");
    this.tagSelectionButton?.toggle(this.explorerMode === "tags");
    this.tagSelectionButton?.toggleClass(
      "is-active",
      this.explorerMode === "tags" && this.tagExplorer.isSelectionMode(),
    );
  }

  private updateOrderModeControl(): void {
    if (!this.alphabeticalModeButton || !this.manualModeButton) return;
    const mode = this.explorerMode === "tags"
      ? this.tagExplorer.getOrderMode()
      : this.propertyExplorer.getOrderMode();
    this.setModeState(this.alphabeticalModeButton, mode === "alphabetical");
    this.setModeState(this.manualModeButton, mode === "manual");
  }

  private setModeState(button: HTMLButtonElement, active: boolean): void {
    button.toggleClass("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }

  private updateSearch(): void {
    this.searchQuery = this.searchInput.value.trim();
    this.clearSearchButton.toggle(Boolean(this.searchQuery));
    this.renderList(false);
  }

  private clearSearch(): void {
    this.resetSearch();
    this.renderList(false);
  }

  private resetSearch(): void {
    this.searchQuery = "";
    this.searchInput.value = "";
    this.clearSearchButton.hide();
  }

  private restoreScroll(scrollTop: number): void {
    this.listEl.scrollTop = scrollTop;
  }

  private setLoading(text: string): void {
    const label = this.loadingEl.querySelector("span");
    if (label) label.textContent = text;
    this.loadingEl.show();
  }
}
