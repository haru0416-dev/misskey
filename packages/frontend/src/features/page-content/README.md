# Page content

Misskey Pagesのblock renderer、preview card、popup windowをまとめたfeature。

- `components/page.vue`: page content root renderer
- `components/page.*.vue`: text、section、image、note、dynamic block
- `components/MkPagePreview.vue`: page概要card
- `components/MkPageWindow.vue`: popup window表示

Pageの編集stateとrouteは `pages/page-editor/`、`pages/page.vue` が所有する。
