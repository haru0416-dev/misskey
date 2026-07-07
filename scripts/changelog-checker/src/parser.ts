/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';

export class Release {
	public readonly releaseName: string;
	public readonly categories: ReleaseCategory[];

	constructor(releaseName: string, categories: ReleaseCategory[] = []) {
		this.releaseName = releaseName;
		this.categories = [...categories];
	}
}

export class ReleaseCategory {
	public readonly categoryName: string;
	public readonly items: string[];

	constructor(categoryName: string, items: string[] = []) {
		this.categoryName = categoryName;
		this.items = [...items];
	}
}

const codeFenceRegexp = /^(```|~~~)/;
const releaseHeadingRegexp = /^##\s+(.+?)\s*$/;
const categoryHeadingRegexp = /^###\s+(.+?)\s*$/;
// CommonMark と同じく bullet の直後は ASCII 空白/タブのみ区切りとして扱う (全角スペース等は不可)。
// 中身が空の bullet (`-` のみの行) も 1 項目として数える
const listItemRegexp = /^[-*+](?:[ \t]+(.*?))?[ \t]*$/;

/**
 * CHANGELOG.md を「## リリース → ### カテゴリ → トップレベルの箇条書き」の構造として
 * 行ベースでパースする。checker はリリース名・カテゴリ名・項目数しか見ないため、
 * 項目テキストは生の Markdown のまま保持する (インデントされたネスト項目は数えない)。
 */
export function parseChangeLog(path: string): Release[] {
	const input = fs.readFileSync(path, { encoding: 'utf8' });

	const releases: Release[] = [];
	let release: Release | null = null;
	let category: ReleaseCategory | null = null;
	let inCodeFence = false;

	for (const line of input.split('\n')) {
		if (codeFenceRegexp.test(line)) {
			inCodeFence = !inCodeFence;
			continue;
		}
		if (inCodeFence) continue;

		const categoryHeading = line.match(categoryHeadingRegexp);
		if (categoryHeading) {
			if (release) {
				category = new ReleaseCategory(categoryHeading[1]);
				release.categories.push(category);
			}
			continue;
		}

		const releaseHeading = line.match(releaseHeadingRegexp);
		if (releaseHeading) {
			release = new Release(releaseHeading[1]);
			releases.push(release);
			category = null;
			continue;
		}

		const listItem = line.match(listItemRegexp);
		if (listItem && category) {
			category.items.push(listItem[1] ?? '');
		}
	}

	return releases;
}
