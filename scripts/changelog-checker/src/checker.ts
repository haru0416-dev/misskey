/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Release } from './parser.js';

export class Result {
	public readonly success: boolean;
	public readonly message?: string;

	private constructor(success: boolean, message?: string) {
		this.success = success;
		this.message = message;
	}

	static ofSuccess(): Result {
		return new Result(true);
	}

	static ofFailed(message?: string): Result {
		return new Result(false, message);
	}
}

/**
 * develop -> master または release -> master の差分で、base の最新リリースと
 * head の追加分直前のリリースが一致することを確認する。
 */
export function checkNewRelease(base: Release[], head: Release[]): Result {
	const releaseCountDiff = head.length - base.length;
	if (releaseCountDiff <= 0) {
		return Result.ofFailed('Invalid release count.');
	}

	const baseLatest = base[0];
	const headPrevious = head[releaseCountDiff];

	if (baseLatest.releaseName !== headPrevious.releaseName) {
		return Result.ofFailed('Contains unexpected releases.');
	}

	return Result.ofSuccess();
}

/**
 * topic -> develop または topic -> master の差分で、最新リリース配下のカテゴリ数・項目数の変更だけを許可する。
 */
export function checkNewTopic(base: Release[], head: Release[]): Result {
	if (head.length !== base.length) {
		return Result.ofFailed('Invalid release count.');
	}

	const headLatest = head[0];
	for (let relIdx = 0; relIdx < base.length; relIdx++) {
		const baseItem = base[relIdx];
		const headItem = head[relIdx];
		if (baseItem.releaseName !== headItem.releaseName) {
			return Result.ofFailed(`Release is different. base:${baseItem.releaseName}, head:${headItem.releaseName}`);
		}

		if (baseItem.categories.length !== headItem.categories.length) {
			if (headLatest.releaseName !== headItem.releaseName) {
				return Result.ofFailed(
					`There is an error in the update history. expected additions:${headLatest.releaseName}, actual additions:${headItem.releaseName}`,
				);
			}
		} else {
			for (let catIdx = 0; catIdx < baseItem.categories.length; catIdx++) {
				const baseCategory = baseItem.categories[catIdx];
				const headCategory = headItem.categories[catIdx];

				if (baseCategory.categoryName !== headCategory.categoryName) {
					return Result.ofFailed(
						`Category is different. base:${baseCategory.categoryName}, head:${headCategory.categoryName}`,
					);
				}

				if (baseCategory.items.length !== headCategory.items.length) {
					if (headLatest.releaseName !== headItem.releaseName) {
						return Result.ofFailed(
							`There is an error in the update history. expected additions:${headLatest.releaseName}, actual additions:${headItem.releaseName}`,
						);
					}
				}
			}
		}
	}

	return Result.ofSuccess();
}
