# Vendored typefaces

The page embeds these so it works with no network at all. Both are under the
**SIL Open Font License 1.1**, whose text is in `OFL.txt`; it permits bundling
and redistribution, including inside a document, and the fonts are not sold on
their own here.

| family | weights | upstream |
|---|---|---|
| Archivo | 400, 500, 600, 700 | https://github.com/Omnibus-Type/Archivo |
| IBM Plex Mono | 400, 500 | https://github.com/IBM/plex |

The `.woff2` files are the Latin and Latin-Extended subsets Google Fonts
serves; `fonts.json` records each face's weight, subset and unicode range.
Refresh them with `node tools/vendor-fonts.mjs`, then rebuild the page:
`node tools/build-page.mjs` inlines them as `data:` URIs.
