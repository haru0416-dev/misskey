<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #default>
		<div :class="$style.root" class="_gaps">
			<MkFolder>
				<template #icon><i class="ti ti-search"></i></template>
				<template #label>{{ i18n.ts._customEmojisManager._gridCommon.searchSettings }}</template>
				<template #caption>
					{{ i18n.ts._customEmojisManager._gridCommon.searchSettingCaption }}
				</template>

				<div class="_gaps">
					<div :class="$style.fields">
						<MkInput
							v-model="queryName"
							type="search"
							autocapitalize="off"
							@enter="onSearchRequest"
						>
							<template #label>{{ emojiFieldLabel('name') }}</template>
						</MkInput>
						<MkInput
							v-model="queryHost"
							type="search"
							autocapitalize="off"
							@enter="onSearchRequest"
						>
							<template #label>{{ emojiFieldLabel('host') }}</template>
						</MkInput>
						<MkInput
							v-model="queryLicense"
							type="search"
							autocapitalize="off"
							@enter="onSearchRequest"
						>
							<template #label>{{ emojiFieldLabel('license') }}</template>
						</MkInput>

						<MkInput
							v-model="queryUri"
							type="search"
							autocapitalize="off"
							@enter="onSearchRequest"
						>
							<template #label>{{ emojiFieldLabel('uri') }}</template>
						</MkInput>
						<MkInput
							v-model="queryPublicUrl"
							type="search"
							autocapitalize="off"
							@enter="onSearchRequest"
						>
							<template #label>{{ emojiFieldLabel('publicUrl') }}</template>
						</MkInput>
						<MkSelect v-model="queryLimit" :items="limitItems">
							<template #label>{{ i18n.ts._customEmojisManager._gridCommon.searchLimit }}</template>
						</MkSelect>
					</div>

					<MkFolder :spacerMax="8" :spacerMin="8">
						<template #icon><i class="ti ti-arrows-sort"></i></template>
						<template #label>{{ i18n.ts._customEmojisManager._gridCommon.sortOrder }}</template>
						<MkSortOrderEditor
							:baseOrderKeyNames="gridSortOrderKeys"
							:currentOrders="sortOrders"
							:keyLabel="emojiFieldLabel"
							@update="onSortOrderUpdate"
						/>
					</MkFolder>


					<div :class="$style.buttons">
						<MkButton primary @click="onSearchRequest">
							{{ i18n.ts.search }}
						</MkButton>
						<MkButton @click="onQueryResetButtonClicked">
							{{ i18n.ts.reset }}
						</MkButton>
					</div>
				</div>
			</MkFolder>

			<MkFolder>
				<template #icon><i class="ti ti-notes"></i></template>
				<template #label>{{ i18n.ts._customEmojisManager._gridCommon.registrationLogs }}</template>
				<template #caption>
					{{ i18n.ts._customEmojisManager._gridCommon.registrationLogsCaption }}
				</template>
				<XRegisterLogs :logs="requestLogs"/>
			</MkFolder>

			<component :is="loadingHandler.component.value" v-if="loadingHandler.showing.value"/>
			<template v-else>
				<MkResult
					v-if="gridItems.length === 0"
					type="empty"
					:text="searchedWithFilter ? i18n.ts._customEmojisManager._gridCommon.noMatchingEmojis : i18n.ts._customEmojisManager._remote.emojisNothing"
				/>

				<template v-else>
					<div :class="$style.gridArea">
						<MkGrid :data="gridItems" :settings="setupGrid()" @event="onGridEvent"/>
					</div>

					<XGridFooter>
						<template #center>
							<MkPagingButtons :current="currentPage" :max="allPages" :buttonCount="5" @pageChanged="onPageChanged"/>
						</template>
						<template #right>
							<MkButton primary :disabled="checkedItemsCount === 0" @click="onImportClicked">
								{{ i18n.ts._customEmojisManager._remote.importEmojisButton }} ({{ checkedItemsCount }})
							</MkButton>
						</template>
					</XGridFooter>
				</template>
			</template>
		</div>
	</template>
