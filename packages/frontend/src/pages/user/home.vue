<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component :is="prefer.enablePullToRefresh ? MkPullToRefresh : 'div'" :refresher="() => reload()">
	<div class="_spacer" :style="{ '--MI_SPACER-w': narrow ? '800px' : '1100px' }">
		<div ref="rootEl" class="ftskorzw" :class="{ wide: !narrow }" style="container-type: inline-size;">
			<div class="main _gaps">
				<!-- TODO: アカウント停止・サイレンス状態の警告表示を復元する -->
				<!-- <div class="punished" v-if="user.isSuspended"><i class="ti ti-alert-triangle" style="margin-right: 8px;"></i> {{ i18n.ts.userSuspended }}</div> -->
				<!-- <div class="punished" v-if="user.isSilenced"><i class="ti ti-alert-triangle" style="margin-right: 8px;"></i> {{ i18n.ts.userSilenced }}</div> -->

				<div class="profile _gaps">
					<MkAccountMoved v-if="user.movedTo" :movedTo="user.movedTo"/>
					<MkRemoteCaution v-if="user.host != null" :href="user.url ?? user.uri!"/>
					<MkInfo v-if="user.host == null && user.username.includes('.')">{{ i18n.ts.isSystemAccount }}</MkInfo>

					<div :key="user.id" class="main _panel">
						<div ref="bannerEl" class="banner-container">
							<div class="banner" :style="style"></div>
							<div class="fade"></div>
							<div class="title">
								<MkUserName class="name" :user="user" :nowrap="true"/>
								<div class="bottom">
									<span class="username"><MkAcct :user="user" :detail="true"/></span>
									<span v-if="user.isLocked"><i class="ti ti-lock"></i></span>
									<span v-if="user.isBot"><i class="ti ti-robot"></i></span>
									<button v-if="$i && !isEditingMemo && !memoDraft" class="_button add-note-button" @click="showMemoTextarea">
										<i class="ti ti-edit"></i> {{ i18n.ts.addMemo }}
									</button>
								</div>
							</div>
							<span v-if="$i && $i.id != user.id && user.isFollowed" class="followed">{{ i18n.ts.followsYou }}</span>
							<div class="actions">
								<button class="menu _button" @click="menu"><i class="ti ti-dots"></i></button>
								<MkFollowButton v-if="$i?.id != user.id" v-model:user="user" :inline="true" :transparent="false" :full="true" class="koudoku"/>
							</div>
						</div>
						<MkAvatar class="avatar" :user="user" indicator/>
						<div class="title">
							<MkUserName :user="user" :nowrap="false" class="name"/>
							<div class="bottom">
								<span class="username"><MkAcct :user="user" :detail="true"/></span>
								<span v-if="user.isLocked"><i class="ti ti-lock"></i></span>
								<span v-if="user.isBot"><i class="ti ti-robot"></i></span>
							</div>
						</div>
						<div v-if="user.followedMessage != null" class="followedMessage">
							<MkFukidashi class="fukidashi" :tail="narrow ? 'none' : 'left'">
								<div class="messageHeader">{{ i18n.ts.messageToFollower }}</div>
								<div><MkSparkle><Mfm :plain="true" :text="user.followedMessage" :author="user" class="_selectable"/></MkSparkle></div>
							</MkFukidashi>
						</div>
						<div v-if="user.roles.length > 0" class="roles">
							<span v-for="role in user.roles" :key="role.id" v-tooltip="role.description" class="role" :style="{ '--color': role.color ?? '' }">
								<MkA v-adaptive-bg :to="`/roles/${role.id}`">
									<img v-if="role.iconUrl" style="height: 1.3em; vertical-align: -22%;" :src="role.iconUrl" alt=""/>
									{{ role.name }}
								</MkA>
							</span>
						</div>
						<div v-if="iAmModerator" class="moderationNote">
							<MkTextarea v-if="editModerationNote || (moderationNote != null && moderationNote !== '')" v-model="moderationNote" manualSave>
								<template #label>{{ i18n.ts.moderationNote }}</template>
								<template #caption>{{ i18n.ts.moderationNoteDescription }}</template>
							</MkTextarea>
							<div v-else>
								<MkButton small @click="editModerationNote = true">{{ i18n.ts.addModerationNote }}</MkButton>
							</div>
						</div>
						<div v-if="isEditingMemo || memoDraft" class="memo" :class="{'no-memo': !memoDraft}">
							<div class="heading">{{ i18n.ts.memo }}</div>
							<textarea
								ref="memoTextareaEl"
								v-model="memoDraft"
								rows="1"
								:aria-label="i18n.ts.memo"
								@focus="isEditingMemo = true"
								@blur="updateMemo"
								@input="adjustMemoTextarea"
							></textarea>
						</div>
						<div class="description">
							<MkOmit>
								<Mfm v-if="user.description" :text="user.description" :isNote="false" :author="user" class="_selectable"/>
								<p v-else class="empty">{{ i18n.ts.noAccountDescription }}</p>
							</MkOmit>
						</div>
						<div class="fields system">
							<dl v-if="user.location" class="field">
								<dt class="name"><i class="ti ti-map-pin ti-fw"></i> {{ i18n.ts.location }}</dt>
								<dd class="value">{{ user.location }}</dd>
							</dl>
							<dl v-if="user.birthday" class="field">
								<dt class="name"><i class="ti ti-cake ti-fw"></i> {{ i18n.ts.birthday }}</dt>
								<dd class="value">{{ user.birthday.replace('-', '/').replace('-', '/') }} ({{ i18n.tsx.yearsOld({ age }) }})</dd>
							</dl>
							<dl class="field">
								<dt class="name"><i class="ti ti-calendar ti-fw"></i> {{ i18n.ts.registeredDate }}</dt>
								<dd class="value">{{ dateString(user.createdAt) }} (<MkTime :time="user.createdAt"/>)</dd>
							</dl>
						</div>
						<div v-if="user.fields.length > 0" class="fields">
							<dl v-for="(field, i) in user.fields" :key="i" class="field">
								<dt class="name">
									<Mfm :text="field.name" :author="user" :plain="true" :colored="false" class="_selectable"/>
								</dt>
								<dd class="value">
									<Mfm :text="field.value" :author="user" :colored="false" class="_selectable"/>
									<button v-if="user.verifiedLinks.includes(field.value)" v-tooltip:dialog="i18n.ts.verifiedLink" type="button" class="_button" :class="$style.verifiedLink" :aria-label="i18n.ts.verifiedLink"><i class="ti ti-circle-check"></i></button>
								</dd>
							</dl>
						</div>
						<div class="status">
							<MkA :to="userPage(user, 'notes')">
								<b>{{ number(user.notesCount) }}</b>
								<span>{{ i18n.ts.notes }}</span>
							</MkA>
							<MkA v-if="isFollowingVisibleForMe(user)" :to="userPage(user, 'following')">
								<b>{{ number(user.followingCount) }}</b>
								<span>{{ i18n.ts.following }}</span>
							</MkA>
							<MkA v-if="isFollowersVisibleForMe(user)" :to="userPage(user, 'followers')">
								<b>{{ number(user.followersCount) }}</b>
								<span>{{ i18n.ts.followers }}</span>
							</MkA>
						</div>
					</div>
				</div>

				<div class="contents _gaps">
					<div v-if="user.pinnedNotes.length > 0" class="_gaps">
						<MkNote v-for="note in user.pinnedNotes" :key="note.id" class="note _panel" :note="note" :pinned="true"/>
					</div>
					<MkInfo v-else-if="$i && $i.id === user.id">{{ i18n.ts.userPagePinTip }}</MkInfo>
					<template v-if="narrow">
						<MkLazy>
							<XFiles :key="user.id" :user="user" @showMore="emit('showMoreFiles')"/>
						</MkLazy>
						<MkLazy>
							<XActivity :key="user.id" :user="user"/>
						</MkLazy>
					</template>
					<div v-if="!disableNotes">
						<MkLazy>
							<XTimeline :user="user"/>
						</MkLazy>
					</div>
				</div>
			</div>
			<div v-if="!narrow" class="sub _gaps" style="container-type: inline-size;">
				<XFiles :key="user.id" :user="user" @showMore="emit('showMoreFiles')"/>
				<XActivity :key="user.id" :user="user"/>
			</div>
		</div>
	</div>
