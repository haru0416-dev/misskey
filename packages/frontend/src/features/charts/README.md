# Charts

統計値、時系列、retention、heatmapの可視化をまとめたfeature。

- `components/MkChart.vue`: API chart endpointを読む時系列chart
- `components/MkDataChart.vue`: 呼び出し側が渡すseriesの描画
- `components/MkChartTooltip.vue`: chart共通tooltip
- `components/MkMiniChart.vue`: card・widget向けsparkline
- `components/MkHeatmap.vue`: activity heatmap
- `components/MkRetentionHeatmap.vue`, `components/MkRetentionLineChart.vue`: retention表示
- `chart-helpers.ts`: Chart.js datasetとaxisの共通構築
- `chart-i18n.ts`: chart period・series labelの翻訳

データ取得条件は各pageが所有し、このfeatureはchart用データへの変換と描画を担当する。