</MkStickyContainer>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, useCssModule } from 'vue';
import * as Misskey from 'misskey-js';
import type { GridSortOrderKey, RequestLogItem } from '@/pages/admin/custom-emojis-manager/impl.js';
import type { GridCellValueChangeEvent, GridEvent } from '@/components/grid/grid-event.js';
import type { GridSetting } from '@/components/grid/grid.js';
import type { SortOrder } from '@/components/form/MkSortOrderEditor.define.js';
import MkRemoteEmojiEditDialog from '@/features/custom-emoji/components/MkRemoteEmojiEditDialog.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { getProxiedImageUrl } from '@/utility/media-proxy.js';
import { i18n } from '@/i18n.js';
import MkButton from '@/components/form/MkButton.vue';
import MkInput from '@/components/form/MkInput.vue';
import MkSelect from '@/components/form/MkSelect.vue';
import MkGrid from '@/components/grid/MkGrid.vue';
import XGridFooter from '@/pages/admin/custom-emojis-manager/grid-footer.vue';
import {
	emptyStrToUndefined,
	emojiFieldLabel,
	gridSortOrderKeys,
	settleEmojiRequest,
	toRequestLogs,
} from '@/pages/admin/custom-emojis-manager/impl.js';
import MkFolder from '@/components/layout/MkFolder.vue';
import XRegisterLogs from '@/pages/admin/custom-emojis-manager/logs.vue';
import * as os from '@/os.js';
import MkPagingButtons from '@/components/layout/MkPagingButtons.vue';
import MkSortOrderEditor from '@/components/form/MkSortOrderEditor.vue';
import { useLoading } from '@/composables/useLoading.js';

type GridItem = {
	checked: boolean;
	id: string;
	url: string;
	name: string;
	host: string;
};

function setupGrid(): GridSetting {
	const $style = useCssModule();

	return {
		root: {
			// 表の領域 (.gridArea) をスクロール領域にして、見出しの行をその中で留める
			noOverflowStyle: true,
		},
		row: {
			minimumDefinitionCount: 100,
			styleRules: [
				{
					condition: ({ row }) => gridItems.value[row.index]?.checked ?? false,
					applyStyle: { className: $style['changedRow'] ?? '' },
				},
			],
			contextMenuFactory: (row, context) => {
				return [
					{
						type: 'button',
						text: i18n.ts._customEmojisManager._remote.importSelectionRows,
						icon: 'ti ti-download',
						action: async () => {
							const targets = context.rangedRows.flatMap((it) => {
								const item = gridItems.value[it.index];
								return item == null ? [] : [item];
							});
							await importEmojis(targets);
						},
					},
				];
			},
		},
		cols: [
			{ bindTo: 'checked', icon: 'ti-download', type: 'boolean', editable: true, width: 34 },
			{ bindTo: 'url', icon: 'ti-icons', type: 'image', editable: false, width: 'auto' },
			{ bindTo: 'name', title: emojiFieldLabel('name'), type: 'text', editable: false, width: 'auto' },
			{ bindTo: 'host', title: emojiFieldLabel('host'), type: 'text', editable: false, width: 'auto' },
			{ bindTo: 'license', title: emojiFieldLabel('license'), type: 'text', editable: false, width: 200 },
			{ bindTo: 'uri', title: emojiFieldLabel('uri'), type: 'text', editable: false, width: 'auto' },
			{ bindTo: 'publicUrl', title: emojiFieldLabel('publicUrl'), type: 'text', editable: false, width: 'auto' },
		],
		cells: {
			contextMenuFactory: (col, row, value, context) => {
				return [
					{
						type: 'button',
						text: i18n.ts._customEmojisManager._remote.selectionRowDetail,
						icon: 'ti ti-info-circle',
						action: async () => {
							const target = customEmojis.value[row.index];
							if (target == null) {
								return;
							}
							const { dispose } = os.popup(
								MkRemoteEmojiEditDialog,
								{
									emoji: {
										id: target.id,
										name: target.name,
										host: target.host ?? '',
										license: target.license,
										url: target.publicUrl,
									},
								},
								{
									done: () => {
										dispose();
									},
									closed: () => {
										dispose();
									},
								},
							);
						},
					},
					{
						type: 'button',
						text: i18n.ts._customEmojisManager._remote.importSelectionRangesRows,
						icon: 'ti ti-download',
						action: async () => {
							const targets = context.rangedCells.flatMap((it) => {
								const item = gridItems.value[it.row.index];
								return item == null ? [] : [item];
							});
							await importEmojis(targets);
						},
					},
				];
			},
		},
	};
}

const loadingHandler = useLoading();

const customEmojis = ref<Misskey.entities.EmojiDetailedAdmin[]>([]);
const allPages = ref<number>(0);
const currentPage = ref<number>(0);

const queryName = ref<string | null>(null);
const queryHost = ref<string | null>(null);
const queryLicense = ref<string | null>(null);
const queryUri = ref<string | null>(null);
const queryPublicUrl = ref<string | null>(null);
const searchedWithFilter = ref(false);
const queryLimit = ref<number>(100);
const limitItems = [25, 50, 100].map((n) => ({ label: `${n}`, value: n }));
const previousQuery = ref<string | undefined>(undefined);
const sortOrders = ref<SortOrder<GridSortOrderKey>[]>([]);
const requestLogs = ref<RequestLogItem[]>([]);

