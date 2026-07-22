# #05 ドライブ容量チェックの TOCTOU で並行アップロードが容量を超過できる

- **対象**: `misskey-dev/misskey` develop (`2026.7.0-beta.2`)、2026-07-22 実ソースで再現
- **種別**: 気づかれていないバグ（並行性 / リソースクォータ回避）
- **意図判定**: **未報告バグ**。issue/PR/GHSA/TODO いずれも無し。使用量読取→上限判定→insert を
  直列化していない典型的な check-then-act。
- **提出先**: 公開 issue + PR（直列化が必要なので修正は提案）

## Summary

同一ユーザーの複数アップロードがほぼ同時に来ると、全員が「自分より前の使用量」を読んで容量
チェックを通過し、合算で `driveCapacity`（ロールポリシーのドライブ容量上限）を超えられる。
件数上限の TOCTOU と違い、**ストレージ（ディスク / オブジェクトストレージ）の実消費が
クォータを超える**ぶん stakes が高い。超過幅は概ね `(並行数 - 1) × ファイルサイズ`。

## Root cause

`packages/backend/src/core/DriveService.ts` の `addFile()`:

```ts
const usage = await this.driveFileEntityService.calcDriveUsageOf(user); // SUM(size) WHERE userId AND isLink=false
// ...
if (driveCapacity < usage + info.size) {          // 判定
	if (isLocalUser) {
		throw new IdentifiableError('c6244ed2-...', 'No free space.');
	}
	await this.expireOldFile(...);
}
// ... 以降でロック無しに driveFile を insert
```

`calcDriveUsageOf`（`DriveFileEntityService`）は
`SUM(file.size) WHERE file.userId = :id AND file.isLink = FALSE`。この読取と最終 insert の間に
ロック・トランザクション境界が無いため、並行リクエストが同じ `usage` を読んで全員通過する。

## Reproduction

`repros/drive-capacity-toctou.repro.ts`（`MiDriveFile` + `calcDriveUsageOf` 相当を実ソースで再現）。
`driveCapacity=100`、1 ファイル `size=60` として、並行アップロード 2 本が「両方とも usage=0 を
観測」してから各自チェック+insert する並行スケジュールを再現。

**現行 develop の結果（実測）**: `final usage = 120`（`driveCapacity=100` を超過）→ テスト失敗。

## Expected vs Actual

- Expected: 並行アップロードでも合計使用量が `driveCapacity` を超えない
- Actual: `usage = 120 > 100`（容量超過）

## Proposed fix（直列化が必要なので提案）

同一ユーザーの「使用量チェック + insert」を直列化する。選択肢:

- **PostgreSQL advisory lock**: insert を含むトランザクション内で
  `SELECT pg_advisory_xact_lock(hashtext('drive-capacity'), hashtext(userId))` を取り、
  その後で `calcDriveUsageOf` → 判定 → insert（物理アップロードはロック外に保ち、DB 反映直前だけ
  ロックする形が望ましい。ロック取得後に権威的な再チェックを行う）。
- あるいは serializable 分離レベルのトランザクション + 競合時リトライ。

物理ストレージへの upload と DB insert が絡むため、ロック範囲の設計（upload をロック外に保つ /
超過検知時のストレージ掃除）に注意。件数上限系（antenna/clip/pin/userList 等）も同型の
check-then-act だが、そちらは stakes が低い。

（repro はレース自体の存在確認まで。ロックを含む修正は upstream 側の設計判断が要るため patch は
同梱していない。）
