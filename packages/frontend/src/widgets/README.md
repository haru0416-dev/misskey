# Widgets

`Widget*.vue` は個別widget実装、`components/` はwidgetの配置・設定・共通表示を所有する。

- `components/MkWidgets.vue`: widget listの並べ替えと描画
- `components/MkWidgetSettingsDialog.vue`: widget設定dialog
- `components/MkTagCloud.vue`: instance cloud widget用visualization
- `widget.ts`: widget type登録と共通context

widget固有ロジックは他のfeatureへ流出させず、featureの公開component・処理を利用して組み立てる。
