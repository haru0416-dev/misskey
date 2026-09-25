/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { h } from 'vue';
import * as mfm from 'mfm-js';
import * as Misskey from 'misskey-js';
import { host } from '@shared/utility/config.js';
import type { CSSProperties, VNode, SetupContext } from 'vue';
import type { MkABehavior } from '@/components/global/MkA.vue';
import MkUrl from '@/components/global/MkUrl.vue';
import MkTime from '@/components/global/MkTime.vue';
import MkLink from '@/features/link-preview/components/MkLink.vue';
import MkMention from '@/features/users/components/MkMention.vue';
import MkEmoji from '@/components/global/MkEmoji.vue';
import MkCustomEmoji from '@/components/global/MkCustomEmoji.vue';
import { getHashtagMenu } from '@/features/notes/get-hashtag-menu.js';
import MkCode from '@/features/code/components/MkCode.vue';
import MkCodeInline from '@/features/code/components/MkCodeInline.vue';
import MkGoogle from '@/features/search/components/MkGoogle.vue';
import MkSparkle from '@/components/effects/MkSparkle.vue';
import MkA from '@/components/global/MkA.vue';
import { prefer } from '@/preferences.js';
import { mfmFnStyle } from '@shared/utility/mfm-fn-style.js';

const QUOTE_STYLE = `
display: block;
margin: 8px;
padding: 6px 0 6px 12px;
color: var(--MI_THEME-fg);
border-left: solid 3px var(--MI_THEME-fg);
opacity: 0.7;
`
	.split('\n')
	.join(' ');

type MfmProps = {
	text: string;
	plain?: boolean;
	nowrap?: boolean;
	author?: Misskey.entities.UserLite;
	isNote?: boolean;
	emojiUrls?: Record<string, string>;
	rootScale?: number;
	nyaize?: boolean | 'respect';
	parsedNodes?: mfm.MfmNode[] | null;
	enableEmojiMenu?: boolean;
	enableEmojiMenuReaction?: boolean;
	linkNavigationBehavior?: MkABehavior;
};

type MfmEvents = {
	clickEv(id: string): void;
};

