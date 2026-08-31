import { App, Modal, Setting } from "obsidian";
import type { PropertyGroupConfig, PropertyGroupDraft } from "./FfgGrouping";

type EditorMode = "select" | "regex";

export class GroupEditorModal extends Modal {
  private groupName: string;
  private mode: EditorMode;
  private readonly selected = new Set<string>();
  private regexText: string;
  private readonly orderedKeys: string[];

  constructor(
    app: App,
    private readonly availableKeys: string[],
    private readonly existingNames: string[],
    private readonly initial: PropertyGroupConfig | null,
    private readonly onSave: (draft: PropertyGroupDraft) => void,
  ) {
    super(app);
    this.groupName = initial?.name ?? "";
    const hasWildcard = initial?.matcherType === "unified" &&
      initial.matcherValues.some((value) => value.endsWith("*"));
    this.mode = initial?.matcherType === "regex" || hasWildcard ? "regex" : "select";

    if (initial?.matcherType === "unified" && !hasWildcard) {
      for (const value of initial.matcherValues) this.selected.add(value);
    }
    this.regexText = initial
      ? initial.matcherType === "regex"
        ? initial.matcherValues.join("\n")
        : hasWildcard
          ? this.unifiedValuesToRegex(initial.matcherValues)
          : ""
      : "";

    const preferred = initial?.fieldOrder ?? [];
    const keys = new Set([...availableKeys, ...this.selected]);
    this.orderedKeys = [
      ...preferred.filter((key) => keys.has(key)),
      ...Array.from(keys)
        .filter((key) => !preferred.includes(key))
        .sort((a, b) => a.localeCompare(b)),
    ];
  }

