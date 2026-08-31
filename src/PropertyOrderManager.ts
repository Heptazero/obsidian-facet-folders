import type { PropertyEntry } from "./PropertyDataManager";

export type PropertyOrderMode = "alphabetical" | "manual";
export type DropPlacement = "before" | "after";

export interface PropertyOrderSettings {
  mode: PropertyOrderMode;
  pinnedGroups: string[];
  pinnedProperties: Record<string, string[]>;
  manualInitialized: boolean;
  manualGroupOrder: string[];
  manualPropertyOrder: Record<string, string[]>;
}

interface OrderableSection {
  id: string;
  name: string;
}

interface ManualArrangement {
  top: PropertyEntry[];
  sections: Array<{ id: string; kind: "unmatched" | "group"; entries: PropertyEntry[] }>;
}

export class PropertyOrderManager {
  private settings: PropertyOrderSettings = this.defaults();

  load(value: Partial<PropertyOrderSettings> | undefined): void {
    this.settings = this.normalize(value);
  }

  serialize(): PropertyOrderSettings {
    return this.settings;
  }

  getMode(): PropertyOrderMode {
    return this.settings.mode;
  }

  setMode(mode: PropertyOrderMode, arrangement?: ManualArrangement): boolean {
    if (this.settings.mode === mode) return false;
    if (mode === "manual" && !this.settings.manualInitialized && arrangement) {
      this.captureManualOrder(arrangement);
    }
    this.settings.mode = mode;
    return true;
  }

  isGroupPinned(groupId: string): boolean {
    return this.settings.pinnedGroups.includes(groupId);
  }

  toggleGroupPinned(groupId: string): void {
    this.settings.pinnedGroups = this.toggleItem(
      this.settings.pinnedGroups,
      groupId,
    );
  }

  isPropertyPinned(scopeId: string, key: string): boolean {
    return (this.settings.pinnedProperties[scopeId] ?? []).includes(key);
  }

  togglePropertyPinned(scopeId: string, key: string): void {
    this.settings.pinnedProperties[scopeId] = this.toggleItem(
      this.settings.pinnedProperties[scopeId] ?? [],
      key,
    );
  }

  moveGroup(
    sourceId: string,
    targetId: string,
    placement: DropPlacement,
    configuredIds: string[],
  ): void {
    const current = this.orderIds(
      configuredIds,
      this.settings.manualGroupOrder,
      configuredIds,
    );
    this.settings.manualGroupOrder = this.moveItem(
      current,
      sourceId,
      targetId,
      placement,
    );
    this.settings.manualInitialized = true;
  }

  moveProperty(
    scopeId: string,
    sourceKey: string,
    targetKey: string,
    placement: DropPlacement,
    currentKeys: string[],
  ): void {
    this.settings.manualPropertyOrder[scopeId] = this.moveItem(
      currentKeys,
      sourceKey,
      targetKey,
      placement,
    );
    this.settings.manualInitialized = true;
  }

  orderEntries(
    entries: PropertyEntry[],
    scopeId: string,
    fallbackOrder: string[] = [],
  ): PropertyEntry[] {
    if (this.settings.mode === "alphabetical") {
      return this.orderByPinned(
        entries,
        this.settings.pinnedProperties[scopeId] ?? [],
        (entry) => entry.key,
      );
    }
    const ids = this.orderIds(
      entries.map((entry) => entry.key),
      this.settings.manualPropertyOrder[scopeId] ?? [],
      fallbackOrder,
    );
    const byKey = new Map(entries.map((entry) => [entry.key, entry]));
    return ids.flatMap((key) => {
      const entry = byKey.get(key);
      return entry ? [entry] : [];
    });
  }

  orderSections<T extends OrderableSection>(
    sections: T[],
    configuredIds: string[],
  ): T[] {
    if (this.settings.mode === "alphabetical") {
      return this.orderByPinned(
        sections,
        this.settings.pinnedGroups,
        (section) => section.id,
        (a, b) => a.name.localeCompare(b.name),
      );
    }
    const ids = this.orderIds(
      sections.map((section) => section.id),
      this.settings.manualGroupOrder,
      configuredIds,
    );
    const byId = new Map(sections.map((section) => [section.id, section]));
    return ids.flatMap((id) => {
      const section = byId.get(id);
      return section ? [section] : [];
    });
  }

