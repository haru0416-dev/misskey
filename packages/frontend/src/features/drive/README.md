# Drive

Drive のファイル選択、アップロード、管理 UI をまとめた feature。

- `components/`: Drive browser、file/folder picker、upload UI、管理用file list
- `drive.ts`: file/folder選択dialogとuploadの公開処理
- `file-drop.ts`: drag and dropされたfile/directoryの正規化
- `get-drive-file-menu.ts`: Drive file用context menu
- `useUploader.ts`: upload queueと進捗管理

画像編集が必要な場合は `image-editor/` のdialogを動的に読み込む。画像編集側からDriveを使う場合も公開処理を参照し、互いの内部componentへ依存しない。
