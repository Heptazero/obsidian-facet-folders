import { App, Events, Plugin, setIcon } from "obsidian";
import {
  FfgGrouping,
  GROUPING_SETTINGS_CHANGED_EVENT,
  PropertyKeySection,
} from "./FfgGrouping";

const TOP_BASE = 0;
const UNMATCHED_BASE = 10_000;
const GROUP_BASE = 100_000;
const GROUP_SIZE = 10_000;

export class NotePropertyGrouping {
  private readonly app: App;
  private readonly plugin: Plugin;
  private readonly grouping: FfgGrouping;
  private readonly foldState = new WeakMap<HTMLElement, Map<string, boolean>>();
  private observer: MutationObserver | null = null;
  private processing = false;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.grouping = new FfgGrouping(plugin.app);
  }

  async start(): Promise<void> {
    await this.grouping.load();
    this.installObserver();
    this.processAllContainers();

    this.plugin.registerEvent(
      (this.app.workspace as unknown as Events).on(GROUPING_SETTINGS_CHANGED_EVENT, () => {
        void this.reloadAndProcess();
      }),
    );
    this.plugin.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        window.setTimeout(() => this.processAllContainers(), 0);
      }),
    );
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    document
      .querySelectorAll<HTMLElement>(".metadata-container")
      .forEach((container) => this.deactivate(container));
  }

  private async reloadAndProcess(): Promise<void> {
    await this.grouping.load();
    this.processAllContainers();
  }

  private installObserver(): void {
    this.observer = new MutationObserver((mutations) => {
      if (this.processing) return;
      const containers = new Set<HTMLElement>();

      for (const mutation of mutations) {
        const target = mutation.target;
        if (target.instanceOf(HTMLElement)) {
          const container = target.closest<HTMLElement>(".metadata-container");
          if (container) containers.add(container);
        }
        for (const node of Array.from(mutation.addedNodes)) {
          if (!node.instanceOf(HTMLElement)) continue;
          if (node.matches(".metadata-container")) containers.add(node);
          node
            .querySelectorAll<HTMLElement>(".metadata-container")
            .forEach((container) => containers.add(container));
        }
      }

      if (containers.size === 0) return;
      this.processing = true;
      try {
        for (const container of containers) {
          if (container.isConnected) this.processContainer(container);
        }
      } finally {
        this.processing = false;
      }
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  private processAllContainers(): void {
    if (this.processing) return;
    this.processing = true;
    try {
      document
        .querySelectorAll<HTMLElement>(".metadata-container")
        .forEach((container) => this.processContainer(container));
    } finally {
      this.processing = false;
    }
  }

  private processContainer(container: HTMLElement): void {
    const properties = Array.from(
      container.querySelectorAll<HTMLElement>(".metadata-property"),
    );
    if (properties.length === 0) {
      this.deactivate(container);
      return;
    }

    const parent: HTMLElement | null = properties[0]?.parentElement ?? null;
    if (!parent) return;
    const byKey = new Map<string, HTMLElement>();
    for (const property of properties) {
      const key = property.dataset.propertyKey;
      if (key) byKey.set(key, property);
    }

    const arrangement = this.grouping.arrangeKeys(Array.from(byKey.keys()));
    if (!arrangement.configFound) {
      this.deactivate(container);
      return;
    }

    container.addClass("gpe-note-properties-active");
    parent.addClass("gpe-note-property-list");
    const addButton = container.querySelector<HTMLElement>(".metadata-add-button");
    addButton?.setCssStyles({ order: "999999" });

    let state = this.foldState.get(container);
    if (!state) {
      state = new Map<string, boolean>();
      this.foldState.set(container, state);
    }

    const groupedKeys = new Set<string>();
    arrangement.top.forEach((key, index) => {
      this.decorateProperty(byKey.get(key), TOP_BASE + index, null, false);
    });

    const unmatched = arrangement.sections.find((section) => section.kind === "unmatched");
    unmatched?.keys.forEach((key, index) => {
      this.decorateProperty(byKey.get(key), UNMATCHED_BASE + index, null, false);
    });

    const groups = arrangement.sections.filter(
      (section): section is PropertyKeySection & { kind: "group" } =>
        section.kind === "group" && section.keys.length > 0,
    );
    groups.forEach((section, groupIndex) => {
      if (!state?.has(section.id)) state?.set(section.id, section.defaultFolded);
      const folded = state?.get(section.id) ?? section.defaultFolded;
      const base = GROUP_BASE + groupIndex * GROUP_SIZE;
      section.keys.forEach((key, index) => {
        groupedKeys.add(key);
        this.decorateProperty(byKey.get(key), base + index + 1, section.id, folded);
      });
      this.ensureGroupHeader(parent, container, section, base, folded);
    });

    for (const [key, property] of byKey) {
      if (arrangement.top.includes(key) || unmatched?.keys.includes(key) || groupedKeys.has(key)) {
        continue;
      }
      this.clearPropertyDecoration(property);
    }

    const activeIds = new Set(groups.map((group) => group.id));
    parent
      .querySelectorAll<HTMLElement>(":scope > .gpe-note-group-header")
      .forEach((header) => {
        const id = header.dataset.groupId;
        if (!id || !activeIds.has(id)) header.remove();
      });
  }

  private decorateProperty(
    property: HTMLElement | undefined,
    order: number,
    groupId: string | null,
    folded: boolean,
  ): void {
    if (!property) return;
    property.setCssStyles({ order: String(order) });
    if (!groupId) {
      delete property.dataset.gpeNoteGroup;
      delete property.dataset.gpeNoteFolded;
      return;
    }
    property.dataset.gpeNoteGroup = groupId;
    property.dataset.gpeNoteFolded = String(folded);
  }

  private ensureGroupHeader(
    parent: HTMLElement,
    container: HTMLElement,
    section: PropertyKeySection,
    order: number,
    folded: boolean,
  ): void {
    const escapedId = CSS.escape(section.id);
    let header = parent.querySelector<HTMLElement>(
      `:scope > .gpe-note-group-header[data-group-id="${escapedId}"]`,
    );
    if (!header) {
      header = createDiv({ cls: "gpe-note-group-header" });
      header.dataset.groupId = section.id;
      const chevron = header.createSpan("gpe-note-group-chevron");
      const name = header.createSpan("gpe-note-group-name");
      const count = header.createSpan("gpe-note-group-count");
      parent.appendChild(header);

      header.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      header.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.toggleGroup(container, section.id);
      });
      setIcon(chevron, "chevron-right");
      chevron.dataset.iconState = "chevron-right";
      name.textContent = section.name;
      count.textContent = String(section.keys.length);
    }

    header.setCssStyles({ order: String(order) });
    header.dataset.folded = String(folded);
    const chevron = header.querySelector<HTMLElement>(".gpe-note-group-chevron");
    const expectedIcon = folded ? "chevron-right" : "chevron-down";
    if (chevron && chevron.dataset.iconState !== expectedIcon) {
      setIcon(chevron, expectedIcon);
      chevron.dataset.iconState = expectedIcon;
    }
    const name = header.querySelector<HTMLElement>(".gpe-note-group-name");
    if (name && name.textContent !== section.name) name.textContent = section.name;
    const count = header.querySelector<HTMLElement>(".gpe-note-group-count");
    const expectedCount = String(section.keys.length);
    if (count && count.textContent !== expectedCount) count.textContent = expectedCount;
  }

  private toggleGroup(container: HTMLElement, groupId: string): void {
    const state = this.foldState.get(container);
    if (!state) return;
    const folded = !(state.get(groupId) ?? false);
    state.set(groupId, folded);
    const escapedId = CSS.escape(groupId);
    container
      .querySelectorAll<HTMLElement>(
        `.metadata-property[data-gpe-note-group="${escapedId}"]`,
      )
      .forEach((property) => {
        property.dataset.gpeNoteFolded = String(folded);
      });
    const header = container.querySelector<HTMLElement>(
      `.gpe-note-group-header[data-group-id="${escapedId}"]`,
    );
    if (!header) return;
    header.dataset.folded = String(folded);
    const chevron = header.querySelector<HTMLElement>(".gpe-note-group-chevron");
    const expectedIcon = folded ? "chevron-right" : "chevron-down";
    if (chevron && chevron.dataset.iconState !== expectedIcon) {
      setIcon(chevron, expectedIcon);
      chevron.dataset.iconState = expectedIcon;
    }
  }

  private deactivate(container: HTMLElement): void {
    container.removeClass("gpe-note-properties-active");
    container
      .querySelectorAll<HTMLElement>(".gpe-note-group-header")
      .forEach((header) => header.remove());
    container
      .querySelectorAll<HTMLElement>(".metadata-property")
      .forEach((property) => this.clearPropertyDecoration(property));
    const addButton = container.querySelector<HTMLElement>(".metadata-add-button");
    addButton?.style.removeProperty("order");
    container
      .querySelectorAll<HTMLElement>(".gpe-note-property-list")
      .forEach((parent) => parent.removeClass("gpe-note-property-list"));
  }

  private clearPropertyDecoration(property: HTMLElement): void {
    property.style.removeProperty("order");
    delete property.dataset.gpeNoteGroup;
    delete property.dataset.gpeNoteFolded;
  }
}
