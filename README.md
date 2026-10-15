# Facet Folders

[简体中文](./README.zh-CN.md)

Facet Folders is a local-first **Obsidian metadata explorer and virtual-folder plugin**. It lets you browse the same vault by physical folder, frontmatter property and value, or hierarchical tag, then reuses one property-group definition in the sidebar, the native Properties panel, and native Bases table columns.

Nothing is moved into a proprietary database. Notes, frontmatter, physical folders, tags, and `.base` files remain the source of truth.

## Is Facet Folders the plugin you need?

| If you ask… | Facet Folders can… | Important boundary |
| --- | --- | --- |
| “Can Obsidian group notes by `status`, `type`, or another property without moving files?” | Show `property → value → note` and create saved virtual subfolders such as `active` and `done`. | Virtual folders do not create directories or move notes. |
| “Can I browse properties and tags like the File Explorer?” | Switch one compact sidebar between physical folders, property facets, and a hierarchical tag tree. | The three modes are views of the same vault, not separate databases. |
| “Can I group and collapse fields in the native note Properties panel?” | Apply named property groups to the Properties area of open notes. | Groups change presentation, not frontmatter field order. |
| “Can I collapse related columns in an Obsidian Bases table?” | Add collapsible group headers above native Bases columns and remember fold state per Base view. | Embedded Bases are left unchanged; `.base` files are never rewritten. |
| “Can I organize Obsidian properties with wildcards or regex?” | Build groups from selected fields, prefixes such as `pa_*`, or regular expressions. | A property is presented in one matching group. |
| “Can I batch edit frontmatter without deleting notes?” | Rename or remove a property, replace one property value across matching notes, and add or remove frontmatter tags. | Property removal deletes only that field; inline body tags are not edited. |
| “Can I sort properties manually but keep an A–Z option?” | Switch between independent alphabetical/pinned order and manual drag order. | Each mode keeps its own saved state. |

The core use case is **metadata that behaves like folders without becoming folders**. Ordering, pinning, and batch editing support that model, but they are not the plugin's primary identity.

## Why choose Facet Folders

Facet Folders is not another isolated property browser or tag manager. Its main difference is **one grouping model across navigation and native Obsidian surfaces**.

