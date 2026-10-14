<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<table :class="$style.table">
		<tbody>
			<template v-for="(entry, index) in entries" :key="index">
				<tr v-if="entry.hidden && !expanded.has(index)">
					<td colspan="3">
						<button class="_button" :class="$style.expand" :aria-label="i18n.ts.showMore" @click="expanded.add(index)">⋯</button>
					</td>
				</tr>
				<template v-else>
					<tr v-for="(line, lineIndex) in entry.lines" :key="lineIndex" :class="$style[line.kind]">
						<td :class="$style.number">{{ line.oldNumber }}</td>
						<td :class="$style.number">{{ line.newNumber }}</td>
						<td :class="$style.code"><span :class="$style.marker">{{ line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' ' }}</span><span v-for="(part, partIndex) in line.parts" :key="partIndex" :style="{ color: part.color }" :class="{ [$style.changed]: part.changed }">{{ part.content }}</span></td>
					</tr>
				</template>
			</template>
		</tbody>
	</table>
</div>
</template>

<script lang="ts" setup>
import { computed, reactive, shallowRef, watch } from 'vue';
import { diffLines, diffWordsWithSpace } from 'diff';
import { tokenizeCodeLines } from '@/features/code/code-highlighter.js';
import { i18n } from '@/i18n.js';

type Part = { content: string; color?: string | undefined; changed?: boolean };
type Line = {
	kind: 'added' | 'removed' | 'equal';
	oldNumber: number | undefined;
	newNumber: number | undefined;
	parts: Part[];
};

const props = defineProps<{
	oldString: string;
	newString: string;
	language?: 'javascript';
}>();

const expanded = reactive(new Set<number>());

watch(() => [props.oldString, props.newString], () => expanded.clear());

// 色付けの言語は読み込みを待つので、読み込むまでは色なしの行 (トークンが無い行) で差分を出す
const highlighted = shallowRef<{ old: Part[][]; new: Part[][] } | null>(null);
let generation = 0;
watch(
	() => [props.oldString, props.newString, props.language] as const,
	async ([oldString, newString, language]) => {
		const current = ++generation;
		highlighted.value = null;
		if (!language) {
			return;
		}
		const [oldTokens, newTokens] = await Promise.all([tokenizeCodeLines(oldString, language), tokenizeCodeLines(newString, language)]);
		if (current === generation && oldTokens != null && newTokens != null) {
			highlighted.value = { old: oldTokens, new: newTokens };
		}
	},
	{ immediate: true },
);

const entries = computed(() => {
	const oldTokens = highlighted.value?.old ?? [];
	const newTokens = highlighted.value?.new ?? [];
	const changes = diffLines(props.oldString, props.newString);
	const lines: Line[] = [];
	let oldNumber = 0;
	let newNumber = 0;

	for (const [index, change] of changes.entries()) {
		const kind = change.added ? 'added' : change.removed ? 'removed' : 'equal';
		const previous = changes[index - 1];
		const next = changes[index + 1];
		const counterpart = change.removed && next?.added ? next : change.added && previous?.removed ? previous : undefined;
		const content = change.value.replace(/\n$/, '').split('\n');
		const otherLines = counterpart?.count === change.count ? counterpart?.value.replace(/\n$/, '').split('\n') : undefined;

		for (const [lineIndex, text] of content.entries()) {
			if (!change.added) oldNumber++;
			if (!change.removed) newNumber++;
			const tokens = (change.removed ? oldTokens[oldNumber - 1] : newTokens[newNumber - 1]) ?? [{ content: text }];
			const other = otherLines?.[lineIndex];
			const ranges: { start: number; end: number }[] = [];
			if (other !== undefined) {
				let offset = 0;
				// 空白も差分の一部として残し、表示文字列と強調範囲の位置を揃える。
				for (const word of diffWordsWithSpace(other, text)) {
					if (word.removed) continue;
					if (word.added) ranges.push({ start: offset, end: offset + word.value.length });
					offset += word.value.length;
				}
			}
			let offset = 0;
			const parts: Part[] = [];
			for (const token of tokens) {
				const end = offset + token.content.length;
				const boundaries = new Set([offset, end]);
				for (const range of ranges) {
					if (range.start > offset && range.start < end) boundaries.add(range.start);
					if (range.end > offset && range.end < end) boundaries.add(range.end);
				}
				const sorted = [...boundaries].sort((a, b) => a - b);
				for (let partIndex = 0; partIndex < sorted.length - 1; partIndex++) {
					const start = sorted[partIndex]!;
					parts.push({
						content: token.content.slice(start - offset, sorted[partIndex + 1]! - offset),
						color: token.color,
						changed: ranges.some(range => range.start <= start && start < range.end),
					});
				}
				offset = end;
			}
			lines.push({ kind, oldNumber: change.added ? undefined : oldNumber, newNumber: change.removed ? undefined : newNumber, parts });
		}
	}

	const visible = new Set<number>();
	for (const [index, line] of lines.entries()) {
		if (line.kind !== 'equal') {
			for (let context = Math.max(0, index - 5); context <= Math.min(lines.length - 1, index + 5); context++) visible.add(context);
		}
	}
	const result: { hidden: boolean; lines: Line[] }[] = [];
	for (const [index, line] of lines.entries()) {
		const hidden = props.oldString !== props.newString && !visible.has(index);
		const previous = result.at(-1);
		if (previous?.hidden === hidden) previous.lines.push(line);
		else result.push({ hidden, lines: [line] });
	}
	return result;
});
</script>

<style lang="scss" module>
@use '@/features/code/_code-colors.scss' as code;

.root {
	@include code.code-colors;
	max-height: 300px;
	overflow: auto;
	background: var(--MI_THEME-codeBlockBg);
	color: var(--MI_THEME-codeBlockFg);
}

.table {
	width: 100%;
	border-collapse: collapse;
	font-family: monospace;
	font-size: 12px;
	line-height: 1.6;
}

.number {
	width: 1px;
	min-width: 2em;
	padding: 0 8px;
	text-align: right;
	color: var(--MI-text-muted);
	user-select: none;
}

.code {
	padding: 0 8px;
	white-space: pre;
}

.marker {
	display: inline-block;
	width: 1em;
	user-select: none;
}

.added {
	background: color-mix(in srgb, var(--MI_THEME-success) 15%, transparent);

	.changed {
		background: color-mix(in srgb, var(--MI_THEME-success) 30%, transparent);
	}
}

.removed {
	background: color-mix(in srgb, var(--MI_THEME-error) 15%, transparent);

	.changed {
		background: color-mix(in srgb, var(--MI_THEME-error) 30%, transparent);
	}
}

.expand {
	width: 100%;
	background: var(--MI_THEME-buttonBg);
	text-align: left;
	padding: 0 8px;
}
</style>
