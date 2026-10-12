import { Menu, Notice, Plugin, TFolder } from "obsidian";
import {
  FacetFoldersDataStore,
  FacetFoldersLanguage,
} from "./FacetFoldersDataStore";
import { FacetFoldersSettingTab } from "./FacetFoldersSettingTab";
import { GROUPING_SETTINGS_CHANGED_EVENT } from "./FfgGrouping";
import { FOLDER_FILE_MENU_SOURCE } from "./FolderExplorerPanel";
import {
  GroupedPropertyExplorerView,
  VIEW_TYPE_GROUPED_PROPERTY_EXPLORER,
} from "./GroupedPropertyExplorerView";
import { NotePropertyGrouping } from "./NotePropertyGrouping";
import { NativeBaseColumnGrouping } from "./NativeBaseColumnGrouping";
import { setLanguage, t } from "./I18n";

export default class GroupedPropertyExplorerPlugin extends Plugin {
  readonly dataStore = new FacetFoldersDataStore(this);
  private notePropertyGrouping: NotePropertyGrouping | null = null;
  private nativeBaseColumnGrouping: NativeBaseColumnGrouping | null = null;
  private ribbonEl: HTMLElement | null = null;

  async onload(): Promise<void> {
    await this.dataStore.load();
    setLanguage(this.dataStore.getSettings().language);
    this.addSettingTab(new FacetFoldersSettingTab(this.app, this));
    this.registerView(
      VIEW_TYPE_GROUPED_PROPERTY_EXPLORER,
      (leaf) => new GroupedPropertyExplorerView(leaf, this),
    );

    this.ribbonEl = this.addRibbonIcon("list-tree", t("openExplorer"), () =>
      void this.activateView(),
    );
    this.addCommand({
      id: "open",
      name: t("openExplorer"),
      callback: () => void this.activateView(),
    });
    this.addCommand({
      id: "refresh",
      name: t("refreshExplorer"),
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

  async setLanguageSetting(language: FacetFoldersLanguage): Promise<void> {
    if (this.dataStore.getSettings().language === language) return;
    try {
      await this.dataStore.updateSettings({ language });
      setLanguage(language);
      this.ribbonEl?.setAttribute("aria-label", t("openExplorer"));
      await this.refreshLanguageViews();
      this.app.workspace.trigger(GROUPING_SETTINGS_CHANGED_EVENT);
      new Notice(t("languageChanged"));
    } catch (error) {
      console.error("Facet Folders: cannot change language", error);
      new Notice(t("languageChangeFailed"));
    }
  }

  async setDataFolderSetting(dataFolder: string): Promise<void> {
    if (this.dataStore.getSettings().dataFolder === dataFolder) return;
    if (dataFolder !== "" && dataFolder !== ".") {
      const target = this.app.vault.getAbstractFileByPath(dataFolder);
      if (!(target instanceof TFolder)) {
        new Notice(t("dataMoveFailed"));
        return;
      }
    }
    try {
      await this.dataStore.updateSettings({ dataFolder });
      await this.refreshViews();
      this.app.workspace.trigger(GROUPING_SETTINGS_CHANGED_EVENT);
      new Notice(t("dataMoved", { path: this.dataStore.getDataFilePath() }));
    } catch (error) {
      console.error("Facet Folders: cannot move plugin data", error);
      new Notice(t("dataMoveFailed"));
    }
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

  private async refreshLanguageViews(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_GROUPED_PROPERTY_EXPLORER)) {
      if (leaf.view instanceof GroupedPropertyExplorerView) {
        await leaf.view.refreshLanguage();
      }
    }
  }

  private addFolderGroupingMenu(menu: Menu, folder: TFolder): void {
    menu.addItem((item) =>
      item
        .setSection("metadata-explorer")
        .setIcon("list-tree")
        .setTitle(t("groupFolderByProperty"))
        .onClick(() => void this.openFolderGrouping(folder, "property")),
    );
    menu.addItem((item) =>
      item
        .setSection("metadata-explorer")
        .setIcon("tags")
        .setTitle(t("groupFolderByTag"))
        .onClick(() => void this.openFolderGrouping(folder, "tag")),
    );
    const view = this.getExplorerView();
    if (view?.hasFolderGrouping(folder)) {
      menu.addItem((item) =>
        item
          .setSection("metadata-explorer")
          .setIcon("ungroup")
          .setTitle(t("removeVirtualGrouping"))
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