</component>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, computed, onMounted, onUnmounted, onActivated, onDeactivated, nextTick, watch, ref, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import { getScrollContainer } from '@shared/utility/scroll.js';
import MkNote from '@/features/notes/components/MkNote.vue';
import MkFollowButton from '@/features/users/components/MkFollowButton.vue';
import MkAccountMoved from '@/features/users/components/MkAccountMoved.vue';
import MkFukidashi from '@/components/overlay/MkFukidashi.vue';
import MkRemoteCaution from '@/features/users/components/MkRemoteCaution.vue';
import MkTextarea from '@/components/form/MkTextarea.vue';
import MkOmit from '@/components/layout/MkOmit.vue';
import MkInfo from '@/components/display/MkInfo.vue';
import MkButton from '@/components/form/MkButton.vue';
import { getUserMenu } from '@/features/users/get-user-menu.js';
import number from '@/filters/number.js';
import { userPage } from '@/filters/user.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { $i, iAmModerator } from '@/i.js';
import { dateString } from '@/filters/date.js';
import { confetti } from '@/utility/confetti.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { isFollowingVisibleForMe, isFollowersVisibleForMe } from '@/features/users/is-ff-visible-for-me.js';
import { useRouter } from '@/router.js';
import { getStaticImageUrl } from '@/utility/media-proxy.js';
import MkSparkle from '@/components/effects/MkSparkle.vue';
import { prefer } from '@/preferences.js';
import MkPullToRefresh from '@/components/layout/MkPullToRefresh.vue';
import { isBirthday } from '@/features/users/is-birthday.js';

