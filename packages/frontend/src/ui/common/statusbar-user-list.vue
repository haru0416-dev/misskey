<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<span v-if="!fetching" :class="$style.root">
	<template v-if="display === 'marquee'">
		<Transition
			:enterActiveClass="$style.transition_change_enterActive"
			:leaveActiveClass="$style.transition_change_leaveActive"
			:enterFromClass="$style.transition_change_enterFrom"
			:leaveToClass="$style.transition_change_leaveTo"
			mode="default"
		>
			<MkMarqueeText :key="key" :reverse="marqueeReverse" v-bind="marqueeDuration === undefined ? {} : { duration: marqueeDuration }">
				<span v-for="note in notes" :key="note.id" :class="$style.item">
					<img v-if="note.user.avatarUrl" :class="$style.avatar" :src="note.user.avatarUrl" decoding="async" alt=""/>
					<MkA :class="$style.text" :to="notePage(note)">
						<Mfm :text="getNoteSummary(note)" :plain="true" :nowrap="true"/>
					</MkA>
					<span :class="$style.divider"></span>
				</span>
			</MkMarqueeText>
		</Transition>
	</template>
	<template v-else-if="display === 'oneByOne'">
	</template>
</span>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { useInterval } from '@shared/utility/use-interval.js';
import MkMarqueeText from '@/components/display/MkMarqueeText.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { getNoteSummary } from '@/features/note/get-note-summary.js';
import { notePage } from '@/filters/note.js';

const props = defineProps<{
	userListId?: string;
	display?: 'marquee' | 'oneByOne';
	marqueeDuration?: number;
	marqueeReverse?: boolean;
	oneByOneInterval?: number;
	refreshIntervalSec: number;
}>();

const notes = ref<Misskey.entities.Note[]>([]);
const fetching = ref(true);
const key = ref(0);

// 新しい取得を開始した後は、それ以前の取得結果を表示に反映しない。
let tickGeneration = 0;

const tick = () => {
	if (props.userListId == null) {
		return;
	}
	const generation = ++tickGeneration;
	misskeyApi('notes/user-list-timeline', {
		listId: props.userListId,
	}).then(
		(res) => {
			if (generation !== tickGeneration) {
				return;
			}
			notes.value = res;
			fetching.value = false;
			key.value++;
		},
		() => {
			// 失敗したら表示中の内容を残し、読み込み中のままにしない。次の定期更新で取り直す。
			if (generation === tickGeneration) {
				fetching.value = false;
			}
		},
	);
};

watch(() => props.userListId, tick);

useInterval(tick, Math.max(5000, props.refreshIntervalSec * 1000), {
	immediate: true,
	afterMounted: true,
});
</script>

<style lang="scss" module>
.transition_change_enterActive,
.transition_change_leaveActive {
	position: absolute;
	top: 0;
  transition: all 1s ease;
}
.transition_change_enterFrom {
	opacity: 0;
	transform: translateY(-100%);
}
.transition_change_leaveTo {
	opacity: 0;
	transform: translateY(100%);
}

.root {
	display: inline-block;
	position: relative;
}

.item {
	display: inline-flex;
	align-items: center;
	vertical-align: bottom;
	margin: 0;
}

.avatar {
	display: inline-block;
	height: var(--height);
	aspect-ratio: 1;
	vertical-align: bottom;
	margin-right: 8px;
}

.text {
	display: inline-block;
	vertical-align: bottom;
}

.divider {
	display: inline-block;
	width: 0.5px;
	height: 16px;
	margin: 0 3em;
	background: currentColor;
	opacity: 0;
}
</style>
