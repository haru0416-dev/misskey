# 旧形式の migration の記録

drizzle-kit に移る前に使っていた、手書きの JavaScript 形式(`up(queryRunner)` と `down(queryRunner)`)の migration です。

実行には使いません。`src/migration-runner.ts` はこのディレクトリを読みません。これらが作った schema は、現在の [`0000_init.sql`](../0000_init.sql) に含まれています。過去にどんな DDL を当てていたかを調べるための記録として残しています。
