import type { PropertyGroupConfig } from "./FfgGrouping";

export interface TemplateField {
  name: string;
}

export interface FolderTemplate {
  group?: string;
  fields?: TemplateField[];
  fieldOrder?: string[];
  noGroupFields?: string[];
}

export interface RuntimeGroup {
  id: string;
  name: string;
  defaultFolded: boolean;
  fieldOrder: string[];
  matches: (key: string) => boolean;
}

export function createRuntimeGroup(
  group: PropertyGroupConfig,
  folderTemplates: FolderTemplate[],
): RuntimeGroup {
  const values = (group.matcherValues ?? []).filter(Boolean);
  const templates = folderTemplates.filter((template) => template.group === group.id);
  const templateFields: string[] = [];
  for (const template of templates) {
    const skipped = new Set(template.noGroupFields ?? []);
    const fields = (template.fields ?? [])
      .map((field) => field.name)
      .filter((name) => name && !skipped.has(name));
    const fieldSet = new Set(fields);
    for (const key of template.fieldOrder ?? []) {
      if (fieldSet.has(key) && !templateFields.includes(key)) templateFields.push(key);
    }
    for (const key of fields) {
      if (!templateFields.includes(key)) templateFields.push(key);
    }
  }

  const templateSet = new Set(templateFields);
  if (group.matcherType === "regex") {
    const patterns: RegExp[] = [];
    for (const value of values) {
      try {
        patterns.push(new RegExp(value));
      } catch {
        // Invalid expressions match nothing, as in FFG.
      }
    }
    return {
      id: group.id,
      name: group.name || "未命名组",
      defaultFolded: group.defaultFolded !== false,
      fieldOrder: Array.from(
        new Set([...templateFields, ...(group.fieldOrder ?? [])]),
      ),
      matches: (key) =>
        templateSet.has(key) || patterns.some((pattern) => pattern.test(key)),
    };
  }

  const literals = values.filter((value) => !value.endsWith("*"));
  const literalSet = new Set(literals);
  const prefixes = values
    .filter((value) => value.endsWith("*") && value.length > 1)
    .map((value) => value.slice(0, -1));
  return {
    id: group.id,
    name: group.name || "未命名组",
    defaultFolded: group.defaultFolded !== false,
    fieldOrder: Array.from(
      new Set([...literals, ...templateFields, ...(group.fieldOrder ?? [])]),
    ),
    matches: (key) =>
      templateSet.has(key) ||
      literalSet.has(key) ||
      prefixes.some((prefix) => key.startsWith(prefix)),
  };
}
