/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { achievementTypes } from 'misskey-js';

type AchievementType = (typeof achievementTypes)[number];

export async function claimAchievement(type: AchievementType): Promise<void> {
	const { claimAchievement: claim } = await import('@/features/achievements/achievements.js');
	return claim(type);
}
