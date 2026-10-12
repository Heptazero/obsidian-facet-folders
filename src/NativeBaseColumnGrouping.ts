import {
  BasesPropertyId,
  BasesQueryResult,
  BasesViewConfig,
  Events,
  TFile,
  setIcon,
} from "obsidian";
import {
  FfgGrouping,
  GROUPING_SETTINGS_CHANGED_EVENT,
} from "./FfgGrouping";
import {
  ColumnLayout,
  ColumnSegment,
  createBaseColumnLayout,
} from "./BaseColumnGroupingModel";
import type GroupedPropertyExplorerPlugin from "./main";

interface NativeColumnInfo {
  getWidth: (minimum: number, maximum: number) => number;
}

interface NativeCell {
  prop: BasesPropertyId;
  el: HTMLElement;
}

interface NativeTableView {
  type: string;
  config: BasesViewConfig;
  data: BasesQueryResult & { propertiesCache?: BasesPropertyId[] | null };
  containerEl: HTMLElement;
  theadEl: HTMLElement;
  header: { cells: NativeCell[] };
  footerSummary?: { cells: NativeCell[] };
  groups?: Array<{ summaryRow?: { cells: NativeCell[] } }>;
  rows?: Array<{ cells: NativeCell[] }>;
  columnInfo: Record<string, NativeColumnInfo | undefined>;
  minColWidth: number;
  maxColWidth: number;
  display: () => void;
  updateVirtualDisplay: () => void;
}

interface BasesHostView {
  file?: TFile | null;
  controller?: {
    view?: NativeTableView | null;
    viewName?: string;
  };
}

interface SavedFoldState {
  collapsed: string[];
  knownGroups: string[];
}

interface PluginDataWithBaseGroups {
  baseColumnGroups?: Record<string, SavedFoldState>;
  [key: string]: unknown;
}

interface WidthOverride {
  info: NativeColumnInfo;
  descriptor?: PropertyDescriptor;
}

interface ViewContext {
  data: NativeTableView["data"];
  configOrder: string;
  nativeProperties: BasesPropertyId[];
  layoutSignature: string;
  identity: string;
  layout: ColumnLayout;
  overrides: Map<BasesPropertyId, WidthOverride>;
  rowLayout: string;
}

const BASES_VIEW_TYPE = "bases";
const TABLE_VIEW_TYPE = "table";
const COLLAPSED_COLUMN_WIDTH = 34;

export class NativeBaseColumnGrouping {
  private readonly plugin: GroupedPropertyExplorerPlugin;
  private readonly grouping: FfgGrouping;
  private readonly contexts = new Map<NativeTableView, ViewContext>();
  private readonly savedStates = new Map<string, SavedFoldState>();
  private observer: MutationObserver | null = null;
  private timer: number | null = null;
  private saveTimer: number | null = null;
  private processing = false;

  constructor(plugin: GroupedPropertyExplorerPlugin) {
    this.plugin = plugin;
    this.grouping = new FfgGrouping(plugin.app, plugin.dataStore);
  }

