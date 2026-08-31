import {
  AbstractInputSuggest,
  App,
  Modal,
  Setting,
  TFile,
} from "obsidian";

export type TagBatchOperation = "add" | "remove";

export interface TagBatchResult {
  updated: number;
  unchanged: number;
  failures: Array<{ file: TFile; error: unknown }>;
}

class TagInputSuggest extends AbstractInputSuggest<string> {
  private readonly tags: string[];
  private readonly targetInput: HTMLInputElement;

  constructor(app: App, inputEl: HTMLInputElement, tags: string[]) {
    super(app, inputEl);
    this.tags = tags;
    this.targetInput = inputEl;
  }

  getSuggestions(inputStr: string): string[] {
    const query = inputStr.split(/[,\s]+/).pop()?.toLowerCase() ?? "";
    if (!query) return this.tags.slice(0, 20);
    return this.tags
      .filter((tag) => tag.toLowerCase().includes(query))
      .slice(0, 20);
  }

  renderSuggestion(tag: string, el: HTMLElement): void {
    el.createDiv({ cls: "gpe-tag-suggestion", text: `#${tag}` });
  }

  selectSuggestion(tag: string): void {
    const tokens = this.targetInput.value.split(/[,\s]+/).filter(Boolean);
    if (tokens.length > 0) tokens.pop();
    tokens.push(tag);
    this.targetInput.value = `${tokens.join(", ")}, `;
    this.targetInput.trigger("input");
    this.close();
  }
}

export class TagBatchModal extends Modal {
  private readonly files: TFile[];
  private readonly operation: TagBatchOperation;
  private readonly availableTags: string[];
  private readonly initialTags: string[];
  private readonly onSubmit: (tags: string[]) => Promise<void>;
  private inputValue = "";

  constructor(
    app: App,
    files: TFile[],
    operation: TagBatchOperation,
    availableTags: string[],
    initialTags: string[],
    onSubmit: (tags: string[]) => Promise<void>,
  ) {
    super(app);
    this.files = files;
    this.operation = operation;
    this.availableTags = availableTags;
    this.initialTags = initialTags;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    this.modalEl.addClass("gpe-tag-batch-modal");
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", {
      text: this.operation === "add" ? "批量添加标签" : "批量移除标签",
    });
    contentEl.createEl("p", {
      cls: "gpe-tag-batch-scope",
      text:
        this.operation === "add"
          ? `将修改 ${this.files.length} 篇笔记的 frontmatter；正文中的 #标签不变。`
          : `只从 ${this.files.length} 篇笔记的 frontmatter 移除标签；不删除笔记，正文中的 #标签不变。`,
    });

    const preview = contentEl.createDiv("gpe-tag-batch-files");
    for (const file of this.files.slice(0, 6)) {
      preview.createDiv({ cls: "gpe-tag-batch-file", text: file.path });
    }
    if (this.files.length > 6) {
      preview.createDiv({
        cls: "gpe-tag-batch-more",
        text: `另有 ${this.files.length - 6} 篇…`,
      });
    }

    const errorEl = contentEl.createDiv("gpe-modal-error");
    const setting = new Setting(contentEl)
      .setName(this.operation === "add" ? "添加" : "移除")
      .setDesc("多个标签用逗号或空格分隔，无需输入 #。")
      .addText((text) => {
        this.inputValue = this.initialTags.join(", ");
        text
          .setPlaceholder(this.operation === "add" ? "项目, 待处理" : "旧标签")
          .setValue(this.inputValue)
          .onChange((value) => {
            this.inputValue = value;
            errorEl.empty();
          });
        new TagInputSuggest(this.app, text.inputEl, this.availableTags);
        window.setTimeout(() => text.inputEl.focus(), 0);
      });
    setting.settingEl.addClass("gpe-tag-batch-input");

    const actions = contentEl.createDiv("gpe-tag-batch-actions");
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => this.close());
    const submit = actions.createEl("button", {
      cls: this.operation === "remove" ? "mod-warning" : "mod-cta",
      text: this.operation === "add" ? "添加标签" : "移除标签",
    });
    submit.addEventListener("click", () => {
      const tags = parseTagInput(this.inputValue);
      if (tags.length === 0) {
        errorEl.setText("至少输入一个标签。");
        return;
      }
      submit.disabled = true;
      cancel.disabled = true;
      void this.onSubmit(tags).finally(() => this.close());
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export async function applyFrontmatterTagBatch(
  app: App,
  files: TFile[],
  operation: TagBatchOperation,
  tags: string[],
): Promise<TagBatchResult> {
  const result: TagBatchResult = { updated: 0, unchanged: 0, failures: [] };
  const targets = new Set(tags.map((tag) => tag.toLowerCase()));

  for (const file of files) {
    try {
      const cached = app.metadataCache.getFileCache(file)?.frontmatter;
      const cachedTags = parseFrontmatterTags(getTagsProperty(cached));
      const cachedSet = new Set(cachedTags.map((tag) => tag.toLowerCase()));
      const needsChange =
        operation === "add"
          ? tags.some((tag) => !cachedSet.has(tag.toLowerCase()))
          : cachedTags.some((tag) => targets.has(tag.toLowerCase()));
      if (!needsChange) {
        result.unchanged += 1;
        continue;
      }

      let changed = false;
      await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
        const tagsKey =
          Object.keys(frontmatter).find((key) => key.toLowerCase() === "tags") ?? "tags";
        const rawValue = frontmatter[tagsKey];
        if (
          rawValue !== undefined &&
          typeof rawValue !== "string" &&
          (!Array.isArray(rawValue) || rawValue.some((tag) => typeof tag !== "string"))
        ) {
          throw new Error(`不支持的 tags 格式：${file.path}`);
        }
        const current = parseFrontmatterTags(rawValue);
        let next = [...current];
        if (operation === "add") {
          const existing = new Set(current.map((tag) => tag.toLowerCase()));
          for (const tag of tags) {
            if (existing.has(tag.toLowerCase())) continue;
            next.push(tag);
            existing.add(tag.toLowerCase());
          }
        } else {
          next = current.filter((tag) => !targets.has(tag.toLowerCase()));
        }

        changed = next.length !== current.length;
        if (!changed) return;
        if (next.length === 0) delete frontmatter[tagsKey];
        else if (typeof rawValue === "string" && next.length === 1) {
          frontmatter[tagsKey] = next[0];
        } else {
          frontmatter[tagsKey] = next;
        }
      });
      if (changed) result.updated += 1;
      else result.unchanged += 1;
    } catch (error) {
      result.failures.push({ file, error });
    }
  }
  return result;
}

function parseTagInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,\s]+/)
        .map((tag) => normalizeTag(tag))
        .filter(Boolean),
    ),
  );
}

function parseFrontmatterTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => normalizeTag(tag))
      .filter(Boolean);
  }
  if (typeof value !== "string") return [];
  return value
    .split(/[,\s]+/)
    .map((tag) => normalizeTag(tag))
    .filter(Boolean);
}

function getTagsProperty(frontmatter: Record<string, unknown> | undefined): unknown {
  if (!frontmatter) return undefined;
  const key = Object.keys(frontmatter).find((candidate) => candidate.toLowerCase() === "tags");
  return key ? frontmatter[key] : undefined;
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#+/, "").replace(/^\/+|\/+$/g, "");
}
