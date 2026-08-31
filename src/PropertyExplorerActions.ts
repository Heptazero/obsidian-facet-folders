import { App, Menu, Notice, TFile } from "obsidian";
import {
  FfgGrouping,
  PropertyGroupDraft,
  PropertySection,
} from "./FfgGrouping";
import { DissolveGroupModal, GroupEditorModal } from "./GroupActionModals";
import { DeletePropertyModal, RenamePropertyModal } from "./PropertyActionModals";
import { PropertyDataManager, PropertyEntry } from "./PropertyDataManager";

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
          `${pinned ? "取消置顶组" : "置顶组"}${manual ? "（切换到 A–Z）" : ""}`,
        )
        .onClick(() => void this.toggleGroupPinned(section.id)),
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setIcon("settings-2")
        .setTitle("编辑组…")
        .onClick(() => this.openGroupEditor(section.id)),
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setIcon("ungroup")
        .setTitle("解散组…")
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
          `${pinned ? "取消置顶属性" : "置顶属性"}${manual ? "（切换到 A–Z）" : ""}`,
        )
        .onClick(() => void this.togglePropertyPinned(scopeId, entry.key)),
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setIcon("pencil")
        .setTitle("重命名属性…")
        .onClick(() => this.openRenameModal(entry)),
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setIcon("trash-2")
        .setTitle("删除属性…")
        .setWarning(true)
        .onClick(() => this.openDeleteModal(entry)),
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
      groupId ? `正在保存“${draft.name}”…` : `正在创建“${draft.name}”…`,
    );
    try {
      if (groupId) await this.grouping.updateGroup(groupId, draft);
      else await this.grouping.createGroup(draft);
      await this.grouping.load();
      this.callbacks.hideLoading();
      this.callbacks.requestRender();
      new Notice(
        groupId ? `已更新属性组“${draft.name}”。` : `已创建属性组“${draft.name}”。`,
      );
    } catch (error) {
      console.error("Facet Folders: cannot save group", error);
      this.callbacks.hideLoading();
      new Notice(`无法保存属性组“${draft.name}”，请查看控制台。`);
    }
  }

  private async dissolveGroup(groupId: string, groupName: string): Promise<void> {
    this.callbacks.setLoading(`正在解散“${groupName}”…`);
    try {
      await this.grouping.dissolveGroup(groupId);
      this.callbacks.forgetGroup(groupId);
      await this.grouping.load();
      this.callbacks.hideLoading();
      this.callbacks.requestRender();
      new Notice(`已解散属性组“${groupName}”，未修改任何笔记。`);
    } catch (error) {
      console.error("Facet Folders: cannot dissolve group", error);
      this.callbacks.hideLoading();
      new Notice(`无法解散属性组“${groupName}”，请查看控制台。`);
    }
  }

  private openRenameModal(entry: PropertyEntry): void {
    const files = this.dataManager.getFilesForProperty(entry.key);
    new RenamePropertyModal(
      this.app,
      entry.key,
      files.length,
      (newKey) => {
        if (!newKey) return "属性名不能为空。";
        if (newKey === entry.key) return "新属性名与原属性名相同。";
        if (/[\r\n]/.test(newKey)) return "属性名不能包含换行。";
        const conflicts = this.dataManager.getRenameConflicts(entry.key, newKey);
        if (conflicts.length > 0) {
          return `${conflicts.length} 篇笔记已存在“${newKey}”，为避免覆盖，未执行重命名。`;
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

  private async renameProperty(oldKey: string, newKey: string): Promise<void> {
    this.callbacks.setLoading(`正在重命名“${oldKey}”…`);
    try {
      const result = await this.dataManager.renameProperty(oldKey, newKey);
      this.callbacks.forgetProperty(oldKey);
      if (result.failures.length === 0) {
        await this.grouping.renamePropertyKey(oldKey, newKey);
      }
      await this.callbacks.reloadAfterMutation();
      this.reportMutation(
        `已将“${oldKey}”重命名为“${newKey}”`,
        result.updated,
        result.failures,
      );
    } catch (error) {
      console.error("Facet Folders: rename failed", error);
      new Notice(`重命名“${oldKey}”失败，请查看控制台。`);
      await this.callbacks.reloadAfterMutation();
    }
  }

  private async deleteProperty(key: string): Promise<void> {
    this.callbacks.setLoading(`正在删除属性“${key}”…`);
    try {
      const result = await this.dataManager.deleteProperty(key);
      this.callbacks.forgetProperty(key);
      if (result.failures.length === 0) await this.grouping.removePropertyKey(key);
      await this.callbacks.reloadAfterMutation();
      this.reportMutation(`已删除属性“${key}”`, result.updated, result.failures);
    } catch (error) {
      console.error("Facet Folders: delete failed", error);
      new Notice(`删除属性“${key}”失败，请查看控制台。`);
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
      new Notice(`${message}，共更新 ${updated} 篇笔记。`);
      return;
    }
    console.error("Facet Folders: some property updates failed", failures);
    new Notice(`${message}：成功 ${updated} 篇，失败 ${failures.length} 篇。`);
  }
}
