export function normalizePath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/\/+/g, "/");
  return normalized === "/" ? "/" : normalized.replace(/\/$/, "");
}

export class Plugin {}

export class TFolder {}
