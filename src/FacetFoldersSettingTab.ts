import {
  AbstractInputSuggest,
  App,
  PluginSettingTab,
  prepareFuzzySearch,
  Setting,
  type SettingDefinitionItem,
  TFolder,
} from "obsidian";
import type { FacetFoldersLanguage } from "./FacetFoldersDataStore";
import { t } from "./I18n";
import type GroupedPropertyExplorerPlugin from "./main";

interface LanguageOption {
  value: FacetFoldersLanguage;
  label: string;
  search: string;
}

interface FolderOption {
  path: string;
  label: string;
}

export class FacetFoldersSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly owner: GroupedPropertyExplorerPlugin,
  ) {
    super(app, owner);
  }

  display(): void {
    this.renderLegacySettings();
  }

  private renderLegacySettings(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName(t("settingsTitle")).setHeading();
    this.renderLanguageSetting(new Setting(containerEl));
    this.renderDataFolderSetting(new Setting(containerEl));
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        type: "group",
        heading: t("settingsTitle"),
        items: [
          {
            name: t("language"),
            desc: t("languageDesc"),
            aliases: ["language", "语言", "中文", "English"],
            render: (setting) => this.renderLanguageControl(setting),
          },
          {
            name: t("dataFolder"),
            desc: this.dataFolderDescription(),
            aliases: ["data", "storage", "folder", "数据", "储存", "文件夹"],
            render: (setting) => this.renderDataFolderControl(setting),
          },
        ],
      },
    ];
  }

  private renderLanguageSetting(setting: Setting): void {
    setting.setName(t("language")).setDesc(t("languageDesc"));
    this.renderLanguageControl(setting);
  }

  private renderLanguageControl(setting: Setting): void {
    const settings = this.owner.dataStore.getSettings();
    const languages = this.languageOptions();
    const currentLanguage = languages.find((option) => option.value === settings.language);
    setting.addSearch((search) => {
      search.setValue(currentLanguage?.label ?? t("chinese"));
      search.setPlaceholder(t("language"));
      new LanguageSuggest(this.app, search.inputEl, languages, (option) => {
        void this.owner.setLanguageSetting(option.value).then(() => this.refresh());
      });
    });
  }

  private renderDataFolderSetting(setting: Setting): void {
    setting.setName(t("dataFolder")).setDesc(this.dataFolderDescription());
    this.renderDataFolderControl(setting);
  }

  private renderDataFolderControl(setting: Setting): void {
    const settings = this.owner.dataStore.getSettings();
    const folders = this.folderOptions();
    const currentFolder = folders.find((option) => option.path === settings.dataFolder);
    setting.addSearch((search) => {
      search.setValue(currentFolder?.label ?? settings.dataFolder);
      search.setPlaceholder(t("dataFolder"));
      new FolderSuggest(this.app, search.inputEl, folders, (option) => {
        void this.owner.setDataFolderSetting(option.path).then(() => this.refresh());
      });
    });
  }

  private dataFolderDescription(): string {
    return `${t("dataFolderDesc")} ${this.owner.dataStore.getDataFilePath()}`;
  }

  private refresh(): void {
    const update = (this as unknown as { update?: () => void }).update;
    if (typeof update === "function") update.call(this);
    else this.renderLegacySettings();
  }

  private languageOptions(): LanguageOption[] {
    return [
      { value: "zh-CN", label: t("chinese"), search: "简体中文 Chinese zh-CN" },
      { value: "en", label: t("english"), search: "English 英文 en" },
    ];
  }

  private folderOptions(): FolderOption[] {
    const special: FolderOption[] = [
      { path: "", label: t("pluginFolder") },
      { path: ".", label: t("vaultRoot") },
    ];
    const folders: FolderOption[] = [];
    for (const file of this.app.vault.getAllLoadedFiles()) {
      if (!(file instanceof TFolder) || file.isRoot()) continue;
      folders.push({ path: file.path, label: file.path });
    }
    return [...special, ...folders.sort((a, b) => a.label.localeCompare(b.label))];
  }
}

class LanguageSuggest extends AbstractInputSuggest<LanguageOption> {
  constructor(
    app: App,
    input: HTMLInputElement,
    private readonly options: LanguageOption[],
    private readonly choose: (option: LanguageOption) => void,
  ) {
    super(app, input);
  }

  protected getSuggestions(query: string): LanguageOption[] {
    return fuzzyFilter(this.options, query, (option) => option.search);
  }

  renderSuggestion(option: LanguageOption, element: HTMLElement): void {
    element.setText(option.label);
  }

  selectSuggestion(option: LanguageOption): void {
    this.setValue(option.label);
    this.close();
    this.choose(option);
  }
}

class FolderSuggest extends AbstractInputSuggest<FolderOption> {
  constructor(
    app: App,
    input: HTMLInputElement,
    private readonly options: FolderOption[],
    private readonly choose: (option: FolderOption) => void,
  ) {
    super(app, input);
  }

  protected getSuggestions(query: string): FolderOption[] {
    return fuzzyFilter(this.options, query, (option) => option.label);
  }

  renderSuggestion(option: FolderOption, element: HTMLElement): void {
    element.setText(option.label);
  }

  selectSuggestion(option: FolderOption): void {
    this.setValue(option.label);
    this.close();
    this.choose(option);
  }
}

function fuzzyFilter<T>(items: T[], query: string, text: (item: T) => string): T[] {
  const normalized = query.trim();
  if (!normalized) return items;
  const search = prepareFuzzySearch(normalized);
  return items.filter((item) => search(text(item)) !== null);
}
