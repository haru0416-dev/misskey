import { defineConfig, mergeConfig } from 'vitest/config';
import { BaseSequencer, type TestSpecification } from 'vitest/node';
import { baseConfig } from './vitest.config.js';

// vitest の既定はdurationキャッシュ順でファイル実行順が毎回変わる。共有DBを使うe2eは
// 順序依存の失敗が「run毎に別の場所」に出て追えなくなるため、常にパス順で固定する。
// bun ランタイムでは多数のファイル引数を渡すと vitest が起動後にハングするため、
// include glob と sequencer を使う。
class AlphabeticalSequencer extends BaseSequencer {
	override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
		return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
	}
}

export default mergeConfig(
	baseConfig,
	defineConfig({
		test: {
			fileParallelism: false,
			include: ['./test/e2e/**/*.ts'],
			globalSetup: './test/target.ts',
			setupFiles: ['./test/setup.e2e.ts'],
			sequence: {
				sequencer: AlphabeticalSequencer,
			},
		},
	}),
);
