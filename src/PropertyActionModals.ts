import { App, Modal, Setting } from "obsidian";
import {
  displayPropertyValue,
  EMPTY_PROPERTY_VALUE,
} from "./PropertyValueMutation";
import { t } from "./I18n";

export class RenamePropertyValueModal extends Modal {
  constructor(
    app: App,
    private readonly propertyKey: string,
    private readonly oldValue: string,
    private readonly noteCount: number,
    private readonly validate: (newValue: string) => string | null,
    private readonly onConfirm: (newValue: string) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(t("batchEditValueTitle"));
    this.contentEl.createEl("p", {
      text: t("batchEditValueDesc", {
        property: this.propertyKey,
        value: displayPropertyValue(this.oldValue),
        count: this.noteCount,
      }),
    });
    this.contentEl.createEl("p", {
      text: t("batchEditValueScope"),
    });

    const errorEl = this.contentEl.createDiv("gpe-modal-error");
    let nextValue = this.oldValue === EMPTY_PROPERTY_VALUE ? "" : this.oldValue;
    let submit = (): void => undefined;

    new Setting(this.contentEl).setName(t("newPropertyValue")).addText((text) => {
      text.setValue(nextValue).onChange((value) => {
        nextValue = value;
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
      const normalized = nextValue.trim();
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
      .addButton((button) => button.setButtonText(t("cancel")).onClick(() => this.close()))
      .addButton((button) => button.setCta().setButtonText(t("batchEdit")).onClick(submit));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

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
    this.titleEl.setText(t("renamePropertyTitle"));
    this.contentEl.createEl("p", {
      text: t("renamePropertyDesc", { name: this.oldKey, count: this.noteCount }),
    });

    const errorEl = this.contentEl.createDiv("gpe-modal-error");
    let nextKey = this.oldKey;
    let submit = (): void => undefined;

    new Setting(this.contentEl).setName(t("newPropertyName")).addText((text) => {
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
      .addButton((button) => button.setButtonText(t("cancel")).onClick(() => this.close()))
      .addButton((button) => button.setCta().setButtonText(t("rename")).onClick(submit));
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
    this.titleEl.setText(t("deletePropertyTitle"));
    this.contentEl.createEl("p", {
      text: t("deletePropertyDesc", {
        count: this.noteCount,
        name: this.propertyKey,
      }),
    });
    this.contentEl.createEl("p", {
      cls: "gpe-modal-warning",
      text: t("deletePropertyWarning"),
    });

    new Setting(this.contentEl)
      .setClass("gpe-modal-actions")
      .addButton((button) => button.setButtonText(t("cancel")).onClick(() => this.close()))
      .addButton((button) =>
        button
          .setClass("mod-warning")
          .setButtonText(t("deleteOnlyProperty"))
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
