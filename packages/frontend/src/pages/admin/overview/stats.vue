<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<Transition :name="prefer.animation ? '_transition_zoom' : ''" mode="out-in">
		<MkLoading v-if="fetching"/>
		<div v-else-if="stats != null" :class="$style.root">
			<div class="item _panel users">
				<div class="icon"><i class="ti ti-users"></i></div>
				<div class="body">
					<div class="value">
						<MkNumber :value="stats.originalUsersCount" style="margin-right: 0.5em;"/>
						<MkNumberDiff v-if="usersComparedToThePrevDay != null" v-tooltip="i18n.ts.dayOverDayChanges" class="diff" :value="usersComparedToThePrevDay"></MkNumberDiff>
					</div>
					<div class="label">{{ i18n.ts.users }}</div>
				</div>
			</div>
			<div class="item _panel notes">
				<div class="icon"><i class="ti ti-pencil"></i></div>
				<div class="body">
					<div class="value">
						<MkNumber :value="stats.originalNotesCount" style="margin-right: 0.5em;"/>
						<MkNumberDiff v-if="notesComparedToThePrevDay != null" v-tooltip="i18n.ts.dayOverDayChanges" class="diff" :value="notesComparedToThePrevDay"></MkNumberDiff>
					</div>
					<div class="label">{{ i18n.ts.notes }}</div>
				</div>
			</div>
			<div class="item _panel instances">
				<div class="icon"><i class="ti ti-planet"></i></div>
				<div class="body">
					<div class="value">
						<MkNumber :value="stats.instances" style="margin-right: 0.5em;"/>
					</div>
					<div class="label">{{ i18n.ts.instances }}</div>
				</div>
			</div>
			<div class="item _panel emojis">
				<div class="icon"><i class="ti ti-icons"></i></div>
				<div class="body">
					<div class="value">
						<MkNumber :value="customEmojis.length" style="margin-right: 0.5em;"/>
					</div>
					<div class="label">{{ i18n.ts.customEmojis }}</div>
				</div>
			</div>
			<div class="item _panel online">
				<div class="icon"><i class="ti ti-access-point"></i></div>
				<div class="body">
					<div class="value">
						<MkNumber :value="onlineUsersCount" style="margin-right: 0.5em;"/>
					</div>
					<div class="label">{{ i18n.ts.online }}</div>
				</div>
			</div>
		</div>
		<MkError v-else/>
	</Transition>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { misskeyApi, misskeyApiGet } from '@/utility/misskey-api.js';
import MkNumberDiff from '@/components/display/MkNumberDiff.vue';
import MkNumber from '@/components/display/MkNumber.vue';
import { i18n } from '@/i18n.js';
import { customEmojis } from '@/features/custom-emojis/custom-emojis.js';
import { prefer } from '@/preferences.js';

const stats = ref<Misskey.entities.StatsResponse | null>(null);
const usersComparedToThePrevDay = ref<number | null>(null);
const notesComparedToThePrevDay = ref<number | null>(null);
const onlineUsersCount = ref(0);
const fetching = ref(true);

onMounted(async () => {
	const [_stats, _onlineUsersCount] = await Promise.all([
		misskeyApi('stats', {}),
		misskeyApiGet('get-online-users-count').then(res => res.count),
	]);
	stats.value = _stats;
	onlineUsersCount.value = _onlineUsersCount;

	misskeyApiGet('charts/users', { limit: 2, span: 'day' }).then(chart => {
		const previous = chart.local.total[1];
		usersComparedToThePrevDay.value = previous == null ? null : _stats.originalUsersCount - previous;
	});

	misskeyApiGet('charts/notes', { limit: 2, span: 'day' }).then(chart => {
		const previous = chart.local.total[1];
		notesComparedToThePrevDay.value = previous == null ? null : _stats.originalNotesCount - previous;
	});

	fetching.value = false;
});
</script>

<style lang="scss" module>
.root {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
	gap: 12px;

	&:global {
		> .item {
			display: flex;
			align-items: center;
			box-sizing: border-box;
			min-height: 76px;
			padding: 14px;

			> .icon {
				display: grid;
				place-items: center;
				flex: 0 0 44px;
				height: 44px;
				margin-right: 14px;
				background: var(--MI_THEME-accentedBg);
				color: var(--MI_THEME-accent);
				border-radius: 10px;
			}

			&.users {
				> .icon {
					background: #0088d726;
					color: #3d96c1;
				}
			}

			&.instances {
				> .icon {
					background: #e96b0026;
					color: #d76d00;
				}
			}

			&.emojis {
				> .icon {
					background: #d5ba0026;
						color: #dfc300;
				}
			}

			&.online {
				> .icon {
					background: #8a00d126;
					color: #c01ac3;
				}
			}

			> .body {
				padding: 2px 0;

				> .value {
					font-size: 1.35em;
					font-weight: 700;
					font-variant-numeric: tabular-nums;
					line-height: 1.15;

					> .diff {
						font-size: 0.65em;
						font-weight: normal;
					}
				}

				> .label {
					margin-top: 4px;
					font-size: 0.78em;
					line-height: 1.2;
					opacity: 0.72;
				}
			}
		}
	}
}

@media (max-width: 500px) {
	.root {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}

	.root:global > .item {
		min-height: 68px;
		padding: 10px;
	}

	.root:global > .item > .icon {
		flex-basis: 40px;
		height: 40px;
		margin-right: 10px;
	}

	.root:global > .item > .body {
		min-width: 0;
	}

	.root:global > .item > .body > .value {
		font-size: 1.2em;
	}

	.root:global > .item > .body > .label {
		font-size: 0.72em;
	}
}
</style>
