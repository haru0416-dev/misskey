<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 1000px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<div class="_root">
			<Transition :name="prefer.animation ? 'fade' : ''" mode="out-in">
				<div v-if="post" class="rkxwuolj">
					<div class="files">
						<div v-for="file in post.files" :key="file.id" class="file">
							<img :src="file.url" :alt="file.comment ?? file.name"/>
						</div>
					</div>
					<div class="body">
						<div class="title">{{ post.title }}</div>
						<div class="description"><Mfm v-if="post.description != null" :text="post.description"/></div>
						<div class="info">
							<i class="ti ti-clock" aria-hidden="true"></i> <MkTime :time="post.createdAt" mode="detail"/>
						</div>
						<div class="actions">
							<div class="like">
								<MkButton v-if="post.isLiked" v-tooltip="i18n.ts._gallery.unlike" class="button" primary :aria-label="i18n.ts._gallery.unlike" @click="unlike()"><i class="ti ti-heart-off" aria-hidden="true"></i><span v-if="post.likedCount > 0" class="count">{{ post.likedCount }}</span></MkButton>
								<MkButton v-else v-tooltip="i18n.ts._gallery.like" class="button" :aria-label="i18n.ts._gallery.like" @click="like()"><i class="ti ti-heart" aria-hidden="true"></i><span v-if="post.likedCount > 0" class="count">{{ post.likedCount }}</span></MkButton>
							</div>
							<div class="other">
								<button v-if="$i && $i.id === post.user.id" v-tooltip="i18n.ts.edit" v-click-anime class="_button" :aria-label="i18n.ts.edit" @click="edit"><i class="ti ti-pencil ti-fw" aria-hidden="true"></i></button>
								<button v-tooltip="i18n.ts.shareWithNote" v-click-anime class="_button" :aria-label="i18n.ts.shareWithNote" @click="shareWithNote"><i class="ti ti-repeat ti-fw" aria-hidden="true"></i></button>
								<button v-tooltip="i18n.ts.copyLink" v-click-anime class="_button" :aria-label="i18n.ts.copyLink" @click="copyLink"><i class="ti ti-link ti-fw" aria-hidden="true"></i></button>
								<button v-if="isSupportShare()" v-tooltip="i18n.ts.share" v-click-anime class="_button" :aria-label="i18n.ts.share" @click="share"><i class="ti ti-share ti-fw" aria-hidden="true"></i></button>
								<button v-if="$i && $i.id !== post.user.id" v-tooltip="i18n.ts.menu" v-click-anime class="_button" :aria-label="i18n.ts.menu" @click="showMenu"><i class="ti ti-dots ti-fw" aria-hidden="true"></i></button>
							</div>
						</div>
						<div class="user">
							<MkAvatar :user="post.user" class="avatar" link preview/>
							<div class="name">
								<MkUserName :user="post.user" style="display: block;"/>
								<MkAcct :user="post.user"/>
							</div>
						</div>
					</div>
					<MkAd :preferForms="['horizontal', 'horizontal-big']"/>
					<MkContainer :max-height="300" :foldable="true" class="other">
						<template #icon><i class="ti ti-clock" aria-hidden="true"></i></template>
						<template #header>{{ i18n.ts.recentPosts }}</template>
						<MkPagination v-slot="{items}" :paginator="otherPostsPaginator">
							<div class="sdrarzaf">
								<MkGalleryPostPreview v-for="post in items" :key="post.id" :post="post" class="post"/>
							</div>
						</MkPagination>
					</MkContainer>
				</div>
				<MkError v-else-if="error" @retry="fetchPost()"/>
				<MkLoading v-else/>
			</Transition>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, watch, ref, defineAsyncComponent, markRaw } from 'vue';
import * as Misskey from 'misskey-js';
import { url } from '@shared/utility/config.js';
import type { MenuItem } from '@/types/menu.js';
import MkButton from '@/components/form/MkButton.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkContainer from '@/components/layout/MkContainer.vue';
import MkPagination from '@/components/layout/MkPagination.vue';
import MkGalleryPostPreview from '@/features/gallery/components/MkGalleryPostPreview.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { prefer } from '@/preferences.js';
import { $i } from '@/i.js';
import { isSupportShare } from '@/utility/navigator.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { useRouter } from '@/router.js';
import { Paginator } from '@/utility/paginator.js';

const router = useRouter();

const props = defineProps<{
	postId: string;
}>();

const post = ref<Misskey.entities.GalleryPost | null>(null);
const error = ref<unknown>(null);
const otherPostsPaginator = markRaw(new Paginator('users/gallery/posts', {
	limit: 6,
	computedParams: computed(() => ({
		userId: post.value!.user.id,
	})),
}));

function fetchPost() {
	post.value = null;
	misskeyApi('gallery/posts/show', {
		postId: props.postId,
	}).then(_post => {
		post.value = _post;
	}).catch(_error => {
		error.value = _error;
	});
}