  async start(): Promise<void> {
    await Promise.all([this.grouping.load(), this.loadStates()]);
    this.installObserver();
    this.plugin.registerEvent(
      this.plugin.app.workspace.on("layout-change", () => this.scheduleProcess()),
    );
    this.plugin.registerEvent(
      this.plugin.app.workspace.on("active-leaf-change", () => this.scheduleProcess()),
    );
    this.plugin.registerEvent(
      (this.plugin.app.workspace as unknown as Events).on(
        GROUPING_SETTINGS_CHANGED_EVENT,
        () => void this.reloadGrouping(),
      ),
    );
    this.processAll();
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.timer !== null) window.clearTimeout(this.timer);
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.timer = null;
    this.saveTimer = null;
    for (const [view, context] of this.contexts) this.restoreView(view, context);
    this.contexts.clear();
  }

  private async reloadGrouping(): Promise<void> {
    for (const [view, context] of this.contexts) this.restoreView(view, context);
    this.contexts.clear();
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.savedStates.clear();
    await Promise.all([this.grouping.load(), this.loadStates()]);
    this.processAll();
  }

  private installObserver(): void {
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const target = mutation.target;
        if (target.instanceOf(HTMLElement) && target.closest(".gpe-base-group-row")) {
          continue;
        }
        for (const node of Array.from(mutation.addedNodes)) {
          if (!node.instanceOf(HTMLElement)) continue;
          if (
            node.matches(".bases-view, .bases-thead, .bases-table-header, .bases-td") ||
            node.querySelector(".bases-thead, .bases-table-header, .bases-td")
          ) {
            this.scheduleProcess();
            return;
          }
        }
      }
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  private scheduleProcess(): void {
    if (this.timer !== null) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.processAll();
    }, 20);
  }

  private processAll(): void {
    if (this.processing) return;
    this.processing = true;
    try {
      const activeViews = new Set<NativeTableView>();
      for (const leaf of this.plugin.app.workspace.getLeavesOfType(BASES_VIEW_TYPE)) {
        const host = leaf.view as unknown as BasesHostView;
        const view = host.controller?.view;
        if (!view || view.type !== TABLE_VIEW_TYPE || !host.file) continue;
        activeViews.add(view);
        this.processView(view, host.file.path, host.controller?.viewName ?? view.config.name);
      }
      for (const [view, context] of this.contexts) {
        if (activeViews.has(view)) continue;
        this.restoreView(view, context);
        this.contexts.delete(view);
      }
    } finally {
      this.processing = false;
    }
  }

  private processView(view: NativeTableView, filePath: string, viewName: string): void {
    if (!view.data || !view.containerEl.isConnected || !view.theadEl.isConnected) return;
    const previous = this.contexts.get(view);
    const configOrder = JSON.stringify(view.config.getOrder());
    const nativeProperties = this.getNativeProperties(view, previous, configOrder);
    const layout = createBaseColumnLayout(this.grouping, nativeProperties);
    if (!layout || !layout.segments.some((segment) => segment.collapsible)) {
      if (previous) {
        this.restoreView(view, previous);
        this.contexts.delete(view);
      }
      return;
    }

    const identity = `${filePath}\u0000${viewName}`;
    const state = this.ensureState(identity, layout.segments);
    const collapsed = new Set(state.collapsed);
    const layoutSignature = JSON.stringify({
      properties: layout.properties,
      segments: layout.segments,
      collapsed: state.collapsed,
    });
    const needsRender =
      !previous ||
      previous.data !== view.data ||
      previous.configOrder !== configOrder ||
      previous.layoutSignature !== layoutSignature;

    let context = previous;
    if (needsRender) {
      if (previous) this.restoreOverrides(previous);
      view.data.propertiesCache = [...layout.properties];
      view.display();
      context = {
        data: view.data,
        configOrder,
        nativeProperties,
        layoutSignature,
        identity,
        layout,
        overrides: new Map(),
        rowLayout: "",
      };
      this.contexts.set(view, context);
    }
    if (!context) return;

    this.applyWidthOverrides(view, context, collapsed);
    view.updateVirtualDisplay();
    this.decorateCells(view, layout, collapsed);
    this.renderGroupRow(view, context, collapsed);
  }

  private getNativeProperties(
    view: NativeTableView,
    previous: ViewContext | undefined,
    configOrder: string,
  ): BasesPropertyId[] {
    if (previous?.data === view.data && previous.configOrder === configOrder) {
      return [...previous.nativeProperties];
    }
    view.data.propertiesCache = null;
    return [...view.data.properties];
  }

  private ensureState(identity: string, segments: ColumnSegment[]): SavedFoldState {
    let state = this.savedStates.get(identity);
    if (!state) {
      state = { collapsed: [], knownGroups: [] };
      this.savedStates.set(identity, state);
    }
    const available = new Set(
      segments.filter((segment) => segment.collapsible).map((segment) => segment.id),
    );
    const collapsed = new Set(state.collapsed.filter((id) => available.has(id)));
    const known = new Set(state.knownGroups.filter((id) => available.has(id)));
    let changed = collapsed.size !== state.collapsed.length || known.size !== state.knownGroups.length;
    for (const segment of segments) {
      if (!segment.collapsible || known.has(segment.id)) continue;
      known.add(segment.id);
      if (segment.defaultFolded) collapsed.add(segment.id);
      changed = true;
    }
    state.collapsed = Array.from(collapsed);
    state.knownGroups = Array.from(known);
    if (changed) this.scheduleSaveStates();
    return state;
  }

  private applyWidthOverrides(
    view: NativeTableView,
    context: ViewContext,
    collapsed: Set<string>,
  ): void {
    this.restoreOverrides(context);
    for (const segment of context.layout.segments) {
      if (!segment.collapsible || !collapsed.has(segment.id)) continue;
      segment.properties.forEach((property, index) => {
        const info = view.columnInfo[property];
        if (!info) return;
        const descriptor = Object.getOwnPropertyDescriptor(info, "getWidth");
        context.overrides.set(property, { info, descriptor });
        Object.defineProperty(info, "getWidth", {
          configurable: true,
          writable: true,
          value: () => (index === 0 ? COLLAPSED_COLUMN_WIDTH : 0),
        });
      });
    }
  }

  private restoreOverrides(context: ViewContext): void {
    for (const { info, descriptor } of context.overrides.values()) {
      if (descriptor) Object.defineProperty(info, "getWidth", descriptor);
      else delete (info as { getWidth?: NativeColumnInfo["getWidth"] }).getWidth;
    }
    context.overrides.clear();
  }

  private decorateCells(
    view: NativeTableView,
    layout: ColumnLayout,
    collapsed: Set<string>,
  ): void {
    const hidden = new Set<BasesPropertyId>();
    const stubs = new Set<BasesPropertyId>();
    for (const segment of layout.segments) {
      if (!segment.collapsible || !collapsed.has(segment.id)) continue;
      const [stub, ...rest] = segment.properties;
      if (stub) stubs.add(stub);
      rest.forEach((property) => hidden.add(property));
    }
    const cells: NativeCell[] = [
      ...view.header.cells,
      ...(view.footerSummary?.cells ?? []),
      ...(view.groups ?? []).flatMap((group) => group.summaryRow?.cells ?? []),
      ...(view.rows ?? []).flatMap((row) => row.cells),
    ];
    for (const cell of cells) {
      cell.el.toggleClass("gpe-base-column-hidden", hidden.has(cell.prop));
      cell.el.toggleClass("gpe-base-group-stub", stubs.has(cell.prop));
    }
    view.containerEl
      .querySelectorAll<HTMLElement>(".bases-td[data-property]")
      .forEach((cell) => {
        const property = cell.dataset.property as BasesPropertyId | undefined;
        cell.toggleClass("gpe-base-column-hidden", !!property && hidden.has(property));
        cell.toggleClass("gpe-base-group-stub", !!property && stubs.has(property));
      });
  }

  private renderGroupRow(
    view: NativeTableView,
    context: ViewContext,
    collapsed: Set<string>,
  ): void {
    view.theadEl.addClass("gpe-base-groups-active");
    const root = view.theadEl.parentElement;
    root?.addClass("gpe-base-groups-root");
    let row = view.theadEl.querySelector<HTMLElement>(":scope > .gpe-base-group-row");
    if (!row) {
      row = createDiv({ cls: "gpe-base-group-row bases-tr" });
      view.theadEl.prepend(row);
    }

    const widths = context.layout.properties.map((property) =>
      view.columnInfo[property]?.getWidth(view.minColWidth, view.maxColWidth) ?? 0,
    );
    const nativeWidth = Number.parseFloat(view.theadEl.style.width) || 0;
    const measuredWidth = widths.reduce((sum, width) => sum + width, 0);
    const lastVisible = widths.findLastIndex((width) => width > 0);
    if (lastVisible >= 0 && nativeWidth > measuredWidth) {
      widths[lastVisible] = (widths[lastVisible] ?? 0) + nativeWidth - measuredWidth;
    }

    const cells: Array<{
      segment: ColumnSegment;
      start: number;
      width: number;
      folded: boolean;
    }> = [];
    let offset = 0;
    let propertyIndex = 0;
    for (const segment of context.layout.segments) {
      const start = offset;
      for (let index = 0; index < segment.properties.length; index += 1) {
        offset += widths[propertyIndex] ?? 0;
        propertyIndex += 1;
      }
      const width = offset - start;
      if (width > 0) {
        cells.push({
          segment,
          start,
          width,
          folded: segment.collapsible && collapsed.has(segment.id),
        });
      }
    }
    const rowLayout = JSON.stringify(
      cells.map(({ segment, start, width, folded }) => [segment.id, start, width, folded]),
    );
    if (context.rowLayout === rowLayout) return;
    context.rowLayout = rowLayout;
    row.empty();
    for (const { segment, start, width, folded } of cells) {
      const cell = row.createEl(segment.collapsible ? "button" : "div", {
        cls: "gpe-base-group-cell",
        attr: {
          "data-folded": String(folded),
          "aria-label": segment.name,
          ...(segment.collapsible
            ? { "aria-expanded": String(!folded) }
            : {}),
          title: segment.name,
        },
      });
      cell.style.insetInlineStart = `${start}px`;
      cell.style.width = `${width}px`;
      if (segment.collapsible) {
        const icon = cell.createSpan("gpe-base-group-chevron");
        setIcon(icon, folded ? "chevron-right" : "chevron-down");
      }
      cell.createSpan({ cls: "gpe-base-group-label", text: segment.name });
      if (!folded) {
        cell.createSpan({ cls: "gpe-base-group-count", text: String(segment.properties.length) });
      }
      if (!segment.collapsible) continue;
      cell.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      cell.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.toggleGroup(view, context.identity, segment.id);
      });
    }
  }

  private toggleGroup(view: NativeTableView, identity: string, groupId: string): void {
    const state = this.savedStates.get(identity);
    if (!state) return;
    const collapsed = new Set(state.collapsed);
    if (collapsed.has(groupId)) collapsed.delete(groupId);
    else collapsed.add(groupId);
    state.collapsed = Array.from(collapsed);
    this.scheduleSaveStates();
    const context = this.contexts.get(view);
    if (context) context.layoutSignature = "";
    this.processViewFromContext(view);
  }

  private processViewFromContext(view: NativeTableView): void {
    const context = this.contexts.get(view);
    if (!context) return;
    const split = context.identity.split("\u0000");
    this.processView(view, split[0] ?? "", split[1] ?? view.config.name);
  }

  private restoreView(view: NativeTableView, context: ViewContext): void {
    this.restoreOverrides(context);
    view.data.propertiesCache = null;
    view.theadEl.removeClass("gpe-base-groups-active");
    view.theadEl.parentElement?.removeClass("gpe-base-groups-root");
    view.theadEl.querySelector(":scope > .gpe-base-group-row")?.remove();
    view.containerEl
      .querySelectorAll<HTMLElement>(".gpe-base-column-hidden, .gpe-base-group-stub")
      .forEach((cell) => cell.removeClasses(["gpe-base-column-hidden", "gpe-base-group-stub"]));
    for (const cell of view.header.cells) {
      cell.el.removeClasses(["gpe-base-column-hidden", "gpe-base-group-stub"]);
    }
    if (view.containerEl.isConnected) view.display();
  }

  private async loadStates(): Promise<void> {
    const data = await this.plugin.dataStore.read<PluginDataWithBaseGroups>();
    for (const [identity, state] of Object.entries(data.baseColumnGroups ?? {})) {
      if (!state || !Array.isArray(state.collapsed) || !Array.isArray(state.knownGroups)) {
        continue;
      }
      this.savedStates.set(identity, {
        collapsed: [...state.collapsed],
        knownGroups: [...state.knownGroups],
      });
    }
  }

  private scheduleSaveStates(): void {
    if (this.saveTimer !== null) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.saveStates();
    }, 120);
  }

  private async saveStates(): Promise<void> {
    await this.plugin.dataStore.update((data) => {
      data.baseColumnGroups = Object.fromEntries(this.savedStates);
    });
  }
}
