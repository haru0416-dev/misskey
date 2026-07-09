# 旧migration形式のアーカイブ

このディレクトリのファイルは、drizzle-kit移行(migration/0000_baseline.sql以降)前に使われていた手書きJS形式(`up(queryRunner)`/`down(queryRunner)`)のmigrationです。

**実行系からは完全に外れています** — `migration-runner.ts`はこのディレクトリを読みません。これらが作ったスキーマの内容は `migration/0000_baseline.sql` と `migration/0001_chart_tables_and_manual_ddl.sql` に統合済みです。過去にどんなDDLを当てたかの歴史的参照としてのみ保持しています。
