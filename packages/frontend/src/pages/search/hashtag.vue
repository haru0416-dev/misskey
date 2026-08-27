<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div class="_gaps">
		<MkInput
			v-model="tagsInput"
			large
			autofocus
			type="search"
			:placeholder="i18n.ts._search.hashtagPlaceholder"
			@enter.prevent="search"
		>
			<template #prefix><i class="ti ti-hash"></i></template>
			<template #caption>{{ i18n.ts._search.hashtagAndNote }}</template>
		</MkInput>
		<MkFoldableSection>
			<template #header>{{ i18n.ts.options }}</template>

			<div :class="$style.filterGrid">
				<MkSelect v-model="filesFilter" :items="fileFilterDef">
					<template #label>{{ i18n.ts.file }}</template>
				</MkSelect>
				<MkSelect v-model="repliesFilter" :items="booleanFilterDef">
					<template #label>{{ i18n.ts.replies }}</template>
				</MkSelect>
				<MkSelect v-model="renotesFilter" :items="booleanFilterDef">
					<template #label>{{ i18n.ts.renote }}</template>
				</MkSelect>
				<MkSelect v-model="pollsFilter" :items="booleanFilterDef">
					<template #label>{{ i18n.ts.poll }}</template>
				</MkSelect>
			</div>
		</MkFoldableSection>
		<div>
			<MkButton
				large
				primary
				gradate
				rounded
				:disabled="tags == null"
				style="margin: 0 auto;"
				@click="search"
			>
				{{ i18n.ts.search }}
			</MkButton>
		</div>
	</div>

	<MkFoldableSection v-if="paginator">
		<template #header>{{ i18n.ts.searchResult }}</template>
		<MkNotesTimeline :key="`searchByTag:${key}`" :paginator="paginator"/>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { computed, markRaw, ref, shallowRef, toRef } from 'vue';
import { i18n } from '@/i18n.js';
import MkButton from '@/components/form/MkButton.vue';
import MkFoldableSection from '@/components/layout/MkFoldableSection.vue';
import MkInput from '@/components/form/MkInput.vue';
import MkNotesTimeline from '@/features/notes/components/MkNotesTimeline.vue';
import MkSelect from '@/components/form/MkSelect.vue';
import { Paginator } from '@/utility/paginator.js';
import { parseHashtagQuery } from '@/features/search/hashtag-query.js';
import type { MkSelectItem } from '@/components/form/MkSelect.vue';
import { useMkSelect } from '@/composables/useMkSelect.js';

const props = withDefaults(defineProps<{
	query?: string;
}>(), {
	query: '',
});

const key = ref(0);
const paginator = shallowRef<Paginator<'notes/search-by-tag'> | null>(null);

const tagsInput = ref(toRef(props, 'query').value);

type BooleanFilter = 'all' | 'include' | 'exclude';

const booleanFilterDef = computed<MkSelectItem<BooleanFilter>[]>(() => [
	{ label: i18n.ts.all, value: 'all' },
	{ label: i18n.ts._search.include, value: 'include' },
	{ label: i18n.ts._search.exclude, value: 'exclude' },
]);
// withFiles は真偽値ひとつで「ファイルが無いものだけ」を表せない。
const fileFilterDef = computed<MkSelectItem<Exclude<BooleanFilter, 'exclude'>>[]>(() => [
	{ label: i18n.ts.all, value: 'all' },
	{ label: i18n.ts._search.include, value: 'include' },
]);
const { model: filesFilter } = useMkSelect({ items: fileFilterDef, initialValue: 'all' });
const { model: repliesFilter } = useMkSelect({ items: booleanFilterDef, initialValue: 'all' });
const { model: renotesFilter } = useMkSelect({ items: booleanFilterDef, initialValue: 'all' });
const { model: pollsFilter } = useMkSelect({ items: booleanFilterDef, initialValue: 'all' });

const tags = computed(() => parseHashtagQuery(tagsInput.value));

const toBooleanFilter = (value: BooleanFilter): boolean | null => value === 'all' ? null : value === 'include';

function search() {
	if (tags.value == null) return;

	paginator.value = markRaw(new Paginator('notes/search-by-tag', {
		limit: 10,
		params: {
			// 外側が OR、内側が AND。ここでは 1 組だけを送る。
			query: [tags.value],
			withFiles: filesFilter.value === 'include',
			reply: toBooleanFilter(repliesFilter.value),
			renote: toBooleanFilter(renotesFilter.value),
			poll: toBooleanFilter(pollsFilter.value),
		},
	}));

	key.value++;
}
</script>

<style lang="scss" module>
.filterGrid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: var(--MI-margin);
}

@container (max-width: 500px) {
	.filterGrid {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