  renameProperty(oldKey: string, newKey: string | null): void {
    for (const orderMap of [
      this.settings.pinnedProperties,
      this.settings.manualPropertyOrder,
    ]) {
      for (const scopeId of Object.keys(orderMap)) {
        orderMap[scopeId] = this.replaceKey(orderMap[scopeId] ?? [], oldKey, newKey);
      }
    }
  }

  addGroup(groupId: string): void {
    this.settings.manualGroupOrder.push(groupId);
  }

  removeGroup(groupId: string): void {
    this.settings.pinnedGroups = this.settings.pinnedGroups.filter(
      (id) => id !== groupId,
    );
    this.settings.manualGroupOrder = this.settings.manualGroupOrder.filter(
      (id) => id !== groupId,
    );
    delete this.settings.pinnedProperties[groupId];
    delete this.settings.manualPropertyOrder[groupId];
  }

  private captureManualOrder(arrangement: ManualArrangement): void {
    this.settings.manualGroupOrder = arrangement.sections
      .filter((section) => section.kind === "group")
      .map((section) => section.id);
    this.settings.manualPropertyOrder = {
      __top: arrangement.top.map((entry) => entry.key),
    };
    for (const section of arrangement.sections) {
      this.settings.manualPropertyOrder[section.id] = section.entries.map(
        (entry) => entry.key,
      );
    }
    this.settings.manualInitialized = true;
  }

  private orderByPinned<T>(
    items: T[],
    pinnedIds: string[],
    getId: (item: T) => string,
    compare: (a: T, b: T) => number = (a, b) => getId(a).localeCompare(getId(b)),
  ): T[] {
    const pinIndex = new Map(pinnedIds.map((id, index) => [id, index]));
    return [...items].sort((a, b) => {
      const aPin = pinIndex.get(getId(a));
      const bPin = pinIndex.get(getId(b));
      if (aPin !== undefined || bPin !== undefined) {
        if (aPin === undefined) return 1;
        if (bPin === undefined) return -1;
        return aPin - bPin;
      }
      return compare(a, b);
    });
  }

  private orderIds(ids: string[], primary: string[], fallback: string[]): string[] {
    const available = new Set(ids);
    const result: string[] = [];
    for (const id of [...primary, ...fallback]) {
      if (!available.has(id) || result.includes(id)) continue;
      result.push(id);
    }
    const rest = ids
      .filter((id) => !result.includes(id))
      .sort((a, b) => a.localeCompare(b));
    return [...result, ...rest];
  }

  private moveItem(
    items: string[],
    sourceId: string,
    targetId: string,
    placement: DropPlacement,
  ): string[] {
    if (sourceId === targetId || !items.includes(sourceId) || !items.includes(targetId)) {
      return items;
    }
    const result = items.filter((id) => id !== sourceId);
    const targetIndex = result.indexOf(targetId);
    result.splice(targetIndex + (placement === "after" ? 1 : 0), 0, sourceId);
    return result;
  }

  private toggleItem(items: string[], id: string): string[] {
    return items.includes(id) ? items.filter((item) => item !== id) : [...items, id];
  }

  private replaceKey(items: string[], oldKey: string, newKey: string | null): string[] {
    return Array.from(
      new Set(items.flatMap((item) => (item === oldKey ? (newKey ? [newKey] : []) : [item]))),
    );
  }

  private defaults(): PropertyOrderSettings {
    return {
      mode: "alphabetical",
      pinnedGroups: [],
      pinnedProperties: {},
      manualInitialized: false,
      manualGroupOrder: [],
      manualPropertyOrder: {},
    };
  }

  private normalize(
    value: Partial<PropertyOrderSettings> | undefined,
  ): PropertyOrderSettings {
    if (!value || typeof value !== "object") return this.defaults();
    return {
      mode: value.mode === "manual" ? "manual" : "alphabetical",
      pinnedGroups: this.stringArray(value.pinnedGroups),
      pinnedProperties: this.stringArrayMap(value.pinnedProperties),
      manualInitialized: value.manualInitialized === true,
      manualGroupOrder: this.stringArray(value.manualGroupOrder),
      manualPropertyOrder: this.stringArrayMap(value.manualPropertyOrder),
    };
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? Array.from(new Set(value.filter((item): item is string => typeof item === "string")))
      : [];
  }

  private stringArrayMap(value: unknown): Record<string, string[]> {
    if (!value || typeof value !== "object") return {};
    const result: Record<string, string[]> = {};
    for (const [key, items] of Object.entries(value)) result[key] = this.stringArray(items);
    return result;
  }
}
