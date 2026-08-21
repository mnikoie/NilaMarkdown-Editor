/** ورودیِ ویرایشگر. */

export { schema, nodes, marks } from "./core/schema/index.js";
export { parse } from "./core/markdown/parse.js";
export { serialize } from "./core/markdown/serialize.js";

export { buildOutline, flattenOutline, nodeAt } from "./core/outline/build.js";
export { slugify, makeUnique } from "./core/outline/slug.js";
export type { OutlineNode, OutlineOptions } from "./core/outline/types.js";

export {
  livePreviewPlugin,
  livePreviewKey,
  activeBlocks,
} from "./core/plugins/live-preview.js";
export type { LivePreviewState, LivePreviewOptions } from "./core/plugins/live-preview.js";

export {
  tableEditingPlugin,
  tableResizingPlugin,
  insertTable,
  setColumnAlign,
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  goToNextCell,
  isInTable,
  moveRow,
  moveColumn,
  moveColumnVisual,
  currentTable,
} from "./core/commands/table.js";

export { getActiveLink, setLink, unsetLink, setReferenceLink } from "./core/commands/link.js";
export type { ActiveLink } from "./core/commands/link.js";
export {
  toggleTaskList,
  toggleTaskItemAt,
  setTaskStatus,
  isTaskList,
} from "./core/commands/task-list.js";
export {
  setParagraph,
  changeHeadingLevel,
  toggleBlockquote,
  toggleBulletList,
  toggleOrderedList,
  indentListItem,
  outdentListItem,
  insertParagraphBefore,
  insertParagraphAfter,
  insertMathBlock,
  insertHorizontalRule,
  insertTableOfContents,
  insertAlert,
  insertYamlFrontMatter,
  insertFootnote,
} from "./core/commands/paragraph.js";
export { autoIndentCode, codeContent } from "./core/commands/code.js";
export { clearFormatting, clearAllFormatting, insertImage } from "./core/commands/format.js";
export {
  selectedText,
  selectedMarkdown,
  duplicateSelectionOrBlock,
  deleteSelectionOrBlock,
} from "./core/commands/edit.js";

export {
  isSafeHref,
  isSafeImageSrc,
  safeHref,
  sanitizeHtml,
  escapeHtml,
  processHtml,
  linkAttributes,
} from "./core/security.js";
export type { HtmlMode } from "./core/security.js";

export {
  searchPlugin,
  searchKey,
  search,
  searchNext,
  searchPrev,
  clearSearch,
  replaceActive,
  replaceAll,
  getSearchState,
  findMatches,
  normalizeForSearch,
} from "./core/plugins/search.js";
export type { SearchState, SearchOptions, SearchMatch } from "./core/plugins/search.js";

export { SearchPanel } from "./react/SearchPanel/SearchPanel.js";
export type { SearchPanelProps } from "./react/SearchPanel/SearchPanel.js";

export {
  slashMenuPlugin,
  slashKey,
  getSlashState,
  filterItems,
  allSlashItems,
  runSlashItem,
  closeSlashMenu,
} from "./core/plugins/slash-menu.js";
export type { SlashState, SlashItem, SlashOptions } from "./core/plugins/slash-menu.js";

export { SlashMenu } from "./react/SlashMenu/SlashMenu.js";
export type { SlashMenuProps } from "./react/SlashMenu/SlashMenu.js";

export {
  writingModesPlugin,
  writingModesKey,
  toggleFocusMode,
  toggleTypewriterMode,
  getWritingModes,
} from "./core/plugins/writing-modes.js";
export type { WritingModesState, WritingModesOptions } from "./core/plugins/writing-modes.js";

export { inputRulesPlugin } from "./core/plugins/input-rules.js";
export { autoPairPlugin } from "./core/plugins/auto-pair.js";
export type { AutoPairOptions } from "./core/plugins/auto-pair.js";
export { taskListPlugin } from "./core/plugins/task-list.js";
export {
  listFoldPlugin,
  listFoldKey,
  foldAllListNodes,
  unfoldAllListNodes,
} from "./core/plugins/list-fold.js";
export type { ListFoldState } from "./core/plugins/list-fold.js";
export { keymapPlugin, insertZWNJ, toggleHeading } from "./core/plugins/keymap.js";
export type { KeymapOptions } from "./core/plugins/keymap.js";