const gridItems = ref<GridItem[]>([]);

const checkedItemsCount = computed(() => gridItems.value.filter((it) => it.checked).length);

function onSortOrderUpdate(_sortOrders: SortOrder<GridSortOrderKey>[]) {
	sortOrders.value = _sortOrders;
}

async function onSearchRequest() {
	await refreshCustomEmojis();
}

function onQueryResetButtonClicked() {
	queryName.value = null;
	queryHost.value = null;
	queryLicense.value = null;
	queryUri.value = null;
	queryPublicUrl.value = null;
}

async function onPageChanged(pageNumber: number) {
	currentPage.value = pageNumber;
	await refreshCustomEmojis();
}

async function onImportClicked() {
	const targets = gridItems.value.filter((it) => it.checked);
	await importEmojis(targets);
}

function onGridEvent(event: GridEvent) {
	switch (event.type) {
		case 'cell-value-change':
			onGridCellValueChange(event);
			break;
	}
}

function onGridCellValueChange(event: GridCellValueChangeEvent) {
	const { row, column, newValue } = event;
	const item = gridItems.value[row.index];
	if (item != null && column.setting.bindTo in item) {
		(item as any)[column.setting.bindTo] = newValue;
	}
}

async function importEmojis(targets: GridItem[]) {
	const confirm = await os.confirm({
		type: 'info',
		title: i18n.ts._customEmojisManager._remote.confirmImportEmojisTitle,
		text: i18n.tsx._customEmojisManager._remote.confirmImportEmojisDescription({ count: targets.length }),
	});

	if (confirm.canceled) {
		return;
	}

	const result = await os.promiseDialog(
		Promise.all(
			targets.map((item) =>
				settleEmojiRequest(
					item,
					misskeyApi('admin/emoji/copy', {
						emojiId: item.id!,
					}),
				),
			),
		),
	);
	requestLogs.value = await toRequestLogs(result);

	await refreshCustomEmojis();
}

async function refreshCustomEmojis() {
	const name = emptyStrToUndefined(queryName.value);
	const host = emptyStrToUndefined(queryHost.value);
	const license = emptyStrToUndefined(queryLicense.value);
	const uri = emptyStrToUndefined(queryUri.value);
	const publicUrl = emptyStrToUndefined(queryPublicUrl.value);
	const query: NonNullable<Misskey.entities.V2AdminEmojiListRequest['query']> = {
		...(name === undefined ? {} : { name }),
		...(host === undefined ? {} : { host }),
		...(license === undefined ? {} : { license }),
		...(uri === undefined ? {} : { uri }),
		...(publicUrl === undefined ? {} : { publicUrl }),
		hostType: 'remote',
	};

	// 件数を変えたときもページを 1 に戻す (戻さないと、件数を増やしたときに範囲外のページを引いて空になる)
	const queryKey = JSON.stringify({ query, limit: queryLimit.value });
	if (queryKey !== previousQuery.value) {
		currentPage.value = 1;
	}

	const result = await loadingHandler.scope(() =>
		misskeyApi('v2/admin/emoji/list', {
			limit: queryLimit.value,
			query,
			page: currentPage.value,
			sortKeys: sortOrders.value.map(({ key, direction }) => `${direction}${key}`) as never[],
		}),
	);

	customEmojis.value = result.emojis;
	allPages.value = result.allPages;
	previousQuery.value = queryKey;
	// 空のときの文言は、入力中の欄ではなく実際に検索した条件で決める
	searchedWithFilter.value = Object.keys(query).some((key) => key !== 'hostType');
	gridItems.value = customEmojis.value.map((it) => ({
		checked: false,
		id: it.id,
		// 他のサーバーの画像を管理者のブラウザから直接読むと、そのサーバーに IP アドレスが伝わるので、メディアプロキシを通す
		url: getProxiedImageUrl(it.publicUrl, 'emoji'),
		name: it.name,
		license: it.license,
		host: it.host!,
	}));
}

onMounted(async () => {
	await refreshCustomEmojis();
});
</script>

<style module lang="scss">
.root {
	padding: 16px;
	container-type: inline-size;
}

.changedRow {
	background-color: var(--MI_THEME-infoBg) !important;
}

.fields {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	gap: 12px 16px;
}

.buttons {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}

/* 列が多く画面より広く、行も多いので、表だけを縦横にスクロールさせて見出しの行を上に留める */
.gridArea {
	overflow: auto;
	max-height: calc(100dvh - var(--MI-stickyTop, 0px) - var(--MI-stickyBottom, 0px) - 80px);
}
</style>
