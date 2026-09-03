# Vendored libraries

| file | what | version | licence |
|---|---|---|---|
| `xlsx.full.min.js` | SheetJS Community Edition — reads and writes `.xlsx` in Node and in the browser | 0.20.3 (from cdn.sheetjs.com) | Apache-2.0 |

SheetJS is vendored so the sketchpad page and the Node tools work offline.
It is loaded only where a workbook is read or written (`tools/lib/xlsx.mjs`
and the sketchpad's import button); the drawing engine has no dependencies.