export {
  foldPlugin,
  foldKey,
  toggleFold,
  foldAll,
  unfoldAll,
  isFolded,
} from "./core/plugins/fold.js";
export type { FoldState, FoldOptions } from "./core/plugins/fold.js";

export { BUILTIN_MARKS, RANK } from "./core/directives/builtin.js";
export type {
  MarkDefinition,
  MarkRegistry,
  DirectiveKind,
  AttrSpec,
  AttrType,
  MarkVariant,
} from "./core/directives/types.js";

export {
  MarkCardView,
  markCardViews,
  CodeBlockView,
  MathBlockView,
  MathInlineView,
  MermaidView,
  createNodeViews,
} from "./node-views/index.js";
export type { Features } from "./node-views/index.js";
export {
  highlight,
  resetHighlighter,
  highlighterStatus,
  highlighterWorkerType,
} from "./core/highlight/client.js";
export type { HighlightResult } from "./core/highlight/client.js";

export { exportHtml, exportStats } from "./core/export-html.js";
export type { ExportHtmlOptions } from "./core/export-html.js";

export { exportPdf, buildPrintHtml } from "./core/export-pdf.js";
export type { ExportPdfOptions, PrintResult } from "./core/export-pdf.js";

export { pasteImagePlugin, pasteImageKey, insertImageFiles } from "./core/plugins/paste-image.js";
export type { PasteImageOptions, PasteImageState } from "./core/plugins/paste-image.js";

export { useFullscreen } from "./react/useFullscreen.js";
export type { FullscreenHandle } from "./react/useFullscreen.js";

export { computeStats, countWords } from "./core/stats.js";
export type { Stats } from "./core/stats.js";

export { Toolbar } from "./react/Toolbar/Toolbar.js";
export type { ToolbarProps } from "./react/Toolbar/Toolbar.js";
export { LinkPopover } from "./react/LinkPopover/LinkPopover.js";
export type { LinkPopoverProps } from "./react/LinkPopover/LinkPopover.js";
export { TableTools } from "./react/TableTools/TableTools.js";
export type { TableToolsProps } from "./react/TableTools/TableTools.js";
export { ParagraphMenu } from "./react/ParagraphMenu/ParagraphMenu.js";
export type { ParagraphMenuProps } from "./react/ParagraphMenu/ParagraphMenu.js";
export { FormatMenu } from "./react/FormatMenu/FormatMenu.js";
export type { FormatMenuProps } from "./react/FormatMenu/FormatMenu.js";
export { ViewMenu } from "./react/ViewMenu/ViewMenu.js";
export type { ViewMenuProps } from "./react/ViewMenu/ViewMenu.js";
export { FileMenu } from "./react/FileMenu/FileMenu.js";
export type { FileMenuProps } from "./react/FileMenu/FileMenu.js";
export { EditMenu } from "./react/EditMenu/EditMenu.js";
export type { EditMenuProps } from "./react/EditMenu/EditMenu.js";
export { ImagePopover } from "./react/ImagePopover/ImagePopover.js";
export type { ImagePopoverProps } from "./react/ImagePopover/ImagePopover.js";
export { ReferenceLinkPopover } from "./react/ReferenceLinkPopover/ReferenceLinkPopover.js";
export type { ReferenceLinkPopoverProps } from "./react/ReferenceLinkPopover/ReferenceLinkPopover.js";
export { OutlineTree } from "./react/Outline/OutlineTree.js";
export type { OutlineTreeProps } from "./react/Outline/OutlineTree.js";

export { MarkdownEditor } from "./react/MarkdownEditor.js";
export type { MarkdownEditorProps } from "./react/MarkdownEditor.js";
export { useEditor } from "./react/useEditor.js";
export type { UseEditorOptions, EditorHandle } from "./react/useEditor.js";
