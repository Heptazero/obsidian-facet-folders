import { App, setIcon, TFile } from "obsidian";
import {
  FfgGrouping,
  PropertyOrderMode,
  PropertySection,
  TOP_PROPERTY_SCOPE,
} from "./FfgGrouping";
import { OrderDragController } from "./OrderDragController";
import { PropertyExplorerActions } from "./PropertyExplorerActions";
import {
  EMPTY_VALUE,
  PropertyDataManager,
  PropertyEntry,
  ValueEntry,
} from "./PropertyDataManager";

const HOVER_SOURCE = "grouped-property-explorer";

interface PropertyPanelCallbacks {
  requestRender: () => void;
  setLoading: (text: string) => void;
  hideLoading: () => void;
  rebuildTagIndex: () => Promise<void>;
}

export class PropertyExplorerPanel {
  private readonly dataManager: PropertyDataManager;
  private readonly grouping: FfgGrouping;
  private readonly actions: PropertyExplorerActions;
  private readonly drag = new OrderDragController();
  private readonly expandedGroups = new Set<string>();
  private readonly initializedGroups = new Set<string>();
  private readonly expandedProperties = new Set<string>();
  private readonly expandedValues = new Set<string>();
  private query = "";

  constructor(
    private readonly app: App,
    private readonly callbacks: PropertyPanelCallbacks,
  ) {
    this.dataManager = new PropertyDataManager(app);
    this.grouping = new FfgGrouping(app);
    this.actions = new PropertyExplorerActions(app, this.dataManager, this.grouping, {
      requestRender: callbacks.requestRender,
      setLoading: callbacks.setLoading,
      hideLoading: callbacks.hideLoading,
      reloadAfterMutation: () => this.reloadAfterMutation(),
      forgetGroup: (id) => this.forgetGroup(id),
      forgetProperty: (key) => this.forgetProperty(key),
    });
  }

  async load(): Promise<void> {
    await Promise.all([this.grouping.load(), this.dataManager.buildIndex()]);
  }

  async updateFile(file: TFile): Promise<void> {
    await this.dataManager.updateFile(file);
  }

  removeFile(file: TFile): void {
    this.dataManager.removeFile(file);
  }

  renameFile(file: TFile, oldPath: string): void {
    this.dataManager.renameFile(file, oldPath);
  }

  refreshTypes(): void {
    this.dataManager.refreshTypes();
  }

  getOrderMode(): PropertyOrderMode {
    return this.grouping.getOrderMode();
  }

  async setOrderMode(mode: PropertyOrderMode): Promise<void> {
    await this.grouping.setOrderMode(mode, this.dataManager.getEntries());
  }

  openGroupEditor(): void {
    this.actions.openGroupEditor(null);
  }

  render(container: HTMLElement, status: HTMLElement, query: string): void {
    this.query = query;
    this.drag.setContainer(container);
    const filtered = this.filterEntries(this.dataManager.getEntries());
    const arrangement = this.grouping.arrange(filtered);
    if (!arrangement.configFound) {
      status.setText("未检测到 Foldable Frontmatter Groups 配置，暂按未分组显示。");
      status.show();
    } else {
      status.hide();
    }
    if (filtered.length === 0) {
      this.renderEmpty(container);
      return;
    }
    const fragment = createFragment();
    for (const entry of arrangement.top) {
      fragment.appendChild(this.buildProperty(entry, true, TOP_PROPERTY_SCOPE));
    }
    for (const section of arrangement.sections) {
      if (this.query && section.entries.length === 0) continue;
      fragment.appendChild(this.buildSection(section));
    }
    container.appendChild(fragment);
  }

  private renderEmpty(container: HTMLElement): void {
    const empty = container.createDiv("gpe-empty");
    setIcon(empty.createDiv("gpe-empty-icon"), this.query ? "search-x" : "inbox");
    empty.createDiv({
      cls: "gpe-empty-text",
      text: this.query ? `没有匹配“${this.query}”的属性` : "库中没有属性",
    });
  }