  onOpen(): void {
    this.modalEl.addClass("gpe-group-editor-modal");
    this.titleEl.setText(this.initial ? "编辑属性组" : "新建属性组");

    const errorEl = this.contentEl.createDiv("gpe-modal-error");
    new Setting(this.contentEl).setName("组名").addText((text) => {
      text.setPlaceholder("例如：项目元数据").setValue(this.groupName).onChange((value) => {
        this.groupName = value;
        errorEl.empty();
      });
      if (!this.initial) window.setTimeout(() => text.inputEl.focus());
    });

    let modeBody: HTMLElement;
    new Setting(this.contentEl)
      .setName("匹配方式")
      .setDesc("选择具体属性，或用正则自动接收将来出现的属性。")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("select", "选择属性")
          .addOption("regex", "正则表达式")
          .setValue(this.mode)
          .onChange((value) => {
            this.mode = value === "regex" ? "regex" : "select";
            errorEl.empty();
            this.renderModeBody(modeBody);
          });
      });

    modeBody = this.contentEl.createDiv("gpe-group-mode-body");
    this.renderModeBody(modeBody);
    new Setting(this.contentEl)
      .setClass("gpe-modal-actions")
      .addButton((button) => button.setButtonText("取消").onClick(() => this.close()))
      .addButton((button) =>
        button.setCta().setButtonText(this.initial ? "保存" : "创建").onClick(() => {
          const error = this.validateAndSave();
          if (error) errorEl.setText(error);
        }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderModeBody(container: HTMLElement): void {
    container.empty();
    if (this.mode === "regex") {
      container.createEl("p", {
        cls: "gpe-group-help",
        text: "每行一个正则表达式。属性名匹配任意一行时进入该组。",
      });
      new Setting(container).addTextArea((text) => {
        text
          .setPlaceholder("例如：^ai[-_]\n^agent-")
          .setValue(this.regexText)
          .onChange((value) => {
            this.regexText = value;
          });
        text.inputEl.rows = 6;
        text.inputEl.addClass("gpe-regex-input");
      });
      return;
    }

    container.createEl("p", {
      cls: "gpe-group-help",
      text: this.initial
        ? "显示未分组属性和当前组属性，不会与其他组产生重复匹配。"
        : "只显示尚未进入其他组的属性。",
    });
    const controls = container.createDiv("gpe-property-picker-controls");
    const search = controls.createEl("input", {
      cls: "gpe-property-picker-search",
      attr: { type: "search", placeholder: "筛选属性…", spellcheck: "false" },
    });
    const count = controls.createSpan("gpe-property-picker-count");
    const actions = controls.createDiv("gpe-property-picker-actions");
    const selectVisible = actions.createEl("button", { text: "全选可见" });
    const clear = actions.createEl("button", { text: "清空" });
    const list = container.createDiv("gpe-property-picker-list");

    const renderList = (): void => {
      list.empty();
      const query = search.value.trim().toLowerCase();
      const visible = this.orderedKeys.filter((key) => key.toLowerCase().includes(query));
      count.setText(`已选 ${this.selected.size} / 可选 ${this.orderedKeys.length}`);
      if (visible.length === 0) {
        list.createDiv({ cls: "gpe-property-picker-empty", text: "没有匹配的属性" });
        return;
      }
      for (const key of visible) {
        const row = list.createEl("label", { cls: "gpe-property-picker-row" });
        const checkbox = row.createEl("input", { attr: { type: "checkbox" } });
        checkbox.checked = this.selected.has(key);
        row.createSpan({ text: key });
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) this.selected.add(key);
          else this.selected.delete(key);
          count.setText(`已选 ${this.selected.size} / 可选 ${this.orderedKeys.length}`);
        });
      }
    };

    search.addEventListener("input", renderList);
    selectVisible.addEventListener("click", () => {
      const query = search.value.trim().toLowerCase();
      for (const key of this.orderedKeys) {
        if (key.toLowerCase().includes(query)) this.selected.add(key);
      }
      renderList();
    });
    clear.addEventListener("click", () => {
      this.selected.clear();
      renderList();
    });
    renderList();
  }

  private validateAndSave(): string | null {
    const name = this.groupName.trim();
    if (!name) return "组名不能为空。";
    if (this.existingNames.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
      return `已经存在名为“${name}”的组。`;
    }

    let matcherType: "unified" | "regex";
    let matcherValues: string[];
    let fieldOrder: string[];
    if (this.mode === "select") {
      matcherType = "unified";
      matcherValues = this.orderedKeys.filter((key) => this.selected.has(key));
      if (matcherValues.length === 0) return "请至少选择一个属性。";
      fieldOrder = [...matcherValues];
    } else {
      matcherType = "regex";
      matcherValues = this.regexText
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean);
      if (matcherValues.length === 0) return "请至少输入一个正则表达式。";
      for (const pattern of matcherValues) {
        try {
          new RegExp(pattern);
        } catch {
          return `无效的正则表达式：${pattern}`;
        }
      }
      fieldOrder = this.initial?.fieldOrder ? [...this.initial.fieldOrder] : [];
    }

    this.close();
    this.onSave({
      name,
      matcherType,
      matcherValues,
      fieldOrder,
      defaultFolded: this.initial?.defaultFolded ?? true,
    });
    return null;
  }

  private unifiedValuesToRegex(values: string[]): string {
    const parts = values.filter(Boolean).map((value) => {
      const wildcard = value.endsWith("*");
      const source = wildcard ? value.slice(0, -1) : value;
      const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return wildcard ? `${escaped}.*` : escaped;
    });
    return parts.length > 0 ? `^(?:${parts.join("|")})$` : "";
  }
}

export class DissolveGroupModal extends Modal {
  constructor(
    app: App,
    private readonly groupName: string,
    private readonly propertyCount: number,
    private readonly onConfirm: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("解散属性组");
    this.contentEl.createEl("p", {
      text: `将解散“${this.groupName}”，其中 ${this.propertyCount} 个属性会回到未分组，或由其他匹配规则接管。`,
    });
    this.contentEl.createEl("p", {
      cls: "gpe-group-help",
      text: "不会删除属性、属性值或笔记文件。",
    });
    new Setting(this.contentEl)
      .setClass("gpe-modal-actions")
      .addButton((button) => button.setButtonText("取消").onClick(() => this.close()))
      .addButton((button) =>
        button
          .setClass("mod-warning")
          .setButtonText("解散组")
          .onClick(() => {
            this.close();
            this.onConfirm();
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
