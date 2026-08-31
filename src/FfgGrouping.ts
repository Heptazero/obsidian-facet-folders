import { App, normalizePath } from "obsidian";
import type { PropertyEntry } from "./PropertyDataManager";
import { createRuntimeGroup, FolderTemplate } from "./FfgMatcher";
import {
  PropertyOrderManager,
  PropertyOrderMode,
  PropertyOrderSettings,
} from "./PropertyOrderManager";

export type { PropertyOrderMode } from "./PropertyOrderManager";

export interface PropertyGroupConfig {
  id: string;
  name: string;
  matcherType: "unified" | "regex";
  matcherValues: string[];
  defaultFolded: boolean;
  fieldOrder: string[];
}

interface FfgSettings {
  groupFoldingEnabled?: boolean;
  topZone?: { fieldOrder?: string[] };
  groups?: PropertyGroupConfig[];
  folderTemplates?: FolderTemplate[];
}

interface GroupedPropertyExplorerData {
  ffgSettings?: FfgSettings;
  propertyOrder?: Partial<PropertyOrderSettings>;
}

export const TOP_PROPERTY_SCOPE = "__top";
const UNMATCHED_PROPERTY_SCOPE = "__unmatched";
export const GROUPING_SETTINGS_CHANGED_EVENT =
  "grouped-property-explorer:grouping-settings-changed";

interface AppWithPlugins {
  plugins?: {
    plugins?: Record<
      string,
      { settings?: unknown; saveSettings?: () => Promise<void> }
    >;
  };
}

export interface PropertySection {
  id: string;
  name: string;
  defaultFolded: boolean;
  entries: PropertyEntry[];
  kind: "unmatched" | "group";
}

export interface PropertyArrangement {
  top: PropertyEntry[];
  sections: PropertySection[];
  configFound: boolean;
}

export interface PropertyKeySection {
  id: string;
  name: string;
  defaultFolded: boolean;
  keys: string[];
  kind: "unmatched" | "group";
}

export interface PropertyKeyArrangement {
  top: string[];
  sections: PropertyKeySection[];
  configFound: boolean;
}

export interface PropertyGroupDraft {
  name: string;
  matcherType: "unified" | "regex";
  matcherValues: string[];
  fieldOrder: string[];
  defaultFolded: boolean;
}

export class FfgGrouping {
  private readonly app: App;
  private settings: FfgSettings = {};
  private readonly order = new PropertyOrderManager();
  private configFound = false;

  constructor(app: App) {
    this.app = app;
  }

  async load(): Promise<void> {
    const ownData = await this.readOwnData();
    this.order.load(ownData.propertyOrder);

    const runtime = (this.app as unknown as AppWithPlugins).plugins?.plugins?.[
      "foldable-frontmatter-groups"
    ]?.settings;
    if (this.isSettings(runtime)) {
      this.settings = runtime;
      this.configFound = true;
      return;
    }

    const externalPath = normalizePath(
      `${this.app.vault.configDir}/plugins/foldable-frontmatter-groups/data.json`,
    );
    try {
      if (await this.app.vault.adapter.exists(externalPath)) {
        const parsed: unknown = JSON.parse(await this.app.vault.adapter.read(externalPath));
        if (this.isSettings(parsed)) {
          this.settings = parsed;
          this.configFound = true;
          return;
        }
      }

      const ownSettings = this.getOwnSettings(ownData);
      if (ownSettings) {
        this.settings = ownSettings;
        this.configFound = true;
        return;
      }

      this.settings = {};
      this.configFound = false;
    } catch (error) {
      console.error("Grouped Property Explorer: cannot read grouping settings", error);
      this.settings = {};
      this.configFound = false;
    }
  }

  arrange(entries: PropertyEntry[]): PropertyArrangement {
    if (!this.configFound || this.settings.groupFoldingEnabled === false) {
      return {
        top: [],
        sections: [
          this.unmatchedSection(
            this.order.orderEntries(entries, UNMATCHED_PROPERTY_SCOPE),
          ),
        ],
        configFound: this.configFound,
      };
    }

    const byKey = new Map(entries.map((entry) => [entry.key, entry]));
    const topOrder = this.settings.topZone?.fieldOrder ?? [];
    const top: PropertyEntry[] = [];
    const assigned = new Set<string>();
    for (const key of topOrder) {
      const entry = byKey.get(key);
      if (!entry || assigned.has(key)) continue;
      top.push(entry);
      assigned.add(key);
    }

    const runtimeGroups = (this.settings.groups ?? []).map((group) =>
      createRuntimeGroup(group, this.settings.folderTemplates ?? []),
    );
    const groupEntries = new Map<string, PropertyEntry[]>();
    const unmatched: PropertyEntry[] = [];

    for (const entry of entries) {
      if (assigned.has(entry.key)) continue;
      const group = runtimeGroups.find((candidate) => candidate.matches(entry.key));
      if (!group) {
        unmatched.push(entry);
        continue;
      }
      const members = groupEntries.get(group.id) ?? [];
      members.push(entry);
      groupEntries.set(group.id, members);
      assigned.add(entry.key);
    }

    const sections: PropertySection[] = [];
    if (unmatched.length > 0) {
      sections.push(
        this.unmatchedSection(
          this.order.orderEntries(unmatched, UNMATCHED_PROPERTY_SCOPE),
        ),
      );
    }
    const groupedSections: PropertySection[] = [];
    for (const group of runtimeGroups) {
      const members = groupEntries.get(group.id) ?? [];
      groupedSections.push({
        id: group.id,
        name: group.name,
        defaultFolded: group.defaultFolded,
        entries: this.order.orderEntries(members, group.id, group.fieldOrder),
        kind: "group",
      });
    }
    sections.push(
      ...this.order.orderSections(
        groupedSections,
        (this.settings.groups ?? []).map((group) => group.id),
      ),
    );

    return {
      top: this.order.orderEntries(top, TOP_PROPERTY_SCOPE, topOrder),
      sections,
      configFound: true,
    };
  }