| Tool | Its focus | What Facet Folders adds or does differently |
| --- | --- | --- |
| Obsidian File Explorer | The physical folder tree | Adds saved virtual subfolders generated from a property value or tag prefix, without creating folders or moving files. |
| [Property Explorer](https://github.com/october-learns/obsidian-property-explorer) | Browse `property → value → note` | Adds named property groups, pinned/manual ordering, folder and tag modes, batch edits, and the same grouping inside native Properties and Bases. Property Explorer remains stronger if you only want a dedicated property browser with its own sorting options. |
| [Foldable Frontmatter Groups](https://github.com/cwagner223355/obsidian-foldable-frontmatter-groups) | Keep frontmatter fields grouped and ordered through rules and templates | Facet Folders focuses on navigation and runtime presentation. It can read compatible FFG groups, but it does not auto-reconcile or rewrite frontmatter order. FFG remains the better choice for frontmatter lifecycle and template enforcement. |
| [Tag Tactician](https://github.com/scottTomaszewski/obsidian-tag-tactician) | Batch-edit tags and find related notes | Adds a folder-like tag hierarchy beside folder/property modes. It intentionally omits related-note scoring; Tag Tactician remains useful for that workflow. |

These plugins are references and possible companions, not dependencies. Facet Folders is an independent implementation.

## What it does

### Browse one vault in three modes

Use the compact `文件夹 / 属性 / 标签` switch above the search bar.

- **Folders:** mirrors the physical tree, shows recursive Markdown-note counts, opens native file menus, and supports pinned files.
- **Properties:** shows `group → property → value → note`, with search and live vault updates.
- **Tags:** shows inline and frontmatter tags as a hierarchy of child tags and notes.

The last mode and expansion state are restored when Obsidian reopens.

### Turn metadata into virtual folders

Right-click a physical folder and choose a property or tag-prefix grouping. A folder containing notes with `status: active` and `status: done`, for example, gains virtual `active` and `done` children.

For hierarchical tags, selecting `熟悉度` can produce virtual folders such as `高` and `低` from `#熟悉度/高` and `#熟悉度/低`.

The generated folders are presentation only. They persist in Facet Folders, but never create directories, move notes, or rewrite `.base` files.

### Reuse property groups everywhere

Create, edit, and dissolve groups directly in the sidebar. A group can contain selected properties, wildcard prefixes such as `pa_*`, or regular expressions.

The same groups appear as collapsible sections in:

- the sidebar property tree;
- the native Properties area of open notes;
- native Bases table headers.

In Bases, folding compresses a group into a narrow header handle. Filtering, sorting, resizing, and inline editing remain native Bases behavior. Fold state is saved per Base file and view; embedded Bases are left unchanged.

### Choose alphabetical or manual order

- **Alphabetical:** groups and properties sort A–Z; right-click either row to pin it within its level.
- **Manual:** drag groups among groups and properties within their current section.

The two modes keep independent state, so switching does not discard pins or manual order.

### Batch-edit properties and tags without deleting notes

Right-click a property to rename it across the vault or remove that field from every matching note. Values and frontmatter key position are preserved on rename. Removing a property deletes only that frontmatter field, never the note file.

Right-click a property value to replace that value across all matching notes. For a multi-value property, only the selected item is replaced and the other values remain. Numbers, booleans, and JSON objects retain their original type when the replacement is valid.

In tag mode, multi-select notes and add or remove several frontmatter tags in one confirmed operation. Inline `#tags` in note bodies are not edited.

## Install

### Community plugins

Install **Facet Folders** from *Settings → Community plugins → Browse* after it is accepted into the Obsidian community directory.

### Manual installation

Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/Heptazero/obsidian-facet-folders/releases/latest), then place them in:

```text
<vault>/.obsidian/plugins/grouped-property-explorer/
```

Reload Obsidian, enable **Facet Folders**, and use the list-tree ribbon icon or the **Open Facet Folders** command.

## Quick start

1. Open Facet Folders from the ribbon.
2. Switch between folder, property, and tag mode above the search box.
3. In property mode, use `+` to create a group; right-click a group to edit or dissolve it.
4. Right-click a physical folder to create a virtual grouping from one property or tag prefix.
5. Open a note or Base table to see the same property groups in the native interface.
6. Right-click a property or one of its values for vault-wide frontmatter actions.

The settings page contains only two global choices: interface language and plugin-data location. Both fields use fuzzy-searchable suggestion lists. Grouping, ordering, pins, and batch actions stay beside the content they affect.

## Data and compatibility

- All indexing and edits happen locally in the vault.
- By default, plugin-only view state is stored in the plugin's local `data.json`.
- You can select a vault folder in settings; Facet Folders then stores its groups, ordering, pins, and view state in `facet-folders-data.json` inside that folder. It never moves notes or frontmatter.
- Existing Pinit order can be imported once when no Facet Folders pin order exists.
- Compatible Foldable Frontmatter Groups settings can be reused and mirrored locally.
- Native Bases enhancement targets Obsidian 1.12.7 and later and does not modify `.base` definitions.

## Development

The source is TypeScript in `src/` and bundles to `main.js`.

```bash
npm install
npm run typecheck
npm run build
```

Issues and contributions are welcome in the [GitHub repository](https://github.com/Heptazero/obsidian-facet-folders).

## Credits and license

Facet Folders was informed by the interaction patterns of [Property Explorer](https://github.com/october-learns/obsidian-property-explorer), [Foldable Frontmatter Groups](https://github.com/cwagner223355/obsidian-foldable-frontmatter-groups), and [Tag Tactician](https://github.com/scottTomaszewski/obsidian-tag-tactician). Its implementation is maintained separately and does not require those plugins.

Facet Folders is licensed under GPL-3.0-only.
