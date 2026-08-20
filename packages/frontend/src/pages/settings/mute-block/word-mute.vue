<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<div>
		<MkTextarea v-model="mutedWords">
			<span>{{ i18n.ts._wordMute.muteWords }}</span>
			<template #caption>{{ i18n.ts._wordMute.muteWordsDescription }}<br>{{ i18n.ts._wordMute.muteWordsDescription2 }}</template>
		</MkTextarea>
	</div>
	<MkButton primary inline :disabled="!changed" @click="save()"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
</div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import MkTextarea from '@/components/form/MkTextarea.vue';
import MkButton from '@/components/form/MkButton.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	muted: (string[] | string)[];
}>();

const emit = defineEmits<{
	(ev: 'save', value: (string[] | string)[]): void;
}>();

const render = (mutedWords: (string | string[])[]) => mutedWords.map(x => {
	if (Array.isArray(x)) {
		return x.join(' ');
	} else {
		return x;
	}
}).join('\n');

const mutedWords = ref(render(props.muted));
const changed = ref(false);

watch(mutedWords, () => {
	changed.value = true;
});

async function save() {
	const parseMutes = (mutes: string) => {
		let lines = mutes.trim().split('\n').map(line => line.trim()).filter(line => line !== '') as (string | string[])[];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i] as string;
			const regexp = line.match(/^\/(.+)\/(.*)$/);
			if (regexp) {
				try {
					// 正規表現として妥当かどうかだけを見る (不正なら throw する)
					// 正規表現の行は空白で分割しない。
					void new RegExp(regexp[1] ?? '', regexp[2] ?? '');
				} catch (err) {
					// 構文が不正な場合は保存せず、変更状態も維持する。
					os.alert({
						type: 'error',
						title: i18n.ts.regexpError,
						text: i18n.tsx.regexpErrorDescription({ tab: 'word mute', line: i + 1 }) + '\n' + String(err),
					});
					// 不正な設定を保存しないため、エラーを再送出する。
					throw err;
				}
			} else {
				lines[i] = line.split(' ');
			}
		}

		return lines;
	};

	let parsed;
	try {
		parsed = parseMutes(mutedWords.value);
	} catch (err) {
		// parseMutes 側でエラーを表示済みのため、ここでは保存だけを中止する。
		return;
	}

	emit('save', parsed);

	changed.value = false;
}
</script>
