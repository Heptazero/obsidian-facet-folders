import { App, Menu, Notice, TFile } from "obsidian";
import {
  FfgGrouping,
  PropertyGroupDraft,
  PropertySection,
} from "./FfgGrouping";
import { DissolveGroupModal, GroupEditorModal } from "./GroupActionModals";
import {
  DeletePropertyModal,
  RenamePropertyModal,
  RenamePropertyValueModal,
} from "./PropertyActionModals";
import {
  EMPTY_VALUE,
  PropertyDataManager,
  PropertyEntry,
  ValueEntry,
} from "./PropertyDataManager";
import { t } from "./I18n";
import { displayPropertyValue } from "./PropertyValueMutation";

interface PropertyActionCallbacks {
  requestRender: () => void;
  setLoading: (text: string) => void;
  hideLoading: () => void;
  reloadAfterMutation: () => Promise<void>;
  forgetGroup: (groupId: string) => void;
  forgetProperty: (key: string) => void;
}

export class PropertyExplorerActions {
  constructor(
    private readonly app: App,
    private readonly dataManager: PropertyDataManager,
    private readonly grouping: FfgGrouping,
    private readonly callbacks: PropertyActionCallbacks,
  ) {}

  openGroupMenu(event: MouseEvent, section: PropertySection): void {
    const menu = new Menu();
    const pinned = this.grouping.isGroupPinned(section.id);
    const manual = this.grouping.getOrderMode() === "manual";
    menu.addItem((item) =>
      item
        .setIcon(pinned ? "pin-off" : "pin")
        .setTitle(
          `${t(pinned ? "unpinGroup" : "pinGroup")}${manual ? t("switchToAz") : ""}`,
        )
        .onClick(() => void this.toggleGroupPinned(section.id)),
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setIcon("settings-2")
        .setTitle(t("editGroup"))
        .onClick(() => this.openGroupEditor(section.id)),
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setIcon("ungroup")
        .setTitle(t("dissolveGroup"))
        .setWarning(true)
        .onClick(() => this.openDissolveGroup(section)),
    );
    menu.showAtMouseEvent(event);
  }

  openPropertyMenu(
    event: MouseEvent,
    entry: PropertyEntry,
    scopeId: string,
  ): void {
    const menu = new Menu();
    const pinned = this.grouping.isPropertyPinned(scopeId, entry.key);
    const manual = this.grouping.getOrderMode() === "manual";
    menu.addItem((item) =>
      item
        .setIcon(pinned ? "pin-off" : "pin")
        .setTitle(
          `${t(pinned ? "unpinProperty" : "pinProperty")}${manual ? t("switchToAz") : ""}`,
        )
        .onClick(() => void this.togglePropertyPinned(scopeId, entry.key)),
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setIcon("pencil")
        .setTitle(t("renameProperty"))
        .onClick(() => this.openRenameModal(entry)),
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setIcon("trash-2")
        .setTitle(t("deleteProperty"))
        .setWarning(true)
        .onClick(() => this.openDeleteModal(entry)),
    );
    menu.showAtMouseEvent(event);
  }