export default function (props: MfmProps, { emit }: { emit: SetupContext<MfmEvents>['emit'] }) {
	// functional component では provide を使えないため、linkNavigationBehavior は props で子へ渡す。

	const isNote = props.isNote ?? true;
	const shouldNyaize = props.nyaize ? (props.nyaize === 'respect' ? props.author?.isCat : false) : false;

	if (props.text == null || props.text === '') {
		return;
	}

	const rootAst = props.parsedNodes ?? (props.plain ? mfm.parseSimple : mfm.parse)(props.text);

	const useAnim = prefer.advancedMfm && prefer.animatedMfm;
	const fnStyleOptions = { useAnim, advanced: prefer.advancedMfm };
	let vnodeKey = 0;
	const nextKey = () => vnodeKey++;

	const genEl = (ast: mfm.MfmNode[], scale: number, disableNyaize = false) =>
		ast.flatMap((token): VNode | string | (VNode | string)[] => {
			switch (token.type) {
				case 'text': {
					let text = token.props.text.replaceAll(/\r\n|\r/g, '\n');
					if (!disableNyaize && shouldNyaize) {
						text = Misskey.nyaize(text);
					}

					if (!props.plain) {
						const res: (VNode | string)[] = [];
						for (const t of text.split('\n')) {
							res.push(h('br'));
							res.push(t);
						}
						res.shift();
						return res;
					}
					return [text.replaceAll('\n', ' ')];
				}

				case 'bold': {
					return [h('b', genEl(token.children, scale))];
				}

				case 'strike': {
					return [h('del', genEl(token.children, scale))];
				}

				case 'italic': {
					return h(
						'i',
						{
							style: 'font-style: oblique;',
						},
						genEl(token.children, scale),
					);
				}

				case 'fn': {
					let style: CSSProperties | undefined;
					switch (token.props.name) {
						case 'x2': {
							return h(
								'span',
								{
									class: prefer.advancedMfm ? 'mfm-x2' : '',
								},
								genEl(token.children, scale * 2),
							);
						}
						case 'x3': {
							return h(
								'span',
								{
									class: prefer.advancedMfm ? 'mfm-x3' : '',
								},
								genEl(token.children, scale * 3),
							);
						}
						case 'x4': {
							return h(
								'span',
								{
									class: prefer.advancedMfm ? 'mfm-x4' : '',
								},
								genEl(token.children, scale * 4),
							);
						}
						case 'blur': {
							return h(
								'span',
								{
									class: '_mfm_blur_',
								},
								genEl(token.children, scale),
							);
						}
						case 'rainbow': {
							if (!useAnim) {
								return h(
									'span',
									{
										class: '_mfm_rainbow_fallback_',
									},
									genEl(token.children, scale),
								);
							}
							style = mfmFnStyle('rainbow', token.props.args, fnStyleOptions)?.style;
							break;
						}
						case 'sparkle': {
							if (!useAnim) {
								return genEl(token.children, scale);
							}
							return h(MkSparkle, {}, { default: () => genEl(token.children, scale) });
						}
						case 'ruby': {
							if (token.children.length === 1) {
								const child = token.children[0];
								if (child == null) {
									return [];
								}
								let text = child.type === 'text' ? child.props.text : '';
								if (!disableNyaize && shouldNyaize) {
									text = Misskey.nyaize(text);
								}
								return h('ruby', {}, [text.split(' ')[0], h('rt', text.split(' ')[1])]);
							}
							const rt = token.children.at(-1)!;
							let text = rt.type === 'text' ? rt.props.text : '';
							if (!disableNyaize && shouldNyaize) {
								text = Misskey.nyaize(text);
							}
							return h('ruby', {}, [...genEl(token.children.slice(0, -1), scale), h('rt', text.trim())]);
						}
						case 'unixtime': {
							const child = token.children[0];
							const unixtime = Number.parseInt(child?.type === 'text' ? child.props.text : '', 10);
							return h(
								'span',
								{
									style:
										'display: inline-block; font-size: 90%; border: solid 1px var(--MI_THEME-divider); border-radius: 999px; padding: 4px 10px 4px 6px;',
								},
								[
									h('i', {
										class: 'ti ti-clock',
										style: 'margin-right: 0.25em;',
									}),
									h(MkTime, {
										key: nextKey(),
										time: unixtime * 1000,
										mode: 'detail',
									}),
								],
							);
						}
						case 'clickable': {
							return h(
								'span',
								{
									onClick(ev: PointerEvent): void {
										ev.stopPropagation();
										ev.preventDefault();
										const clickEv = typeof token.props.args['ev'] === 'string' ? token.props.args['ev'] : '';
										emit('clickEv', clickEv);
									},
								},
								genEl(token.children, scale),
							);
						}
						default: {
							const styled = mfmFnStyle(token.props.name, token.props.args, fnStyleOptions);
							if (styled != null) {
								style = styled.style;
								scale = scale * (styled.scaleFactor ?? 1);
							}
						}
					}
					if (style === undefined) {
						return h('span', {}, ['$[', token.props.name, ' ', ...genEl(token.children, scale), ']']);
					}
					return h(
						'span',
						{
							style: { display: 'inline-block', ...style },
						},
						genEl(token.children, scale),
					);
				}

				case 'small': {
					return [
						h(
							'small',
							{
								style: 'opacity: 0.7;',
							},
							genEl(token.children, scale),
						),
					];
				}

				case 'center': {
					return [
						h(
							'div',
							{
								style: 'text-align:center;',
							},
							genEl(token.children, scale),
						),
					];
				}

				case 'url': {
					return [
						h(MkUrl, {
							key: nextKey(),
							url: token.props.url,
							rel: 'nofollow noopener',
							...(props.linkNavigationBehavior === undefined
								? {}
								: { navigationBehavior: props.linkNavigationBehavior }),
						}),
					];
				}

				case 'link': {
					return [
						h(
							MkLink,
							{
								key: nextKey(),
								url: token.props.url,
								rel: 'nofollow noopener',
								...(props.linkNavigationBehavior === undefined
									? {}
									: { navigationBehavior: props.linkNavigationBehavior }),
							},
							{ default: () => genEl(token.children, scale, true) },
						),
					];
				}

				case 'mention': {
					return [
						h(MkMention, {
							key: nextKey(),
							host:
								(token.props.host == null && props.author && props.author.host != null
									? props.author.host
									: token.props.host) ?? host,
							username: token.props.username,
							...(props.linkNavigationBehavior === undefined
								? {}
								: { navigationBehavior: props.linkNavigationBehavior }),
						}),
					];
				}

				case 'hashtag': {
					const hashtag = token.props.hashtag;
					return [
						h(
							MkA,
							{
								key: nextKey(),
								to: isNote ? `/tags/${encodeURIComponent(hashtag)}` : `/user-tags/${encodeURIComponent(hashtag)}`,
								style: 'color:var(--MI_THEME-hashtag);',
								// ハッシュタグはリンクだが「タグ」としての操作も要るので、既定のリンクメニューを差し替える。
								contextMenu: () => getHashtagMenu(hashtag),
								...(props.linkNavigationBehavior === undefined ? {} : { behavior: props.linkNavigationBehavior }),
							},
							{ default: () => `#${hashtag}` },
						),
					];
				}

				case 'blockCode': {
					return [
						h(MkCode, {
							key: nextKey(),
							code: token.props.code,
							...(token.props.lang == null ? {} : { lang: token.props.lang }),
						}),
					];
				}

				case 'inlineCode': {
					return [
						h(MkCodeInline, {
							key: nextKey(),
							code: token.props.code,
						}),
					];
				}

				case 'quote': {
					if (!props.nowrap) {
						return [
							h(
								'div',
								{
									style: QUOTE_STYLE,
								},
								genEl(token.children, scale, true),
							),
						];
					}
					return [
						h(
							'span',
							{
								style: QUOTE_STYLE,
							},
							genEl(token.children, scale, true),
						),
					];
				}

				case 'emojiCode': {
					if (props.author?.host == null) {
						return [
							h(MkCustomEmoji, {
								key: nextKey(),
								name: token.props.name,
								...(props.plain === undefined ? {} : { normal: props.plain }),
								host: null,
								useOriginalSize: scale >= 2.5,
								...(props.enableEmojiMenu === undefined ? {} : { menu: props.enableEmojiMenu }),
								...(props.enableEmojiMenuReaction === undefined ? {} : { menuReaction: props.enableEmojiMenuReaction }),
								fallbackToImage: false,
							}),
						];
					}
					if (props.emojiUrls && props.emojiUrls[token.props.name] == null) {
						return [h('span', `:${token.props.name}:`)];
					}
					return [
						h(MkCustomEmoji, {
							key: nextKey(),
							name: token.props.name,
							...(props.emojiUrls?.[token.props.name] === undefined ? {} : { url: props.emojiUrls[token.props.name] }),
							...(props.plain === undefined ? {} : { normal: props.plain }),
							host: props.author.host,
							useOriginalSize: scale >= 2.5,
							...(props.enableEmojiMenu === undefined ? {} : { menu: props.enableEmojiMenu }),
							menuReaction: false,
						}),
					];
				}

				case 'unicodeEmoji': {
					return [
						h(MkEmoji, {
							key: nextKey(),
							emoji: token.props.emoji,
							...(props.enableEmojiMenu === undefined ? {} : { menu: props.enableEmojiMenu }),
							...(props.enableEmojiMenuReaction === undefined ? {} : { menuReaction: props.enableEmojiMenuReaction }),
						}),
					];
				}

				case 'mathInline': {
					return [h('code', token.props.formula)];
				}

				case 'mathBlock': {
					return [h('code', token.props.formula)];
				}

				case 'search': {
					return [
						h(MkGoogle, {
							key: nextKey(),
							q: token.props.query,
						}),
					];
				}

				case 'plain': {
					return [h('span', genEl(token.children, scale, true))];
				}

				default: {
					// @ts-expect-error 存在しないASTタイプ
					console.error('unrecognized ast type:', token.type);

					return [];
				}
			}
		}) as (VNode | string)[];

	return h(
		'span',
		{
			// https://codeday.me/jp/qa/20190424/690106.html
			style: props.nowrap
				? 'white-space: pre; word-wrap: normal; overflow: hidden; text-overflow: ellipsis;'
				: 'white-space: pre-wrap;',
		},
		genEl(rootAst, props.rootScale ?? 1),
	);
}