function calcAge(birthdate: string): number {
	const date = new Date(birthdate);
	const now = new Date();

	let yearDiff = now.getFullYear() - date.getFullYear();
	const monthDiff = now.getMonth() - date.getMonth();
	const pastDate = now.getDate() < date.getDate();

	if (monthDiff < 0 || (monthDiff === 0 && pastDate)) {
		yearDiff--;
	}

	return yearDiff;
}

const XFiles = defineAsyncComponent(() => import('./index/files.vue'));
const XActivity = defineAsyncComponent(() => import('./index/activity.vue'));
const XTimeline = defineAsyncComponent(() => import('./index/timeline.vue'));

const props = withDefaults(defineProps<{
	user: Misskey.entities.UserDetailed;
	/** Test only; MkNotesTimeline currently causes problems in vitest */
	disableNotes?: boolean;
}>(), {
	disableNotes: false,
});

const emit = defineEmits<{
	(ev: 'showMoreFiles'): void;
}>();

const router = useRouter();

const user = ref(props.user);
const narrow = ref<null | boolean>(null);
const rootEl = useTemplateRef('rootEl');
const bannerEl = useTemplateRef('bannerEl');
const memoTextareaEl = useTemplateRef('memoTextareaEl');
const memoDraft = ref(props.user.memo);
const isEditingMemo = ref(false);
const moderationNote = ref(props.user.moderationNote ?? '');
const editModerationNote = ref(false);

watch(moderationNote, async () => {
	await misskeyApi('admin/update-user-note', { userId: props.user.id, text: moderationNote.value });
});

const style = computed(() => {
	if (props.user.bannerUrl == null) return {};
	if (prefer.disableShowingAnimatedImages) {
		return {
			backgroundImage: `url(${ getStaticImageUrl(props.user.bannerUrl) })`,
		};
	} else {
		return {
			backgroundImage: `url(${ props.user.bannerUrl })`,
		};
	};
});

const age = computed(() => {
	return props.user.birthday ? calcAge(props.user.birthday) : Number.NaN;
});

function menu(ev: PointerEvent) {
	const { menu, cleanup } = getUserMenu(user.value, router);
	os.popupMenu(menu, ev.currentTarget ?? ev.target).finally(cleanup);
}

function showMemoTextarea() {
	isEditingMemo.value = true;
	nextTick(() => {
		memoTextareaEl.value?.focus();
	});
}

function adjustMemoTextarea() {
	if (!memoTextareaEl.value) return;
	memoTextareaEl.value.style.height = '0px';
	memoTextareaEl.value.style.height = `${memoTextareaEl.value.scrollHeight}px`;
}

