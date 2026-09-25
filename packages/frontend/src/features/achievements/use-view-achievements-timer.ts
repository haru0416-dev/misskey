/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { onActivated, onDeactivated, onMounted, onUnmounted } from 'vue';
import { claimAchievement } from '@/features/achievements/claim-achievement.js';

// 実績一覧を表示し続けて3分経ったら viewAchievements3min を付与する。
// KeepAlive で非表示になった間は数えず、再表示で最初から数え直す。
export function useViewAchievementsTimer(shouldClaim: () => boolean = () => true) {
	let timer: number | null = null;

	function start() {
		if (timer == null) {
			timer = window.setTimeout(
				() => {
					if (shouldClaim()) {
						claimAchievement('viewAchievements3min');
					}
				},
				1000 * 60 * 3,
			);
		}
	}

	function stop() {
		if (timer != null) {
			window.clearTimeout(timer);
			timer = null;
		}
	}

	onMounted(start);
	onUnmounted(stop);
	onActivated(start);
	onDeactivated(stop);
}
