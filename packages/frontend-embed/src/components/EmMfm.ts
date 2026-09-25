/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { h } from 'vue';
import type { CSSProperties, VNode, SetupContext } from 'vue';
import * as mfm from 'mfm-js';
import * as Misskey from 'misskey-js';
import { host } from '@shared/utility/config.js';
import { mfmFnStyle } from '@shared/utility/mfm-fn-style.js';
import EmUrl from '@/components/EmUrl.vue';
import EmTime from '@/components/EmTime.vue';
import EmLink from '@/components/EmLink.vue';
import EmMention from '@/components/EmMention.vue';
import EmEmoji from '@/components/EmEmoji.vue';
import EmCustomEmoji from '@/components/EmCustomEmoji.vue';
import EmA from '@/components/EmA.vue';


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
	emojiUrls?: Record<string, string> | undefined;
	rootScale?: number;
	nyaize?: boolean | 'respect';
	parsedNodes?: mfm.MfmNode[] | null;
};

type MfmEvents = {
	clickEv(id: string): void;
};

export default function (props: MfmProps, { emit }: { emit: SetupContext<MfmEvents>['emit'] }) {
	const isNote = props.isNote ?? true;
	const shouldNyaize = props.nyaize ? (props.nyaize === 'respect' ? props.author?.isCat : false) : false;

	if (props.text == null || props.text === '') {
		return;
	}

	const rootAst = props.parsedNodes ?? (props.plain ? mfm.parseSimple : mfm.parse)(props.text);



	const useAnim = true;
	const fnStyleOptions = { useAnim, advanced: true };
	let vnodeKey = 0;
	// 同じ内容の再描画で子を作り直さないよう、key は描画ごとの連番にする。
	const nextKey = () => vnodeKey++;

	const genEl = (ast: mfm.MfmNode[], scale: number, disableNyaize = false) =>
		ast
			.map((token): VNode | string | (VNode | string)[] => {
				switch (token.type) {
					case 'text': {
						let text = token.props.text.replaceAll(/(\r\n|\n|\r)/g, '\n');
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
										class: 'mfm-x2',
									},
									genEl(token.children, scale * 2),
								);
							}
							case 'x3': {
								return h(
									'span',
									{
										class: 'mfm-x3',
									},
									genEl(token.children, scale * 3),
								);
							}
							case 'x4': {
								return h(
									'span',
									{
										class: 'mfm-x4',
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
								return genEl(token.children, scale);
							}
							case 'ruby': {
								if (token.children.length === 1) {
									const child = token.children[0];
									if (child === undefined) {
										return h('ruby');
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
										h(EmTime, {
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
							h(EmUrl, {
								key: nextKey(),
								url: token.props.url,
								rel: 'nofollow noopener',
							}),
						];
					}

					case 'link': {
						return [
							h(
								EmLink,
								{
									key: nextKey(),
									url: token.props.url,
									rel: 'nofollow noopener',
								},
								genEl(token.children, scale, true),
							),
						];
					}

					case 'mention': {
						return [
							h(EmMention, {
								key: nextKey(),
								host:
									(token.props.host == null && props.author && props.author.host != null
										? props.author.host
										: token.props.host) ?? host,
								username: token.props.username,
							}),
						];
					}

					case 'hashtag': {
						return [
							h(
								EmA,
								{
									key: nextKey(),
									to: isNote
										? `/tags/${encodeURIComponent(token.props.hashtag)}`
										: `/user-tags/${encodeURIComponent(token.props.hashtag)}`,
									style: 'color:var(--MI_THEME-hashtag);',
								},
								`#${token.props.hashtag}`,
							),
						];
					}

					case 'blockCode': {
						return [
							h(
								'code',
								{
									key: nextKey(),
									lang: token.props.lang ?? undefined,
								},
								token.props.code,
							),
						];
					}

					case 'inlineCode': {
						return [
							h(
								'code',
								{
									key: nextKey(),
								},
								token.props.code,
							),
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
								h(EmCustomEmoji, {
									key: nextKey(),
									name: token.props.name,
									normal: props.plain ?? false,
									host: null,
									useOriginalSize: scale >= 2.5,
									fallbackToImage: false,
								}),
							];
						}
						if (props.emojiUrls && props.emojiUrls[token.props.name] == null) {
							return [h('span', `:${token.props.name}:`)];
						}
							const emojiUrl = props.emojiUrls?.[token.props.name];
							return [
								h(EmCustomEmoji, {
									key: nextKey(),
									name: token.props.name,
									...(emojiUrl === undefined ? {} : { url: emojiUrl }),
									normal: props.plain ?? false,
									host: props.author.host,
									useOriginalSize: scale >= 2.5,
								}),
							];
						
					}

					case 'unicodeEmoji': {
						return [
							h(EmEmoji, {
								key: nextKey(),
								emoji: token.props.emoji,
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
							h(
								'div',
								{
									key: nextKey(),
								},
								token.props.query,
							),
						];
					}

					case 'plain': {
						return [h('span', genEl(token.children, scale, true))];
					}

					default: {
						console.error('unrecognized ast:', token);

						return [];
					}
				}
			})
			.flat(Infinity) as (VNode | string)[];

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
