/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: MIT
 */

// napi-rs が生成する 13 プラットフォーム対応のローダーは、公開パッケージから
// プラットフォーム別パッケージを探すためのもの。ここではリポジトリ内でビルドするので、
// 隣に置かれた成果物だけを読む。
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

function platformSuffix() {
	const { platform, arch } = process;
	if (platform === 'linux') {
		// musl 版は glibc 版と ABI が違うので取り違えると起動時に落ちる。
		let isMusl = false;
		try {
			isMusl = readFileSync('/usr/bin/ldd', 'utf8').includes('musl');
		} catch {
			isMusl = true;
		}
		return `linux-${arch}-${isMusl ? 'musl' : 'gnu'}`;
	}
	if (platform === 'darwin') return `darwin-${arch}`;
	if (platform === 'win32') return `win32-${arch}-msvc`;
	throw new Error(`slacc: unsupported platform ${platform}-${arch}`);
}

const suffix = platformSuffix();
const found = [join(__dirname, `index.${suffix}.node`), join(__dirname, `slacc.${suffix}.node`)].find((path) =>
	existsSync(path),
);

if (found == null) {
	throw new Error(`slacc: native binding not found for ${suffix}. Run \`bun run --filter slacc build\`.`);
}

module.exports = require(found);