  arrangeKeys(keys: string[]): PropertyKeyArrangement {
    const entries: PropertyEntry[] = keys.map((key) => ({
      key,
      type: "",
      noteCount: 0,
      values: new Map(),
    }));
    const arrangement = this.arrange(entries);
    return {
      top: arrangement.top.map((entry) => entry.key),
      sections: arrangement.sections.map((section) => ({
        id: section.id,
        name: section.name,
        defaultFolded: section.defaultFolded,
        keys: section.entries.map((entry) => entry.key),
        kind: section.kind,
      })),
      configFound: arrangement.configFound,
    };
  }

  getOrderMode(): PropertyOrderMode {
    return this.order.getMode();
  }

  async setOrderMode(mode: PropertyOrderMode, entries: PropertyEntry[]): Promise<void> {
    if (this.order.setMode(mode, this.arrange(entries))) await this.persistOwnData();
  }

  isGroupPinned(groupId: string): boolean {
    return this.order.isGroupPinned(groupId);
  }

  async toggleGroupPinned(groupId: string): Promise<void> {
    this.order.toggleGroupPinned(groupId);
    await this.persistOwnData();
  }

  isPropertyPinned(scopeId: string, key: string): boolean {
    return this.order.isPropertyPinned(scopeId, key);
  }

  async togglePropertyPinned(scopeId: string, key: string): Promise<void> {
    this.order.togglePropertyPinned(scopeId, key);
    await this.persistOwnData();
  }

  async moveGroup(
    sourceId: string,
    targetId: string,
    placement: "before" | "after",
  ): Promise<void> {
    const configuredIds = (this.settings.groups ?? []).map((group) => group.id);
    this.order.moveGroup(sourceId, targetId, placement, configuredIds);
    await this.persistOwnData();
  }

  async moveProperty(
    scopeId: string,
    sourceKey: string,
    targetKey: string,
    placement: "before" | "after",
    entries: PropertyEntry[],
  ): Promise<void> {
    const arrangement = this.arrange(entries);
    const scopeEntries =
      scopeId === TOP_PROPERTY_SCOPE
        ? arrangement.top
        : arrangement.sections.find((section) => section.id === scopeId)?.entries ?? [];
    const current = scopeEntries.map((entry) => entry.key);
    this.order.moveProperty(scopeId, sourceKey, targetKey, placement, current);
    await this.persistOwnData();
  }

  async renamePropertyKey(oldKey: string, newKey: string): Promise<void> {
    this.mutateConfiguredKey(oldKey, newKey);
    await this.persistSettings();
  }

  async removePropertyKey(key: string): Promise<void> {
    this.mutateConfiguredKey(key, null);
    await this.persistSettings();
  }

  getGroups(): PropertyGroupConfig[] {
    return (this.settings.groups ?? []).map((group) => ({
      ...group,
      matcherValues: [...(group.matcherValues ?? [])],
      fieldOrder: [...(group.fieldOrder ?? [])],
    }));
  }

  getEditablePropertyKeys(groupId: string | null, entries: PropertyEntry[]): string[] {
    const arrangement = this.arrange(entries);
    const keys = new Set<string>();
    const unmatched = arrangement.sections.find((section) => section.kind === "unmatched");
    for (const entry of unmatched?.entries ?? []) keys.add(entry.key);

    if (groupId) {
      const ownSection = arrangement.sections.find((section) => section.id === groupId);
      for (const entry of ownSection?.entries ?? []) keys.add(entry.key);
      const group = (this.settings.groups ?? []).find((candidate) => candidate.id === groupId);
      if (group?.matcherType === "unified") {
        for (const value of group.matcherValues ?? []) {
          if (value && !value.endsWith("*")) keys.add(value);
        }
      }
    }

    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }

  async createGroup(draft: PropertyGroupDraft): Promise<PropertyGroupConfig> {
    const group: PropertyGroupConfig = {
      id: this.makeGroupId(draft.name),
      ...draft,
      matcherValues: [...draft.matcherValues],
      fieldOrder: [...draft.fieldOrder],
    };
    if (!this.settings.groups) this.settings.groups = [];
    this.settings.groups.push(group);
    this.order.addGroup(group.id);
    this.configFound = true;
    await this.persistSettings();
    return group;
  }