async function updateMemo() {
	await misskeyApi('users/update-memo', {
		memo: memoDraft.value,
		userId: props.user.id,
	});
	isEditingMemo.value = false;
}

watch([props.user], () => {
	memoDraft.value = props.user.memo;
});

async function reload() {
	// TODO: Pull-to-refresh時に表示内容を再取得する
}

let bannerParallaxResizeObserver: ResizeObserver | null = null;

function calcBannerParallax() {
	if (!bannerEl.value || !CSS.supports('view-timeline-inset', 'auto 100px')) return;
	const elRect = bannerEl.value.getBoundingClientRect();
	const scrollEl = getScrollContainer(bannerEl.value);
	const scrollPosition = scrollEl?.scrollTop ?? window.scrollY;
	const scrollContainerHeight = scrollEl?.clientHeight ?? window.innerHeight;
	const scrollContainerTop = scrollEl?.getBoundingClientRect().top ?? 0;
	const top = scrollPosition + elRect.top - scrollContainerTop;
	const bottom = scrollContainerHeight - top;
	bannerEl.value.style.setProperty('--bannerParallaxInset', `auto ${bottom}px`);
}

function initCalcBannerParallax() {
	const scrollEl = bannerEl.value ? getScrollContainer(bannerEl.value) : null;
	if (scrollEl != null && CSS.supports('view-timeline-inset', 'auto 100px')) {
		bannerParallaxResizeObserver = new ResizeObserver(() => {
			calcBannerParallax();
		});
		bannerParallaxResizeObserver.observe(scrollEl);
	}
}

function disposeBannerParallaxResizeObserver() {
	if (bannerParallaxResizeObserver) {
		bannerParallaxResizeObserver.disconnect();
		bannerParallaxResizeObserver = null;
	}
}

let narrowResizeObserver: ResizeObserver | null = null;

onMounted(() => {
	// rootEl自身の幅はnarrow値 (spacerの--MI_SPACER-w) に依存しフィードバックループになるため、
	// spacerの親 (キャップされていないコンテナ) を計測・観測する
	const narrowMeasureEl = rootEl.value?.parentElement?.parentElement ?? rootEl.value;
	const updateNarrow = () => {
		// keep-alive非活性時はROが0サイズを報告するため無視する
		if (narrowMeasureEl && window.document.body.contains(narrowMeasureEl)) narrow.value = narrowMeasureEl.clientWidth < 1000;
	};
	updateNarrow();
	narrowResizeObserver = new ResizeObserver(updateNarrow);
	if (narrowMeasureEl) narrowResizeObserver.observe(narrowMeasureEl);

	if (isBirthday(user.value)) {
		confetti({
			duration: 1000 * 4,
		});
	}

	nextTick(() => {
		calcBannerParallax();
		adjustMemoTextarea();
	});

	initCalcBannerParallax();
});

onActivated(() => {
	if (bannerEl.value) {
		calcBannerParallax();
		initCalcBannerParallax();
	}
});

onUnmounted(() => {
	disposeBannerParallaxResizeObserver();
	narrowResizeObserver?.disconnect();
	narrowResizeObserver = null;
});
onDeactivated(disposeBannerParallaxResizeObserver);
</script>

