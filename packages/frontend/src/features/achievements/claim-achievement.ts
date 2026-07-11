/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ACHIEVEMENT_TYPES } from '@/features/achievements/achievements.js';

type AchievementType = (typeof ACHIEVEMENT_TYPES)[number];

export async function claimAchievement(type: AchievementType): Promise<void> {
	const { claimAchievement: claim } = await import('@/features/achievements/achievements.js');
	return claim(type);
}