  openValueMenu(
    event: MouseEvent,
    propertyKey: string,
    valueEntry: ValueEntry,
  ): void {
    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setIcon("pencil")
        .setTitle(t("batchEditValue"))
        .onClick(() => this.openValueModal(propertyKey, valueEntry)),
    );
    menu.showAtMouseEvent(event);
  }

  openGroupEditor(groupId: string | null): void {
    const groups = this.grouping.getGroups();
    const initial = groupId
      ? groups.find((group) => group.id === groupId) ?? null
      : null;
    const availableKeys = this.grouping.getEditablePropertyKeys(
      groupId,
      this.dataManager.getEntries(),
    );
    const existingNames = groups
      .filter((group) => group.id !== groupId)
      .map((group) => group.name);
    new GroupEditorModal(
      this.app,
      availableKeys,
      existingNames,
      initial,
      (draft) => void this.saveGroup(groupId, draft),
    ).open();
  }

  private openDissolveGroup(section: PropertySection): void {
    new DissolveGroupModal(
      this.app,
      section.name,
      section.entries.length,
      () => void this.dissolveGroup(section.id, section.name),
    ).open();
  }

  private async saveGroup(
    groupId: string | null,
    draft: PropertyGroupDraft,
  ): Promise<void> {
    this.callbacks.setLoading(
      t(groupId ? "saveGroupLoading" : "createGroupLoading", { name: draft.name }),
    );
    try {
      if (groupId) await this.grouping.updateGroup(groupId, draft);
      else await this.grouping.createGroup(draft);
      await this.grouping.load();
      this.callbacks.hideLoading();
      this.callbacks.requestRender();
      new Notice(
        t(groupId ? "groupUpdated" : "groupCreated", { name: draft.name }),
      );
    } catch (error) {
      console.error("Facet Folders: cannot save group", error);
      this.callbacks.hideLoading();
      new Notice(t("groupSaveFailed", { name: draft.name }));
    }
  }

  private async dissolveGroup(groupId: string, groupName: string): Promise<void> {
    this.callbacks.setLoading(t("dissolveLoading", { name: groupName }));
    try {
      await this.grouping.dissolveGroup(groupId);
      this.callbacks.forgetGroup(groupId);
      await this.grouping.load();
      this.callbacks.hideLoading();
      this.callbacks.requestRender();
      new Notice(t("dissolved", { name: groupName }));
    } catch (error) {
      console.error("Facet Folders: cannot dissolve group", error);
      this.callbacks.hideLoading();
      new Notice(t("dissolveFailed", { name: groupName }));
    }
  }

  private openRenameModal(entry: PropertyEntry): void {
    const files = this.dataManager.getFilesForProperty(entry.key);
    new RenamePropertyModal(
      this.app,
      entry.key,
      files.length,
      (newKey) => {
        if (!newKey) return t("propertyNameRequired");
        if (newKey === entry.key) return t("samePropertyName");
        if (/[\r\n]/.test(newKey)) return t("propertyNameNewline");
        const conflicts = this.dataManager.getRenameConflicts(entry.key, newKey);
        if (conflicts.length > 0) {
          return t("renameConflict", { count: conflicts.length, name: newKey });
        }
        return null;
      },
      (newKey) => void this.renameProperty(entry.key, newKey),
    ).open();
  }

  private openDeleteModal(entry: PropertyEntry): void {
    const count = this.dataManager.getFilesForProperty(entry.key).length;
    new DeletePropertyModal(
      this.app,
      entry.key,
      count,
      () => void this.deleteProperty(entry.key),
    ).open();
  }

  private openValueModal(propertyKey: string, valueEntry: ValueEntry): void {
    new RenamePropertyValueModal(
      this.app,
      propertyKey,
      valueEntry.value,
      valueEntry.files.length,
      (newValue) => {
        if (!newValue) return t("valueRequired");
        if (/\r|\n/.test(newValue)) return t("valueNewline");
        if (newValue === valueEntry.value && valueEntry.value !== EMPTY_VALUE) {
          return t("samePropertyValue");
        }
        return this.dataManager.getValueReplacementError(
          propertyKey,
          valueEntry.value,
          newValue,
          valueEntry.files,
        );
      },
      (newValue) => void this.replacePropertyValue(propertyKey, valueEntry, newValue),
    ).open();
  }

  private async renameProperty(oldKey: string, newKey: string): Promise<void> {
    this.callbacks.setLoading(t("renamingProperty", { name: oldKey }));
    try {
      const result = await this.dataManager.renameProperty(oldKey, newKey);
      this.callbacks.forgetProperty(oldKey);
      if (result.failures.length === 0) {
        await this.grouping.renamePropertyKey(oldKey, newKey);
      }
      await this.callbacks.reloadAfterMutation();
      this.reportMutation(
        t("renamedProperty", { old: oldKey, next: newKey }),
        result.updated,
        result.failures,
      );
    } catch (error) {
      console.error("Facet Folders: rename failed", error);
      new Notice(t("renameFailed", { name: oldKey }));
      await this.callbacks.reloadAfterMutation();
    }
  }

  private async deleteProperty(key: string): Promise<void> {
    this.callbacks.setLoading(t("deletingProperty", { name: key }));
    try {
      const result = await this.dataManager.deleteProperty(key);
      this.callbacks.forgetProperty(key);
      if (result.failures.length === 0) await this.grouping.removePropertyKey(key);
      await this.callbacks.reloadAfterMutation();
      this.reportMutation(t("deletedProperty", { name: key }), result.updated, result.failures);
    } catch (error) {
      console.error("Facet Folders: delete failed", error);
      new Notice(t("deleteFailed", { name: key }));
      await this.callbacks.reloadAfterMutation();
    }
  }

  private async replacePropertyValue(
    propertyKey: string,
    valueEntry: ValueEntry,
    newValue: string,
  ): Promise<void> {
    this.callbacks.setLoading(t("editingValue", { name: propertyKey }));
    try {
      const result = await this.dataManager.replacePropertyValue(
        propertyKey,
        valueEntry.value,
        newValue,
        valueEntry.files,
      );
      await this.callbacks.reloadAfterMutation();
      this.reportMutation(
        t("editedValue", {
          old: displayPropertyValue(valueEntry.value),
          next: newValue,
        }),
        result.updated,
        result.failures,
      );
    } catch (error) {
      console.error("Facet Folders: property value update failed", error);
      new Notice(t("editValueFailed", { name: propertyKey }));
      await this.callbacks.reloadAfterMutation();
    }
  }

  private async toggleGroupPinned(groupId: string): Promise<void> {
    if (this.grouping.getOrderMode() !== "alphabetical") {
      await this.grouping.setOrderMode("alphabetical", this.dataManager.getEntries());
    }
    await this.grouping.toggleGroupPinned(groupId);
    this.callbacks.requestRender();
  }

  private async togglePropertyPinned(scopeId: string, key: string): Promise<void> {
    if (this.grouping.getOrderMode() !== "alphabetical") {
      await this.grouping.setOrderMode("alphabetical", this.dataManager.getEntries());
    }
    await this.grouping.togglePropertyPinned(scopeId, key);
    this.callbacks.requestRender();
  }

  private reportMutation(
    message: string,
    updated: number,
    failures: Array<{ file: TFile; error: unknown }>,
  ): void {
    if (failures.length === 0) {
      new Notice(t("mutationDone", { message, count: updated }));
      return;
    }
    console.error("Facet Folders: some property updates failed", failures);
    new Notice(t("mutationPartial", {
      message,
      updated,
      failed: failures.length,
    }));
  }
}
