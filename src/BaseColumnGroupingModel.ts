import type { BasesPropertyId } from "obsidian";
import type { FfgGrouping, PropertyKeySection } from "./FfgGrouping";
import { t } from "./I18n";

export interface ColumnSegment {
  id: string;
  name: string;
  properties: BasesPropertyId[];
  collapsible: boolean;
  defaultFolded: boolean;
}

export interface ColumnLayout {
  properties: BasesPropertyId[];
  segments: ColumnSegment[];
}

export function createBaseColumnLayout(
  grouping: FfgGrouping,
  properties: BasesPropertyId[],
): ColumnLayout | null {
  const noteProperties = new Map<string, BasesPropertyId>();
  const fixed: BasesPropertyId[] = [];
  for (const property of properties) {
    const parsed = parseProperty(property);
    if (parsed?.type === "note") noteProperties.set(parsed.name, property);
    else fixed.push(property);
  }
  const arrangement = grouping.arrangeKeys(Array.from(noteProperties.keys()));
  if (!arrangement.configFound) return null;

  const segments: ColumnSegment[] = [];
  const ordered: BasesPropertyId[] = [];
  const pushSegment = (
    id: string,
    name: string,
    keys: string[],
    collapsible: boolean,
    defaultFolded: boolean,
    extra: BasesPropertyId[] = [],
  ): void => {
    const members = [
      ...extra,
      ...keys.flatMap((key) => {
        const property = noteProperties.get(key);
        return property ? [property] : [];
      }),
    ];
    if (members.length === 0) return;
    ordered.push(...members);
    segments.push({ id, name, properties: members, collapsible, defaultFolded });
  };

  pushSegment("__base-top", t("common"), arrangement.top, false, false, fixed);
  const unmatched = arrangement.sections.find((section) => section.kind === "unmatched");
  pushSegment("__base-unmatched", t("unmatched"), unmatched?.keys ?? [], false, false);
  for (const section of arrangement.sections) {
    if (section.kind !== "group") continue;
    const group = section as PropertyKeySection & { kind: "group" };
    pushSegment(group.id, group.name, group.keys, true, group.defaultFolded);
  }
  for (const property of properties) {
    if (!ordered.includes(property)) ordered.push(property);
  }
  return { properties: ordered, segments };
}

function parseProperty(
  property: BasesPropertyId,
): { type: "note" | "formula" | "file"; name: string } | null {
  const dot = property.indexOf(".");
  if (dot < 1) return null;
  const type = property.slice(0, dot);
  if (type !== "note" && type !== "formula" && type !== "file") return null;
  return { type, name: property.slice(dot + 1) };
}
