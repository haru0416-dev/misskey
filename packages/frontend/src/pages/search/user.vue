<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div class="_gaps">
		<MkInput v-model="searchQuery" :large="true" :autofocus="true" type="search" @enter.prevent="search">
			<template #prefix><i class="ti ti-search"></i></template>
		</MkInput>
		<MkRadios
			v-if="instance.federation !== 'none'"
			v-model="searchOrigin"
			:options="[
				{ value: 'combined', label: i18n.ts.all },
				{ value: 'local', label: i18n.ts.local },
				{ value: 'remote', label: i18n.ts.remote },
			]"
			@update:modelValue="search()"
		>
		</MkRadios>
		<MkButton large primary gradate rounded @click="search">{{ i18n.ts.search }}</MkButton>
	</div>

	<MkFoldableSection v-if="paginator">
		<template #header>{{ i18n.ts.searchResult }}</template>
		<MkUserList :key="`searchUsers:${key}`" :paginator="paginator"/>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { markRaw, ref, shallowRef, toRef } from 'vue';
import type { Endpoints } from 'misskey-js';
import MkUserList from '@/features/users/components/MkUserList.vue';
import MkInput from '@/components/form/MkInput.vue';
import MkRadios from '@/components/form/MkRadios.vue';
import MkButton from '@/components/form/MkButton.vue';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import * as os from '@/os.js';
import MkFoldableSection from '@/components/layout/MkFoldableSection.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useRouter } from '@/router.js';
import { Paginator } from '@/utility/paginator.js';
import { openSearchShortcut } from '@/features/search/lookup.js';

const props = withDefaults(
	defineProps<{
		query?: string;
		origin?: Endpoints['users/search']['req']['origin'];
	}>(),
	{
		query: '',
		origin: 'combined',
	},
);

const router = useRouter();

const key = ref(0);
const paginator = shallowRef<Paginator<'users/search'> | null>(null);

const searchQuery = ref(toRef(props, 'query').value);
const searchOrigin = ref(toRef(props, 'origin').value);

async function search() {
	const query = searchQuery.value.toString().trim();

	if (query == null || query === '') {
		return;
	}

	const opened = await openSearchShortcut(router, query, {
		fetchApObject: (uri) => {
			const promise = misskeyApi('ap/show', {
				uri,
			});

			os.promiseDialog(promise, null, null, i18n.ts.fetchingAsApObject);

			return promise;
		},
		openTag: (tag) => {
			router.push('/user-tags/:tag', {
				params: {
					tag,
				},
			});
		},
	});
	if (opened) {
		return;
	}

	paginator.value = markRaw(
		new Paginator('users/search', {
			limit: 10,
			offsetMode: true,
			params: {
				query,
				origin: instance.federation === 'none' ? 'local' : searchOrigin.value,
			},
		}),
	);

	key.value++;
}
</script>
