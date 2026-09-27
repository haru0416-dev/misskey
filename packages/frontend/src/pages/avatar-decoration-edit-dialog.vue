<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkWindow
	ref="windowEl"
	:initialWidth="400"
	:initialHeight="500"
	:canResize="true"
	@close="windowEl?.close()"
	@closed="emit('closed')"
>
	<template v-if="avatarDecoration" #header>{{ avatarDecoration.name }}</template>
	<template v-else #header>New decoration</template>

	<div style="display: flex; flex-direction: column; min-height: 100%;">
		<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px; flex-grow: 1;">
			<div class="_gaps_m">
				<div :class="$style.preview">
					<div :class="[$style.previewItem, $style.light]">
						<MkAvatar style="width: 60px; height: 60px;" :user="$i" :decorations="url != '' ? [{ url }] : []" forceShowDecoration/>
					</div>
					<div :class="[$style.previewItem, $style.dark]">
						<MkAvatar style="width: 60px; height: 60px;" :user="$i" :decorations="url != '' ? [{ url }] : []" forceShowDecoration/>
					</div>
				</div>
				<MkInput v-model="name">
					<template #label>{{ i18n.ts.name }}</template>
				</MkInput>
				<MkInput v-model="url">
					<template #label>{{ i18n.ts.imageUrl }}</template>
				</MkInput>
				<MkInput v-model="category" :datalist="props.categories || []">
					<template #label>{{ i18n.ts.category }}</template>
				</MkInput>
				<MkTextarea v-model="description">
					<template #label>{{ i18n.ts.description }}</template>
				</MkTextarea>
				<MkFolder>
					<template #label>{{ i18n.ts.availableRoles }}</template>
					<template #suffix>{{ roleEntries.length === 0 ? i18n.ts.all : roleEntries.length }}</template>

					<div class="_gaps">
						<MkButton rounded @click="addRole"><i class="ti ti-plus"></i> {{ i18n.ts.add }}</MkButton>

						<div v-for="entry in roleEntries" :key="entry.id" :class="$style.roleItem">
							<template v-if="entry.role != null">
								<MkRolePreview :class="$style.role" :role="entry.role" :forModeration="true" :detailed="false" style="pointer-events: none;"/>
								<button v-if="entry.role.target === 'manual'" class="_button" :class="$style.roleUnassign" @click="removeRole(entry.id)"><i class="ti ti-x"></i></button>
								<button v-else class="_button" :class="$style.roleUnassign" disabled><i class="ti ti-ban"></i></button>
							</template>
							<template v-else>
								<div :class="$style.role" class="_monospace">{{ entry.id }}</div>
								<button class="_button" :class="$style.roleUnassign" @click="removeRole(entry.id)"><i class="ti ti-x"></i></button>
							</template>
						</div>
					</div>
				</MkFolder>
				<MkButton v-if="avatarDecoration" danger @click="del()"><i class="ti ti-trash"></i> {{ i18n.ts.delete }}</MkButton>
			</div>
		</div>
		<div :class="$style.footer">
			<MkButton primary rounded style="margin: 0 auto;" @click="done"><i class="ti ti-check"></i> {{ props.avatarDecoration ? i18n.ts.update : i18n.ts.create }}</MkButton>
		</div>
	</div>
</MkWindow>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import MkWindow from '@/components/overlay/MkWindow.vue';
import MkButton from '@/components/form/MkButton.vue';
import MkInput from '@/components/form/MkInput.vue';
import MkInfo from '@/components/display/MkInfo.vue';
import MkFolder from '@/components/layout/MkFolder.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import MkSwitch from '@/components/form/MkSwitch.vue';
import MkRolePreview from '@/features/roles/components/MkRolePreview.vue';
import MkTextarea from '@/components/form/MkTextarea.vue';
import { ensureSignin } from '@/i.js';
import { useRoleRestriction } from '@/composables/useRoleRestriction.js';

const $i = ensureSignin();

const props = defineProps<{
	avatarDecoration?: Misskey.entities.AdminAvatarDecorationsListResponse[number];
	categories?: string[];
}>();

const emit = defineEmits<{
	(ev: 'done', v: { deleted?: boolean; updated?: any; created?: any }): void;
	(ev: 'closed'): void;
}>();

const windowEl = useTemplateRef('windowEl');
const url = ref<string>(props.avatarDecoration ? props.avatarDecoration.url : '');
const name = ref<string>(props.avatarDecoration ? props.avatarDecoration.name : '');
const category = ref<string>(props.avatarDecoration?.category ? props.avatarDecoration.category : '');
const description = ref<string>(props.avatarDecoration ? props.avatarDecoration.description : '');
// 保存するのは ID の一覧 (useRoleRestriction)。一覧の取得に失敗しても制限を失わない。
const {
	roleIds: roleIdsThatCanBeUsedThisDecoration,
	entries: roleEntries,
	add: addRole,
	remove: removeRole,
} = useRoleRestriction(props.avatarDecoration?.roleIdsThatCanBeUsedThisDecoration ?? []);


async function done() {
	const params = {
		url: url.value,
		name: name.value,
		description: description.value,
		category: category.value,
		roleIdsThatCanBeUsedThisDecoration: roleIdsThatCanBeUsedThisDecoration.value,
	};

	if (props.avatarDecoration) {
		await os.apiWithDialog('admin/avatar-decorations/update', {
			id: props.avatarDecoration.id,
			...params,
		});

		emit('done', {
			updated: {
				id: props.avatarDecoration.id,
				...params,
			},
		});

		windowEl.value?.close();
	} else {
		const created = await os.apiWithDialog('admin/avatar-decorations/create', params);

		emit('done', {
			created,
		});

		windowEl.value?.close();
	}
}

async function del() {
	if (props.avatarDecoration == null) {
		return;
	}

	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx.removeAreYouSure({ x: name.value }),
	});
	if (canceled) {
		return;
	}

	misskeyApi('admin/avatar-decorations/delete', {
		id: props.avatarDecoration.id,
	}).then(() => {
		emit('done', {
			deleted: true,
		});
		windowEl.value?.close();
	});
}
</script>

<style lang="scss" module>
.preview {
	display: grid;
	place-items: center;
	grid-template-columns: 1fr 1fr;
	grid-template-rows: 1fr;
	gap: var(--MI-margin);
}

.previewItem {
	width: 100%;
	height: 100%;
	min-height: 160px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: var(--MI-radius);

	&.light {
		background: #eee;
	}

	&.dark {
		background: #222;
	}
}

.roleItem {
	display: flex;
}

.role {
	flex: 1;
}

.roleUnassign {
	width: 32px;
	height: 32px;
	margin-left: 8px;
	align-self: center;
}

.footer {
	position: sticky;
	z-index: 10000;
	bottom: 0;
	left: 0;
	padding: 12px;
	border-top: solid 0.5px var(--MI_THEME-divider);
	background: color(from var(--MI_THEME-bg) srgb r g b / 0.5);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
}
</style>
