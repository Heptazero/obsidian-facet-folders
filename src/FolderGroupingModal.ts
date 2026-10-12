import { App, FuzzySuggestModal, Notice } from "obsidian";
import type { FolderGroupingRule } from "./FolderExplorerSettings";
import { t } from "./I18n";

export function openFolderGroupingPicker(
  app: App,
  kind: "property" | "tag",
  options: string[],
  onChoose: (rule: FolderGroupingRule) => void,
): void {
  if (options.length === 0) {
    new Notice(t(kind === "property" ? "noPropertyOptions" : "noTagPrefixOptions"));
    return;
  }
  new FolderGroupingPicker(app, kind, options, onChoose).open();
}

class FolderGroupingPicker extends FuzzySuggestModal<string> {
  constructor(
    app: App,
    private readonly kind: "property" | "tag",
    private readonly options: string[],
    private readonly onChoose: (rule: FolderGroupingRule) => void,
  ) {
    super(app);
    this.setPlaceholder(t(kind === "property" ? "searchPropertyField" : "searchTagPrefix"));
    this.setInstructions([
      { command: "↑↓", purpose: t("choose") },
      { command: "↵", purpose: t("confirm") },
      { command: "esc", purpose: t("cancel") },
    ]);
  }

  getItems(): string[] {
    return this.options;
  }

  getItemText(item: string): string {
    return item;
  }

  onChooseItem(item: string): void {
    this.onChoose(
      this.kind === "property"
        ? { kind: "property", key: item }
        : { kind: "tag", prefix: item },
    );
  }
}
