import {
  FolderOpen20Regular, Save20Regular, WeatherMoon20Regular, WeatherSunny20Regular, MoreHorizontal20Regular,
  Search20Regular, Add20Regular, Dismiss20Regular, Checkmark20Regular, DocumentAdd20Regular, TextBold20Regular,
  TextItalic20Regular, Link20Regular, Subtract20Regular, SquareMultiple20Regular, Square20Regular,
  FullScreenMaximize20Regular, FullScreenMinimize20Regular, CenterVertical20Regular, TextFont20Regular,
  Keyboard20Regular, Settings20Regular, Info20Regular, Warning20Regular, ErrorCircle20Regular, ArrowSync20Regular,
  Delete20Regular, Rename20Regular, Copy20Regular, Folder20Regular, Document20Regular, ChevronRight20Regular,
  ChevronDown20Regular, ArrowUndo20Regular, ArrowRedo20Regular, Table20Regular, TextQuote20Regular, Code20Regular,
  TextBulletList20Regular, TextNumberListLtr20Regular, TextHeader120Regular, TextHeader220Regular,
  TextHeader320Regular, Color20Regular, Share20Regular, History20Regular, TextCaseTitle20Regular, TextWholeWord20Regular,
  BracesVariable20Regular, ArrowUp20Regular, ArrowDown20Regular, LockClosed20Regular, ArrowExportLtr20Regular,
  ArrowImport20Regular, TextStrikethrough20Regular, type FluentIcon,
} from "@fluentui/react-icons";
import type { IconName } from "./icon-names.ts";

export const ICONS: Record<IconName, FluentIcon> = {
  open: FolderOpen20Regular, save: Save20Regular, darkTheme: WeatherMoon20Regular, lightTheme: WeatherSunny20Regular,
  more: MoreHorizontal20Regular, search: Search20Regular, add: Add20Regular, dismiss: Dismiss20Regular,
  check: Checkmark20Regular, newNote: DocumentAdd20Regular, bold: TextBold20Regular, italic: TextItalic20Regular,
  link: Link20Regular, minimize: Subtract20Regular, restore: SquareMultiple20Regular, maximize: Square20Regular,
  fullScreen: FullScreenMaximize20Regular, exitFullScreen: FullScreenMinimize20Regular, focus: CenterVertical20Regular,
  font: TextFont20Regular, keyboard: Keyboard20Regular, settings: Settings20Regular, info: Info20Regular,
  warning: Warning20Regular, error: ErrorCircle20Regular, sync: ArrowSync20Regular, delete: Delete20Regular,
  rename: Rename20Regular, copy: Copy20Regular, folder: Folder20Regular, document: Document20Regular,
  chevronRight: ChevronRight20Regular, chevronDown: ChevronDown20Regular, undo: ArrowUndo20Regular,
  redo: ArrowRedo20Regular, table: Table20Regular, quote: TextQuote20Regular, code: Code20Regular,
  bulletList: TextBulletList20Regular, numberedList: TextNumberListLtr20Regular, heading1: TextHeader120Regular,
  heading2: TextHeader220Regular, heading3: TextHeader320Regular, color: Color20Regular, share: Share20Regular,
  history: History20Regular, matchCase: TextCaseTitle20Regular, wholeWord: TextWholeWord20Regular, regex: BracesVariable20Regular,
  arrowUp: ArrowUp20Regular, arrowDown: ArrowDown20Regular, lock: LockClosed20Regular, export: ArrowExportLtr20Regular,
  import: ArrowImport20Regular, strikethrough: TextStrikethrough20Regular,
};
