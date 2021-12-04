# Markdown Advanced Tables

This project is based on [@tgrosinger/md-advanced-tables](https://github.com/tgrosinger/md-advanced-tables).

## Usage

Install: `npm i @aidenlx/md-advanced-tables`

Implement an [interface to the text
editor](./src/text-editor.ts).

```javascript
interface ITextEditor {
  getCursorPosition(): Point;
  setCursorPosition(pos: Point): void;
  setSelectionRange(range: Range): void;
  getLastRow(): number;
  acceptsTableEdit(row: number): boolean;
  getLine(row: number): string;
  insertLine(row: number, line: string): void;
  deleteLine(row: number): void;
  replaceLines(startRow: number, endRow: number, lines: Array<string>): void;
  transact(func: Function): void;
}
```

And then you can execute
[commands](./src/table-editor.ts)
through a `TableEditor` object.

```javascript
import { TableEditor, options } from "@aidenlx/md-advanced-tables";
const textEditor = ...; // interface to the text editor
const tableEditor = new TableEditor(textEditor);
tableEditor.formatAll(options({}));
```

Look at [advanced-tables-obsidian](https://github.com/tgrosinger/advanced-tables-obsidian) as a reference implementation for more information.
