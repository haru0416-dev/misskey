/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import type { IMentionedRemoteUsers } from '@/models/Note.js';
import { escapeHtml } from '@/misc/escape-html.js';
import { intersperse } from '@/misc/prelude/array.js';
import type * as mfm from 'mfm-js';

export function mfmToHtml(
	config: Config,
	nodes: mfm.MfmNode[] | null,
	mentionedRemoteUsers: IMentionedRemoteUsers = [],
	extraHtml: string | null = null,
): string | null {
	if (nodes == null) {
		return null;
	}

	function toHtml(children?: mfm.MfmNode[]): string {
		if (children == null) return '';
		return children.map((x) => handlers[x.type](x)).join('');
	}

	function fnDefault(node: mfm.MfmFn) {
		return `<i>${toHtml(node.children)}</i>`;
	}

	const handlers = {
		bold: (node) => {
			return `<b>${toHtml(node.children)}</b>`;
		},

		small: (node) => {
			return `<small>${toHtml(node.children)}</small>`;
		},

		strike: (node) => {
			return `<del>${toHtml(node.children)}</del>`;
		},

		italic: (node) => {
			return `<i>${toHtml(node.children)}</i>`;
		},

		fn: (node) => {
			switch (node.props.name) {
				case 'unixtime': {
					const child = node.children[0];
					const text = child?.type === 'text' ? child.props.text : '';
					try {
						const date = new Date(Number.parseInt(text, 10) * 1000);
						return `<time datetime="${escapeHtml(date.toISOString())}">${escapeHtml(date.toISOString())}</time>`;
					} catch {
						return fnDefault(node);
					}
				}

				case 'ruby': {
					if (node.children.length === 1) {
						const child = node.children[0];
						const text = child?.type === 'text' ? child.props.text : '';
						const [rubyBase = '', rubyText = ''] = text.split(' ');
						return `<ruby>${escapeHtml(rubyBase)}<rp>(</rp><rt>${escapeHtml(rubyText)}</rt><rp>)</rp></ruby>`;
					} else {
						const rt = node.children.at(-1);

						if (!rt) {
							return fnDefault(node);
						}

						const text = rt.type === 'text' ? rt.props.text : '';
						return `<ruby>${toHtml(node.children.slice(0, node.children.length - 1))}<rp>(</rp><rt>${escapeHtml(text.trim())}</rt><rp>)</rp></ruby>`;
					}
				}

				default: {
					return fnDefault(node);
				}
			}
		},

		blockCode: (node) => {
			return `<pre><code>${escapeHtml(node.props.code)}</code></pre>`;
		},

		center: (node) => {
			return `<div style="text-align: center;">${toHtml(node.children)}</div>`;
		},

		emojiCode: (node) => {
			return `\u200B:${escapeHtml(node.props.name)}:\u200B`;
		},

		unicodeEmoji: (node) => {
			return node.props.emoji;
		},

		hashtag: (node) => {
			return `<a href="${escapeHtml(`${config.instance.url}/tags/${encodeURIComponent(node.props.hashtag)}`)}" rel="tag">#${escapeHtml(node.props.hashtag)}</a>`;
		},

		inlineCode: (node) => {
			return `<code>${escapeHtml(node.props.code)}</code>`;
		},

		mathInline: (node) => {
			return `<code>${escapeHtml(node.props.formula)}</code>`;
		},

		mathBlock: (node) => {
			return `<pre><code>${escapeHtml(node.props.formula)}</code></pre>`;
		},

		link: (node) => {
			try {
				const url = new URL(node.props.url);
				return `<a href="${escapeHtml(url.href)}">${toHtml(node.children)}</a>`;
			} catch {
				return `[${toHtml(node.children)}](${escapeHtml(node.props.url)})`;
			}
		},

		mention: (node) => {
			const { username, host, acct } = node.props;
			const remoteUserInfo = mentionedRemoteUsers.find(
				(remoteUser) =>
					remoteUser.username.toLowerCase() === username.toLowerCase() &&
					remoteUser.host?.toLowerCase() === host?.toLowerCase(),
			);
			const href = remoteUserInfo
				? remoteUserInfo.url
					? remoteUserInfo.url
					: remoteUserInfo.uri
				: `${config.instance.url}/${acct.endsWith(`@${config.instance.url}`) ? acct.substring(0, acct.length - config.instance.url.length - 1) : acct}`;
			try {
				const url = new URL(href);
				return `<a href="${escapeHtml(url.href)}" class="u-url mention">${escapeHtml(acct)}</a>`;
			} catch {
				return escapeHtml(acct);
			}
		},

		quote: (node) => {
			return `<blockquote>${toHtml(node.children)}</blockquote>`;
		},

		text: (node) => {
			if (!node.props.text.match(/[\r\n]/)) {
				return escapeHtml(node.props.text);
			}

			let html = '';
			const lines = node.props.text.split(/\r\n|\r|\n/).map((x) => escapeHtml(x));

			for (const x of intersperse<string>('br', lines)) {
				html += x === 'br' ? '<br />' : x;
			}

			return html;
		},

		url: (node) => {
			try {
				const url = new URL(node.props.url);
				return `<a href="${escapeHtml(url.href)}">${escapeHtml(node.props.url)}</a>`;
			} catch {
				return escapeHtml(node.props.url);
			}
		},

		search: (node) => {
			return `<a href="${escapeHtml(`https://www.google.com/search?q=${encodeURIComponent(node.props.query)}`)}">${escapeHtml(node.props.content)}</a>`;
		},

		plain: (node) => {
			return `<span>${toHtml(node.children)}</span>`;
		},
	} satisfies { [K in mfm.MfmNode['type']]: (node: mfm.NodeType<K>) => string } as {
		[K in mfm.MfmNode['type']]: (node: mfm.MfmNode) => string;
	};

	return `${toHtml(nodes)}${extraHtml ?? ''}`;
}
