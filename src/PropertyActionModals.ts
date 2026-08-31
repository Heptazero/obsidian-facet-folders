import { App, Modal, Setting } from "obsidian";

export class RenamePropertyModal extends Modal {
  constructor(
    app: App,
    private readonly oldKey: string,
    private readonly noteCount: number,
    private readonly validate: (newKey: string) => string | null,
    private readonly onConfirm: (newKey: string) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("重命名属性");
    this.contentEl.createEl("p", {
      text: `将“${this.oldKey}”在 ${this.noteCount} 篇笔记中统一重命名，原属性值保持不变。`,
    });

    const errorEl = this.contentEl.createDiv("gpe-modal-error");
    let nextKey = this.oldKey;
    let submit = (): void => undefined;

    new Setting(this.contentEl).setName("新属性名").addText((text) => {
      text.setValue(this.oldKey).onChange((value) => {
        nextKey = value;
        errorEl.empty();
      });
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        submit();
      });
      window.setTimeout(() => {
        text.inputEl.focus();
        text.inputEl.select();
      });
    });

    submit = () => {
      const normalized = nextKey.trim();
      const error = this.validate(normalized);
      if (error) {
        errorEl.setText(error);
        return;
      }
      this.close();
      this.onConfirm(normalized);
    };

    new Setting(this.contentEl)
      .setClass("gpe-modal-actions")
      .addButton((button) => button.setButtonText("取消").onClick(() => this.close()))
      .addButton((button) => button.setCta().setButtonText("重命名").onClick(submit));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class DeletePropertyModal extends Modal {
  constructor(
    app: App,
    private readonly propertyKey: string,
    private readonly noteCount: number,
    private readonly onConfirm: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("删除属性");
    this.contentEl.createEl("p", {
      text: `将在 ${this.noteCount} 篇笔记中删除属性“${this.propertyKey}”。`,
    });
    this.contentEl.createEl("p", {
      cls: "gpe-modal-warning",
      text: "只删除该属性及其值，不会删除任何笔记文件。此操作会直接修改这些笔记。",
    });

    new Setting(this.contentEl)
      .setClass("gpe-modal-actions")
      .addButton((button) => button.setButtonText("取消").onClick(() => this.close()))
      .addButton((button) =>
        button
          .setWarning()
          .setButtonText("仅删除属性")
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