function copyLink() {
	if (!post.value) return;
	copyToClipboard(`${url}/gallery/${post.value.id}`);
}

function share() {
	if (!post.value) return;
	navigator.share({
		title: post.value.title,
		...(post.value.description == null ? {} : { text: post.value.description }),
		url: `${url}/gallery/${post.value.id}`,
	});
}

function shareWithNote() {
	if (!post.value) return;
	os.post({
		initialText: `${post.value.title} ${url}/gallery/${post.value.id}`,
	});
}

function like() {
	if (!post.value) return;
	os.apiWithDialog('gallery/posts/like', {
		postId: props.postId,
	}).then(() => {
		post.value!.isLiked = true;
		post.value!.likedCount++;
	});
}

async function unlike() {
	if (!post.value) return;
	const confirm = await os.confirm({
		type: 'warning',
		text: i18n.ts.unlikeConfirm,
	});
	if (confirm.canceled) return;
	os.apiWithDialog('gallery/posts/unlike', {
		postId: props.postId,
	}).then(() => {
		post.value!.isLiked = false;
		post.value!.likedCount--;
	});
}

function edit() {
	router.push('/gallery/:postId/edit', {
		params: {
			postId: props.postId,
		},
	});
}

async function reportAbuse() {
	if (!post.value) return;

	const pageUrl = `${url}/gallery/${post.value.id}`;

	const { dispose } = await os.popupAsyncWithDialog(import('@/features/abuse-reports/components/MkAbuseReportWindow.vue').then(x => x.default), {
		user: post.value.user,
		initialComment: `Post: ${pageUrl}\n-----\n`,
	}, {
		closed: () => dispose(),
	});
}

function showMenu(ev: PointerEvent) {
	if (!post.value) return;

	const menuItems: MenuItem[] = [];

	if ($i && $i.id !== post.value.userId) {
		menuItems.push({
			icon: 'ti ti-exclamation-circle',
			text: i18n.ts.reportAbuse,
			action: reportAbuse,
		});

		if ($i.isModerator || $i.isAdmin) {
			menuItems.push({
				type: 'divider',
			}, {
				icon: 'ti ti-trash',
				text: i18n.ts.delete,
				danger: true,
				action: () => os.confirm({
					type: 'warning',
					text: i18n.ts.deleteConfirm,
				}).then(({ canceled }) => {
					if (canceled || !post.value) return;

					os.apiWithDialog('gallery/posts/delete', { postId: post.value.id });
				}),
			});
		}
	}

	os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
}

watch(() => props.postId, fetchPost, { immediate: true });

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: post.value ? post.value.title : i18n.ts.gallery,
	...post.value ? {
		avatar: post.value.user,
	} : {},
}));
</script>

<style lang="scss" scoped>
.fade-enter-active,
.fade-leave-active {
	transition: opacity var(--MI-duration-fast) var(--MI-ease-out);
}
.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}

.rkxwuolj {
	> .files {
		display: flex;
		flex-direction: column;
		gap: var(--MI-space-lg);

		> .file {
			> img {
				display: block;
				max-width: 100%;
				max-height: 500px;
				margin: 0 auto;
			}
		}
	}

	> .body {
		padding: var(--MI-space-3xl);

		> .title {
			font-weight: bold;
			font-size: 1.2em;
			margin-bottom: var(--MI-space-lg);
		}

		> .info {
			margin-top: var(--MI-space-lg);
			font-size: 90%;
			opacity: 0.7;
		}

		> .actions {
			display: flex;
			align-items: center;
			margin-top: var(--MI-space-lg);
			padding: var(--MI-space-lg) 0 0 0;
			border-top: solid 0.5px var(--MI_THEME-divider);

			> .like {
				> .button {
					--MI_THEME-accent: var(--MI_THEME-love);
					--MI_THEME-buttonBg: color(from var(--MI_THEME-love) srgb r g b / 0.05);
					--MI_THEME-buttonHoverBg: color(from var(--MI_THEME-love) srgb r g b / 0.1);
					color: var(--MI_THEME-love);

					::v-deep(.count) {
						margin-left: 0.5em;
					}
				}
			}

			> .other {
				margin-left: auto;

				> button {
					padding: var(--MI-space-sm);
					margin: 0 var(--MI-space-sm);

					&:hover {
						color: var(--MI_THEME-fgHighlighted);
					}
				}
			}
		}

		> .user {
			margin-top: var(--MI-space-lg);
			padding: var(--MI-space-lg) 0 0 0;
			border-top: solid 0.5px var(--MI_THEME-divider);
			display: flex;
			align-items: center;
			flex-wrap: wrap;

			> .avatar {
				width: 52px;
				height: 52px;
			}

			> .name {
				margin: 0 0 0 var(--MI-space-md);
				font-size: 90%;
			}
		}
	}
}

.sdrarzaf {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
	gap: var(--MI-space-md);
	margin: var(--MI-margin);
}
</style>