<style lang="scss" scoped>
.ftskorzw {

	> .main {

		> .punished {
			font-size: 0.8em;
			padding: 16px;
		}

		> .profile {

			> .main {
				position: relative;
				overflow: clip;

				> .banner-container {
					position: relative;
					--bannerHeight: 250px;
					height: var(--bannerHeight);
					overflow: clip;

					> .banner {
						width: 100%;
						height: 100%;
						background-size: cover;
						/* バナー未設定時のフォールバック (Erebiaブランドの黄昏グラデーション)。画像があればinline styleのbackground-imageが優先される */
						background-color: #121320;
						background-image: linear-gradient(135deg, #34366b 0%, #1e1f3a 45%, #121320 100%);
						background-repeat: repeat-y;
						background-position-x: center;
						background-position-y: 50%;
						will-change: background-position-y;
					}

					> .fade {
						position: absolute;
						bottom: 0;
						left: 0;
						width: 100%;
						height: 110px;
						background: linear-gradient(transparent, rgba(#000, 0.7));
					}

					> .followed {
						position: absolute;
						top: 12px;
						left: 12px;
						padding: 4px 8px;
						color: #fff;
						background: rgba(0, 0, 0, 0.7);
						font-size: 0.7em;
						border-radius: var(--MI-radius-sm);
					}

					> .actions {
						position: absolute;
						top: 12px;
						right: 12px;
						-webkit-backdrop-filter: var(--MI-blur, blur(8px));
						backdrop-filter: var(--MI-blur, blur(8px));
						background: rgba(0, 0, 0, 0.2);
						padding: 8px;
						border-radius: var(--MI-radius-lg);

						> .menu {
							vertical-align: bottom;
							height: 31px;
							width: 31px;
							color: #fff;
							text-shadow: 0 0 8px #000;
							font-size: 16px;
						}

						> .koudoku {
							margin-left: 4px;
							vertical-align: bottom;
						}
					}

					> .title {
						position: absolute;
						bottom: 0;
						left: 0;
						width: 100%;
						padding: 0 0 8px 154px;
						box-sizing: border-box;
						color: #fff;

						> .name {
							display: block;
							margin: -10px;
							padding: 10px;
							line-height: 32px;
							font-weight: bold;
							font-size: 1.8em;
							filter: drop-shadow(0 0 4px #000);
						}

						> .bottom {
							> * {
								display: inline-block;
								margin-right: 16px;
								line-height: 20px;
								opacity: 0.8;
								text-shadow: 0 0 8px #000;

								&.username {
									font-weight: bold;
								}
							}

							> .add-note-button {
								background: rgba(0, 0, 0, 0.2);
								color: #fff;
								-webkit-backdrop-filter: var(--MI-blur, blur(8px));
								backdrop-filter: var(--MI-blur, blur(8px));
								border-radius: var(--MI-radius-lg);
								padding: 4px 8px;
								font-size: 80%;
							}
						}
					}
				}

				> .title {
					display: none;
					text-align: center;
					padding: 50px 8px 16px 8px;
					font-weight: bold;
					border-bottom: solid 0.5px var(--MI_THEME-divider);

					> .name {
						display: block;
						font-size: 1.2em;
						line-height: 1.4;
					}

					> .bottom {
						display: flex;
						flex-wrap: wrap;
						justify-content: center;
						align-items: center;
						gap: 8px;

						> * {
							display: inline-block;
							min-width: 0;
							max-width: 100%;
							overflow: hidden;
							text-overflow: ellipsis;
							opacity: 0.8;
						}
					}
				}

				> .avatar {
					display: block;
					position: absolute;
					top: 170px;
					left: 16px;
					z-index: 2;
					width: 120px;
					height: 120px;
					box-shadow: 1px 1px 3px rgba(#000, 0.2);
				}

				> .followedMessage {
					padding: 24px 24px 0 154px;

					> .fukidashi {
						display: block;
						--fukidashi-bg: color-mix(in srgb, var(--MI_THEME-accent), var(--MI_THEME-panel) 85%);
						font-size: 0.9em;

						.messageHeader {
							opacity: 0.7;
							font-size: 0.85em;
						}
					}
				}

				> .roles {
					padding: 24px 24px 0 154px;
					font-size: 0.95em;
					display: flex;
					flex-wrap: wrap;
					gap: 8px;

					> .role {
						border: solid 1px var(--color, var(--MI_THEME-divider));
						border-radius: 999px;
						padding: 3px 8px;
					}
				}

				> .moderationNote {
					margin: 12px 24px 0 154px;
				}

				> .memo {
					margin: 12px 24px 0 154px;
					background: transparent;
					color: var(--MI_THEME-fg);
					border: 1px solid var(--MI_THEME-divider);
					border-radius: var(--MI-radius-md);
					padding: 8px;
					line-height: 0;

					&:focus-within {
						border-color: var(--MI_THEME-accent);
					}

					> .heading {
						text-align: left;
						color: color(from var(--MI_THEME-fg) srgb r g b / 0.5);
						line-height: 1.5;
						font-size: 85%;
					}

					textarea {
						margin: 0;
						padding: 0;
						resize: none;
						border: none;
						outline: none;
						width: 100%;
						height: auto;
						min-height: 0;
						line-height: 1.5;
						color: var(--MI_THEME-fg);
						overflow: hidden;
						background: transparent;
						font-family: inherit;
					}
				}

				> .description {
					padding: 24px 24px 24px 154px;
					font-size: 0.95em;

					> .empty {
						margin: 0;
						opacity: 0.5;
					}
				}

				> .fields {
					display: flex;
					flex-direction: column;
					gap: 8px;
					padding: 24px;
					font-size: 0.9em;
					border-top: solid 0.5px var(--MI_THEME-divider);

					> .field {
						display: flex;
						padding: 0;
						margin: 0;
						align-items: center;

						> .name {
							width: 130px;
							flex-shrink: 0;
							box-sizing: border-box;
							overflow: hidden;
							white-space: nowrap;
							text-overflow: ellipsis;
							font-weight: bold;

							/* 行頭アイコンはラベル文字より一段沈めてマーカーとして扱う */
							> i {
								opacity: 0.6;
							}
						}

						> .value {
							flex: 1;
							min-width: 0;
							overflow: hidden;
							white-space: nowrap;
							text-overflow: ellipsis;
							margin: 0;
						}
					}

				}

				> .status {
					display: flex;
					padding: 16px 24px;
					border-top: solid 0.5px var(--MI_THEME-divider);

					> a {
						flex: 1;
						padding: 8px 0;
						text-align: center;

						&.active {
							color: var(--MI_THEME-accent);
						}

						&:hover {
							text-decoration: none;
						}

						> b {
							display: block;
							font-size: 1.2em;
							line-height: 1.3;
						}

						> span {
							font-size: 70%;
							opacity: 0.7;
						}
					}
				}
			}
		}

		> .contents {
			> .content {
				margin-bottom: var(--MI-margin);
			}
		}
	}

	&.wide {
		display: flex;
		width: 100%;

		> .main {
			width: 100%;
			min-width: 0;
		}

		> .sub {
			max-width: 350px;
			min-width: 350px;
			margin-left: var(--MI-margin);
		}
	}
}

@container (max-width: 500px) {
	.ftskorzw {
		> .main {
			> .profile > .main {
				> .banner-container {
					--bannerHeight: 140px;
					height: var(--bannerHeight);

					> .fade {
						display: none;
					}

					> .title {
						display: none;
					}
				}

				> .title {
					display: block;
				}

				> .avatar {
					top: 90px;
					left: 0;
					right: 0;
					width: 92px;
					height: 92px;
					margin: auto;
				}

				> .followedMessage {
					padding: 16px 16px 0 16px;
				}

				> .roles {
					padding: 16px 16px 0 16px;
					justify-content: center;
				}

				> .moderationNote {
					margin: 16px 16px 0 16px;
				}

				> .memo {
					margin: 16px 16px 0 16px;
				}

				> .description {
					padding: 16px;
				}

				> .fields {
					padding: 16px;
				}

				> .status {
					padding: 16px;
				}
			}

			> .contents {
				> .nav {
					font-size: 80%;
				}
			}
		}
	}
}

@supports (view-timeline-name: --name) {
	.ftskorzw {
		> .main {
			> .profile > .main {
				> .banner-container {
					view-timeline-name: --bannerParallax;
					view-timeline-inset: var(--bannerParallaxInset, auto);
					view-timeline-axis: block;

					> .banner {
						animation: bannerParallaxKeyframes linear both;
						animation-timeline: --bannerParallax;
						animation-range: cover;
					}
				}
			}
		}
	}
}

@keyframes bannerParallaxKeyframes {
	from {
		background-position-y: 50%;
	}
	to {
		background-position-y: calc(50% + var(--bannerHeight, 250px) / 3);
	}
}
</style>

<style lang="scss" module>
.tl {
	background: var(--MI_THEME-bg);
	border-radius: var(--MI-radius);
	overflow: clip;
}

.verifiedLink {
	margin-left: 4px;
	color: var(--MI_THEME-success);
}
</style>
