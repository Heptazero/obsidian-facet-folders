import { t } from "./I18n";

export const EMPTY_PROPERTY_VALUE = "\u0000facet-folders-empty";
export const UNSERIALIZABLE_PROPERTY_VALUE = "\u0000facet-folders-unserializable";

export interface PropertyValueReplacement {
  changed: boolean;
  value: unknown;
}

export function indexPropertyValue(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [EMPTY_PROPERTY_VALUE];
  if (Array.isArray(raw)) {
    const values = raw.flatMap((value) => indexPropertyValue(value));
    return values.length > 0
      ? Array.from(new Set(values))
      : [EMPTY_PROPERTY_VALUE];
  }
  if (typeof raw === "object") {
    try {
      const serialized = JSON.stringify(raw);
      return serialized ? [serialized] : [EMPTY_PROPERTY_VALUE];
    } catch {
      return [UNSERIALIZABLE_PROPERTY_VALUE];
    }
  }
  if (
    typeof raw !== "string" &&
    typeof raw !== "number" &&
    typeof raw !== "boolean" &&
    typeof raw !== "bigint"
  ) {
    return [EMPTY_PROPERTY_VALUE];
  }
  const value = String(raw).trim();
  return value ? [value] : [EMPTY_PROPERTY_VALUE];
}

export function replaceIndexedPropertyValue(
  raw: unknown,
  oldValue: string,
  newValue: string,
): PropertyValueReplacement {
  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      return oldValue === EMPTY_PROPERTY_VALUE
        ? { changed: true, value: [newValue] }
        : { changed: false, value: raw };
    }

    let changed = false;
    const replaced = raw.map((item) => {
      const result = replaceIndexedPropertyValue(item, oldValue, newValue);
      if (result.changed) changed = true;
      return result.value;
    });
    return {
      changed,
      value: changed ? deduplicateValues(replaced) : raw,
    };
  }

  if (!indexPropertyValue(raw).includes(oldValue)) {
    return { changed: false, value: raw };
  }
  return { changed: true, value: coerceReplacement(raw, newValue) };
}

function coerceReplacement(raw: unknown, newValue: string): unknown {
  if (typeof raw === "number") {
    const parsed = Number(newValue);
    if (!Number.isFinite(parsed)) throw new Error(t("numberRequired"));
    return parsed;
  }
  if (typeof raw === "boolean") {
    const normalized = newValue.toLowerCase();
    if (normalized !== "true" && normalized !== "false") {
      throw new Error(t("booleanRequired"));
    }
    return normalized === "true";
  }
  if (typeof raw === "bigint") {
    try {
      return BigInt(newValue);
    } catch {
      throw new Error(t("integerRequired"));
    }
  }
  if (raw !== null && typeof raw === "object") {
    try {
      const parsed: unknown = JSON.parse(newValue);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error();
      }
      return parsed;
    } catch {
      throw new Error(t("jsonObjectRequired"));
    }
  }
  return newValue;
}

export function displayPropertyValue(value: string): string {
  if (value === EMPTY_PROPERTY_VALUE) return t("emptyValue");
  if (value === UNSERIALIZABLE_PROPERTY_VALUE) return t("unserializableObject");
  return value;
}

function deduplicateValues(values: unknown[]): unknown[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = indexPropertyValue(value).join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