  async updateGroup(id: string, draft: PropertyGroupDraft): Promise<void> {
    const groups = this.settings.groups ?? [];
    const index = groups.findIndex((group) => group.id === id);
    if (index < 0) throw new Error(`Unknown property group: ${id}`);
    groups[index] = {
      id,
      ...draft,
      matcherValues: [...draft.matcherValues],
      fieldOrder: [...draft.fieldOrder],
    };
    await this.persistSettings();
  }

  async dissolveGroup(id: string): Promise<void> {
    this.settings.groups = (this.settings.groups ?? []).filter((group) => group.id !== id);
    for (const template of this.settings.folderTemplates ?? []) {
      if (template.group === id) delete template.group;
    }
    this.order.removeGroup(id);
    await this.persistSettings();
  }

  private unmatchedSection(entries: PropertyEntry[]): PropertySection {
    return {
      id: "__unmatched",
      name: "未分组",
      defaultFolded: false,
      entries,
      kind: "unmatched",
    };
  }

  private isSettings(value: unknown): value is FfgSettings {
    if (!value || typeof value !== "object") return false;
    const settings = value as FfgSettings;
    return Array.isArray(settings.groups);
  }

  private getOwnSettings(value: unknown): FfgSettings | null {
    if (!value || typeof value !== "object") return null;
    const data = value as GroupedPropertyExplorerData;
    return this.isSettings(data.ffgSettings) ? data.ffgSettings : null;
  }

  private mutateConfiguredKey(oldKey: string, newKey: string | null): void {
    const update = (values: string[] | undefined): string[] | undefined => {
      if (!values) return values;
      const result = values.flatMap((value) => {
        if (value !== oldKey) return [value];
        return newKey ? [newKey] : [];
      });
      return Array.from(new Set(result));
    };

    if (this.settings.topZone) {
      this.settings.topZone.fieldOrder = update(this.settings.topZone.fieldOrder);
    }
    for (const group of this.settings.groups ?? []) {
      if (group.matcherType === "unified") {
        group.matcherValues = update(group.matcherValues) ?? [];
      }
      group.fieldOrder = update(group.fieldOrder) ?? [];
    }
    for (const template of this.settings.folderTemplates ?? []) {
      template.fields = (template.fields ?? []).flatMap((field) => {
        if (field.name !== oldKey) return [field];
        return newKey ? [{ ...field, name: newKey }] : [];
      });
      template.fieldOrder = update(template.fieldOrder);
      template.noGroupFields = update(template.noGroupFields);
    }

    this.order.renameProperty(oldKey, newKey);
  }

  private makeGroupId(name: string): string {
    const base =
      name
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "group";
    const used = new Set((this.settings.groups ?? []).map((group) => group.id));
    if (!used.has(base)) return base;
    let suffix = 2;
    while (used.has(`${base}-${suffix}`)) suffix += 1;
    return `${base}-${suffix}`;
  }

  private async persistSettings(): Promise<void> {
    await this.persistOwnData();

    const externalPath = normalizePath(
      `${this.app.vault.configDir}/plugins/foldable-frontmatter-groups/data.json`,
    );
    try {
      if (await this.app.vault.adapter.exists(externalPath)) {
        await this.app.vault.adapter.write(externalPath, JSON.stringify(this.settings, null, 2));
      }
      const runtimePlugin = (this.app as unknown as AppWithPlugins).plugins?.plugins?.[
        "foldable-frontmatter-groups"
      ];
      if (runtimePlugin && this.isSettings(runtimePlugin.settings)) {
        runtimePlugin.settings = this.settings;
        await runtimePlugin.saveSettings?.();
      }
    } catch (error) {
      console.error("Grouped Property Explorer: cannot update FFG grouping settings", error);
    }
  }

  private async readOwnData(): Promise<GroupedPropertyExplorerData> {
    const ownPath = normalizePath(
      `${this.app.vault.configDir}/plugins/grouped-property-explorer/data.json`,
    );
    try {
      if (await this.app.vault.adapter.exists(ownPath)) {
        const parsed: unknown = JSON.parse(await this.app.vault.adapter.read(ownPath));
        if (parsed && typeof parsed === "object") return parsed as GroupedPropertyExplorerData;
      }
    } catch (error) {
      console.error("Grouped Property Explorer: cannot read local settings", error);
    }
    return {};
  }

  private async persistOwnData(): Promise<void> {
    const ownPath = normalizePath(
      `${this.app.vault.configDir}/plugins/grouped-property-explorer/data.json`,
    );
    try {
      const ownData = await this.readOwnData();
      ownData.ffgSettings = this.settings;
      ownData.propertyOrder = this.order.serialize();
      await this.app.vault.adapter.write(ownPath, JSON.stringify(ownData, null, 2));
      this.app.workspace.trigger(GROUPING_SETTINGS_CHANGED_EVENT);
    } catch (error) {
      console.error("Grouped Property Explorer: cannot save local settings", error);
    }
  }
}
