/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ACHIEVEMENT_TYPES } from '@/utility/achievements.js';

type AchievementType = (typeof ACHIEVEMENT_TYPES)[number];

export async function claimAchievement(type: AchievementType): Promise<void> {
	const { claimAchievement: claim } = await import('@/utility/achievements.js');
	return claim(type);
}
