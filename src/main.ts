import { Menu, Plugin, TFolder } from "obsidian";
import { FOLDER_FILE_MENU_SOURCE } from "./FolderExplorerPanel";
import {
  GroupedPropertyExplorerView,
  VIEW_TYPE_GROUPED_PROPERTY_EXPLORER,
} from "./GroupedPropertyExplorerView";
import { NotePropertyGrouping } from "./NotePropertyGrouping";
import { NativeBaseColumnGrouping } from "./NativeBaseColumnGrouping";

export default class GroupedPropertyExplorerPlugin extends Plugin {
  private notePropertyGrouping: NotePropertyGrouping | null = null;
  private nativeBaseColumnGrouping: NativeBaseColumnGrouping | null = null;

  async onload(): Promise<void> {
    this.registerView(
      VIEW_TYPE_GROUPED_PROPERTY_EXPLORER,
      (leaf) => new GroupedPropertyExplorerView(leaf, this),
    );

    this.addRibbonIcon("list-tree", "打开多维文件夹", () => void this.activateView());
    this.addCommand({
      id: "open",
      name: "打开多维文件夹",
      callback: () => void this.activateView(),
    });
    this.addCommand({
      id: "refresh",
      name: "刷新多维文件夹",
      callback: () => void this.refreshViews(),
    });

    this.app.workspace.onLayoutReady(() => {
      void this.initView();
      this.notePropertyGrouping = new NotePropertyGrouping(this);
      void this.notePropertyGrouping.start();
      this.nativeBaseColumnGrouping = new NativeBaseColumnGrouping(this);
      void this.nativeBaseColumnGrouping.start();
    });
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file, source) => {
        if (!(file instanceof TFolder) || source === FOLDER_FILE_MENU_SOURCE) return;
        this.addFolderGroupingMenu(menu, file);
      }),
    );
  }

  onunload(): void {
    this.notePropertyGrouping?.stop();
    this.notePropertyGrouping = null;
    this.nativeBaseColumnGrouping?.stop();
    this.nativeBaseColumnGrouping = null;
  }

  private async initView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_GROUPED_PROPERTY_EXPLORER);
    if (existing[0]) {
      if (!(existing[0].view instanceof GroupedPropertyExplorerView)) {
        await existing[0].setViewState({
          type: VIEW_TYPE_GROUPED_PROPERTY_EXPLORER,
          active: false,
        });
      }
      return;
    }
    const leaf = workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_GROUPED_PROPERTY_EXPLORER, active: false });
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_GROUPED_PROPERTY_EXPLORER);
    if (existing[0]) {
      if (!(existing[0].view instanceof GroupedPropertyExplorerView)) {
        await existing[0].setViewState({
          type: VIEW_TYPE_GROUPED_PROPERTY_EXPLORER,
          active: true,
        });
      }
      await workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_GROUPED_PROPERTY_EXPLORER, active: true });
    await workspace.revealLeaf(leaf);
  }

  private async refreshViews(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_GROUPED_PROPERTY_EXPLORER)) {
      if (leaf.view instanceof GroupedPropertyExplorerView) await leaf.view.refresh();
    }
  }

  private addFolderGroupingMenu(menu: Menu, folder: TFolder): void {
    menu.addItem((item) =>
      item
        .setSection("metadata-explorer")
        .setIcon("list-tree")
        .setTitle("在多维文件夹中按属性分组…")
        .onClick(() => void this.openFolderGrouping(folder, "property")),
    );
    menu.addItem((item) =>
      item
        .setSection("metadata-explorer")
        .setIcon("tags")
        .setTitle("在多维文件夹中按标签前缀分组…")
        .onClick(() => void this.openFolderGrouping(folder, "tag")),
    );
    const view = this.getExplorerView();
    if (view?.hasFolderGrouping(folder)) {
      menu.addItem((item) =>
        item
          .setSection("metadata-explorer")
          .setIcon("ungroup")
          .setTitle("移除元数据虚拟分组")
          .setWarning(true)
          .onClick(() => void this.removeFolderGrouping(folder)),
      );
    }
  }

  private async openFolderGrouping(
    folder: TFolder,
    kind: "property" | "tag",
  ): Promise<void> {
    await this.activateView();
    await this.getExplorerView()?.openFolderGrouping(folder, kind);
  }

  private async removeFolderGrouping(folder: TFolder): Promise<void> {
    await this.activateView();
    await this.getExplorerView()?.removeFolderGrouping(folder);
  }

  private getExplorerView(): GroupedPropertyExplorerView | null {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_GROUPED_PROPERTY_EXPLORER)) {
      if (leaf.view instanceof GroupedPropertyExplorerView) return leaf.view;
    }
    return null;
  }
}
