import { App, FuzzySuggestModal, Notice } from "obsidian";
import type { FolderGroupingRule } from "./FolderExplorerSettings";

export function openFolderGroupingPicker(
  app: App,
  kind: "property" | "tag",
  options: string[],
  onChoose: (rule: FolderGroupingRule) => void,
): void {
  if (options.length === 0) {
    new Notice(kind === "property" ? "库中没有可用属性。" : "库中没有层级标签前缀。");
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
    this.setPlaceholder(kind === "property" ? "搜索属性字段…" : "搜索标签前缀…");
    this.setInstructions([
      { command: "↑↓", purpose: "选择" },
      { command: "↵", purpose: "确认" },
      { command: "esc", purpose: "取消" },
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
