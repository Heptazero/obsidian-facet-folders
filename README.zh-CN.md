# Facet Folders

[English](./README.md)

Facet Folders（多维文件夹）把文件夹、属性和标签变成同一个 Obsidian 库的三种视图。它先提供一个像文件树一样的元数据侧边栏，再把相同的属性分组带进原生“属性”面板和 Bases 表格。

插件不建立专有数据库。笔记、frontmatter、真实文件夹、标签和 `.base` 文件始终是数据源。

## 和其他插件有什么不同

Facet Folders 不是单独的属性浏览器或标签管理器。它的核心差异是：**同一套分组，同时用于导航和 Obsidian 原生界面。**

| 工具 | 主要用途 | Facet Folders 增加或不同的部分 |
| --- | --- | --- |
| Obsidian 文件列表 | 展示真实文件夹树 | 可以从属性值或标签前缀生成会保存状态的虚拟子文件夹，但不创建目录，也不移动笔记。 |
| [Property Explorer](https://github.com/october-learns/obsidian-property-explorer) | 按 `属性 → 值 → 笔记` 浏览 | 增加命名属性组、置顶/手动排序、文件夹和标签模式、批量修改，并把同一分组用于原生属性面板和 Bases。只需要专用属性浏览器及其排序选项时，Property Explorer 更聚焦。 |
| [Foldable Frontmatter Groups](https://github.com/cwagner223355/obsidian-foldable-frontmatter-groups) | 用规则和模板维护 frontmatter 分组与顺序 | Facet Folders 侧重导航和运行时展示，可以读取兼容的 FFG 分组，但不会自动校正或改写 frontmatter 顺序。需要模板约束和 frontmatter 生命周期管理时，FFG 更合适。 |
| [Tag Tactician](https://github.com/scottTomaszewski/obsidian-tag-tactician) | 批量修改标签、计算相关笔记 | 把标签层级做成与文件夹/属性并列的树形视图，但有意不加入相关笔记评分；需要该功能时仍可使用 Tag Tactician。 |

这些插件是设计参考，也可以互补使用；它们不是依赖。Facet Folders 是独立实现。

## 功能

### 一个库，三种浏览方式

在搜索框上方切换 `文件夹 / 属性 / 标签`：

- **文件夹**：镜像真实目录树，显示递归 Markdown 笔记数量，保留原生右键菜单，并支持置顶文件。
- **属性**：按 `组 → 属性 → 值 → 笔记` 展开，支持搜索和实时更新。
- **标签**：把正文标签与 frontmatter 标签显示成“子标签/笔记”层级。

Obsidian 重新打开后，会恢复上次模式和展开状态。

### 把元数据变成虚拟文件夹

右键真实文件夹，选择一个属性或标签前缀。例如文件夹中的笔记分别包含 `status: active` 和 `status: done`，视图就会生成虚拟的 `active`、`done` 子文件夹。

标签也一样。选择 `熟悉度` 后，`#熟悉度/高` 与 `#熟悉度/低` 会显示成虚拟的 `高`、`低` 文件夹。

虚拟文件夹只改变展示。它会保存展开和分组状态，但不会创建目录、移动笔记或改写 `.base` 文件。

### 一套属性组，用在三个位置

直接在侧边栏新建、编辑或解散属性组。每个组可以使用多选属性、`pa_*` 这样的前缀通配符，或正则表达式。

同一套组会显示在：

- 侧边栏属性树；
- 打开笔记的原生“属性”区域；
- 原生 Bases 表格表头。

在 Bases 里，折叠后整组属性列会压缩成窄的组名入口。筛选、排序、调整列宽和单元格编辑仍由 Bases 原生处理。折叠状态按 Base 文件和视图保存，嵌入式 Bases 暂不改变。

### 字母顺序与手动顺序随时切换

- **字母顺序**：组和属性按 A–Z 排列；右键可以在各自层级置顶。
- **手动顺序**：拖动组，或在当前区域内拖动属性。

两种模式分别保存状态。来回切换不会丢掉置顶项或手动顺序。

### 修改属性，不删除笔记

右键属性可以全库重命名，或从所有命中笔记中删除该字段。重命名保留值和 frontmatter 中的位置；删除只移除 frontmatter 属性，不删除笔记文件。

在标签模式中，可以多选笔记后批量添加或移除多个 frontmatter 标签。确认框会说明范围，正文里的内联 `#标签` 不会被修改。

## 安装

### 插件市场

通过审核后，可在“设置 → 第三方插件 → 浏览”中搜索 **Facet Folders** 安装。

### 手动安装

从[最新 Release](https://github.com/Heptazero/obsidian-facet-folders/releases/latest)下载 `main.js`、`manifest.json`、`styles.css`，放入：

```text
<库>/.obsidian/plugins/grouped-property-explorer/
```

重新加载 Obsidian，启用 **Facet Folders**，再点击左侧的列表树图标，或运行“打开多维文件夹”命令。

## 快速开始

1. 从功能区打开 Facet Folders。
2. 在搜索框上方切换文件夹、属性或标签模式。
3. 在属性模式点 `+` 新建组；右键组名编辑或解散。
4. 右键真实文件夹，按一个属性或标签前缀建立虚拟分组。
5. 打开笔记或 Base 表格，查看同一组在原生界面中的折叠效果。

设置页只保留两个全局选项：界面语言和插件数据储存位置，两个输入框都使用支持模糊搜索的候选列表。分组、顺序、置顶和批量操作仍放在对应内容旁边。

## 数据与兼容性

- 所有索引和修改都在本地库中完成。
- 默认情况下，插件自己的视图状态保存在插件目录的 `data.json`。
- 也可以在设置中选择仓库内的文件夹；属性分组、顺序、置顶和其他视图状态会统一保存在该文件夹里的 `facet-folders-data.json`，不会移动笔记或 frontmatter。
- 没有 Facet Folders 置顶顺序时，可以一次性导入现有 Pinit 顺序。
- 可以复用兼容的 Foldable Frontmatter Groups 配置，并保存本地镜像。
- 原生 Bases 增强面向 Obsidian 1.12.7 及以上版本，不修改 `.base` 定义。

## 开发

TypeScript 源码位于 `src/`，构建结果为 `main.js`。

```bash
npm install
npm run typecheck
npm run build
```

问题和贡献请提交到 [GitHub 仓库](https://github.com/Heptazero/obsidian-facet-folders)。

## 致谢与许可

Facet Folders 的交互设计参考了 [Property Explorer](https://github.com/october-learns/obsidian-property-explorer)、[Foldable Frontmatter Groups](https://github.com/cwagner223355/obsidian-foldable-frontmatter-groups) 和 [Tag Tactician](https://github.com/scottTomaszewski/obsidian-tag-tactician)。源码独立维护，使用时不依赖这些插件。

Facet Folders 使用 GPL-3.0-only 许可。