  private buildSection(section: PropertySection): HTMLElement {
    if (!this.initializedGroups.has(section.id)) {
      this.initializedGroups.add(section.id);
      if (!section.defaultFolded) this.expandedGroups.add(section.id);
    }
    const expanded = this.query ? true : this.expandedGroups.has(section.id);
    const wrap = createDiv({ cls: `gpe-group gpe-group-${section.kind}` });
    wrap.dataset.groupId = section.id;
    const header = wrap.createDiv("gpe-group-header");
    if (expanded) header.addClass("is-expanded");
    setIcon(header.createDiv("gpe-chevron"), "chevron-right");
    setIcon(
      header.createDiv("gpe-group-icon"),
      section.kind === "unmatched" ? "list" : "folder-tree",
    );
    this.highlightText(header.createDiv("gpe-group-name"), section.name);
    header.createDiv({ cls: "gpe-count", text: String(section.entries.length) });
    if (this.canDrag() && section.kind === "group") {
      this.drag.attach(header, wrap, {
        kind: "property-group",
        scope: "root",
        id: section.id,
        label: `拖动属性组“${section.name}”`,
        onMove: async (source, target, placement) => {
          await this.grouping.moveGroup(source, target, placement);
          this.callbacks.requestRender();
        },
      });
    }
    header.addEventListener("click", () => {
      this.toggleExpanded(this.expandedGroups, section.id);
      this.callbacks.requestRender();
    });
    if (section.kind === "group") {
      header.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.actions.openGroupMenu(event, section);
      });
    }
    if (expanded) {
      const children = wrap.createDiv("gpe-group-children");
      for (const entry of section.entries) {
        children.appendChild(this.buildProperty(entry, false, section.id));
      }
    }
    return wrap;
  }

  private buildProperty(
    entry: PropertyEntry,
    topLevel: boolean,
    scopeId: string,
  ): HTMLElement {
    const expanded = this.expandedProperties.has(entry.key);
    const wrap = createDiv({ cls: `gpe-property${topLevel ? " is-top-level" : ""}` });
    wrap.dataset.propertyKey = entry.key;
    wrap.dataset.scopeId = scopeId;
    const header = wrap.createDiv("gpe-property-header");
    if (expanded) header.addClass("is-expanded");
    setIcon(header.createDiv("gpe-chevron"), "chevron-right");
    this.highlightText(header.createDiv("gpe-property-key"), entry.key);
    header.createDiv({ cls: "gpe-count", text: String(entry.noteCount) });
    if (this.canDrag()) {
      this.drag.attach(header, wrap, {
        kind: "property",
        scope: scopeId,
        id: entry.key,
        label: `拖动属性“${entry.key}”`,
        onMove: async (source, target, placement) => {
          await this.grouping.moveProperty(
            scopeId,
            source,
            target,
            placement,
            this.dataManager.getEntries(),
          );
          this.callbacks.requestRender();
        },
      });
    }
    header.addEventListener("click", () => {
      this.toggleExpanded(this.expandedProperties, entry.key);
      this.callbacks.requestRender();
    });
    header.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.actions.openPropertyMenu(event, entry, scopeId);
    });
    if (expanded) {
      const children = wrap.createDiv("gpe-children");
      for (const value of this.sortedValues(entry)) {
        children.appendChild(this.buildValue(entry, value));
      }
    }
    return wrap;
  }

  private buildValue(entry: PropertyEntry, valueEntry: ValueEntry): HTMLElement {
    const stateKey = `${entry.key}\u0000${valueEntry.value}`;
    const expanded = this.expandedValues.has(stateKey);
    const wrap = createDiv("gpe-value");
    const header = wrap.createDiv("gpe-value-header");
    if (expanded) header.addClass("is-expanded");
    setIcon(header.createDiv("gpe-chevron"), "chevron-right");
    const value = header.createDiv({
      cls: `gpe-value-text${valueEntry.value === EMPTY_VALUE ? " is-empty" : ""}`,
    });
    this.highlightText(value, valueEntry.value);
    header.createDiv({ cls: "gpe-count", text: String(valueEntry.files.length) });
    header.addEventListener("click", () => {
      this.toggleExpanded(this.expandedValues, stateKey);
      this.callbacks.requestRender();
    });
    header.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.actions.openValueMenu(event, entry.key, valueEntry);
    });
    if (expanded) {
      const children = wrap.createDiv("gpe-children");
      const files = this.filteredNotes(entry.key, valueEntry.value, valueEntry.files);
      files.sort((a, b) => a.basename.localeCompare(b.basename));
      for (const file of files) children.appendChild(this.buildNote(file));
    }
    return wrap;
  }

  private buildNote(file: TFile): HTMLElement {
    const row = createDiv("gpe-note");
    setIcon(row.createDiv("gpe-note-icon"), "file-text");
    this.highlightText(row.createDiv("gpe-note-name"), file.basename);
    if (file.parent && file.parent.path !== "/") {
      row.createDiv({ cls: "gpe-note-path", text: file.parent.path });
    }
    row.addEventListener("click", () => void this.app.workspace.getLeaf(false).openFile(file));
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

  private filterEntries(entries: PropertyEntry[]): PropertyEntry[] {
    if (!this.query) return entries;
    const query = this.query.toLowerCase();
    return entries.filter((entry) => {
      if (entry.key.toLowerCase().includes(query)) return true;
      for (const value of entry.values.values()) {
        if (value.value.toLowerCase().includes(query)) return true;
        if (value.files.some((file) => file.basename.toLowerCase().includes(query))) {
          return true;
        }
      }
      return false;
    });
  }

  private sortedValues(entry: PropertyEntry): ValueEntry[] {
    return Array.from(entry.values.values()).sort((a, b) => {
      if (this.query) {
        const query = this.query.toLowerCase();
        const matchDifference =
          Number(!a.value.toLowerCase().includes(query)) -
          Number(!b.value.toLowerCase().includes(query));
        if (matchDifference !== 0) return matchDifference;
      }
      if (a.files.length !== b.files.length) return b.files.length - a.files.length;
      return a.value.localeCompare(b.value);
    });
  }

  private filteredNotes(propertyKey: string, value: string, files: TFile[]): TFile[] {
    if (!this.query) return [...files];
    const query = this.query.toLowerCase();
    if (propertyKey.toLowerCase().includes(query) || value.toLowerCase().includes(query)) {
      return [...files];
    }
    return files.filter((file) => file.basename.toLowerCase().includes(query));
  }

  private highlightText(element: HTMLElement, text: string): void {
    if (!this.query) {
      element.textContent = text;
      return;
    }
    const index = text.toLowerCase().indexOf(this.query.toLowerCase());
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

  private async reloadAfterMutation(): Promise<void> {
    this.callbacks.setLoading("正在刷新属性索引…");
    await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
    await Promise.all([
      this.grouping.load(),
      this.dataManager.buildIndex(),
      this.callbacks.rebuildTagIndex(),
    ]);
    this.callbacks.hideLoading();
    this.callbacks.requestRender();
  }

  private canDrag(): boolean {
    return this.grouping.getOrderMode() === "manual" && !this.query;
  }

  private toggleExpanded(set: Set<string>, key: string): void {
    if (set.has(key)) set.delete(key);
    else set.add(key);
  }

  private forgetGroup(groupId: string): void {
    this.expandedGroups.delete(groupId);
    this.initializedGroups.delete(groupId);
  }

  private forgetProperty(key: string): void {
    this.expandedProperties.delete(key);
    for (const stateKey of this.expandedValues) {
      if (stateKey.startsWith(`${key}\u0000`)) this.expandedValues.delete(stateKey);
    }
  }
}
