/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { URL } from 'node:url';
import * as htmlParser from 'node-html-parser';
import type { Config } from '@/config.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import type { IMentionedRemoteUsers } from '@/models/Note.js';
import { mfmToHtml } from '@/core/MfmToHtml.js';
import type * as mfm from 'mfm-js';

const urlRegex = /^https?:\/\/[\w\/:%#@$&?!()\[\]~.,=+\-]+/;
const urlRegexFull = /^https?:\/\/[\w\/:%#@$&?!()\[\]~.,=+\-]+$/;

export function createMfmService(config: Config) {
	function fromHtml(html: string, hashtagNames?: string[]): string {
		// Pixelfed など一部の AP サーバーは改行だけでなく br タグも使う。
		html = html.replace(/<br\s?\/?>\r?\n/gi, '\n');

		const normalizedHashtagNames =
			hashtagNames == null ? undefined : new Set<string>(hashtagNames.map((x) => normalizeForSearch(x)));

		const doc = htmlParser.parse(`<div>${html}</div>`);

		let text = '';

		for (const n of doc.childNodes) {
			analyze(n);
		}

		return text.trim();

		function getText(node: htmlParser.Node): string {
			if (node instanceof htmlParser.TextNode) return node.textContent;
			if (!(node instanceof htmlParser.HTMLElement)) return '';
			if (node.tagName === 'BR') return '\n';

			if (node.childNodes != null) {
				return node.childNodes.map((n) => getText(n)).join('');
			}

			return '';
		}

		function analyzeChildren(childNodes: htmlParser.Node[] | null): void {
			if (childNodes != null) {
				for (const n of childNodes) {
					analyze(n);
				}
			}
		}

		function analyze(node: htmlParser.Node) {
			if (node instanceof htmlParser.TextNode) {
				text += node.textContent;
				return;
			}

			if (!(node instanceof htmlParser.HTMLElement)) {
				return;
			}

			switch (node.tagName) {
				case 'BR': {
					text += '\n';
					break;
				}

				case 'A': {
					const txt = getText(node);
					const rel = node.attributes['rel'];
					const href = node.attributes['href'];

					if (normalizedHashtagNames && href != null && normalizedHashtagNames.has(normalizeForSearch(txt))) {
						text += txt;
					} else if (txt.startsWith('@') && !(rel != null && rel.startsWith('me '))) {
						const part = txt.split('@');

						if (part.length === 2 && href) {
							const acct = `${txt}@${new URL(href).hostname}`;
							text += acct;
						} else if (part.length === 3) {
							text += txt;
						}
					} else {
						const generateLink = () => {
							if (!href && !txt) {
								return '';
							}
							if (!href) {
								return txt;
							}
							if (!txt || txt === href) {
								// #6383: Missing text node
								if (href.match(urlRegexFull)) {
									return href;
								} else {
									return `<${href}>`;
								}
							}
							if (href.match(urlRegex) && !href.match(urlRegexFull)) {
								return `[${txt}](<${href}>)`; // #6846
							} else {
								return `[${txt}](${href})`;
							}
						};

						text += generateLink();
					}
					break;
				}

				case 'H1': {
					text += '【';
					analyzeChildren(node.childNodes);
					text += '】\n';
					break;
				}

				case 'B':
				case 'STRONG': {
					text += '**';
					analyzeChildren(node.childNodes);
					text += '**';
					break;
				}

				case 'SMALL': {
					text += '<small>';
					analyzeChildren(node.childNodes);
					text += '</small>';
					break;
				}

				case 'S':
				case 'DEL': {
					text += '~~';
					analyzeChildren(node.childNodes);
					text += '~~';
					break;
				}

				case 'I':
				case 'EM': {
					text += '<i>';
					analyzeChildren(node.childNodes);
					text += '</i>';
					break;
				}

				case 'RUBY': {
					let ruby: [string, string][] = [];
					for (const child of node.childNodes) {
						if (child instanceof htmlParser.TextNode && !/\s|\[|\]/.test(child.textContent)) {
							ruby.push([child.textContent, '']);
							continue;
						}

						if (!(child instanceof htmlParser.HTMLElement)) continue;

						if (child.tagName === 'RP') {
							continue;
						}

						if (child.tagName === 'RT' && ruby.length > 0) {
							const rt = getText(child);
							if (/\s|\[|\]/.test(rt)) {
								// rt に空白が含まれる場合は通常のテキストとして扱う。
								ruby = [];
								analyzeChildren(node.childNodes);
								break;
							} else {
								ruby.at(-1)![1] = rt;
								continue;
							}
						}
						// ruby に別の要素が含まれる場合は通常のテキストとして扱う。
						ruby = [];
						analyzeChildren(node.childNodes);
						break;
					}
					for (const [base, rt] of ruby) {
						text += `$[ruby ${base} ${rt}]`;
					}
					break;
				}

				// ブロックコード (<pre><code>)
				case 'PRE': {
					if (
						node.childNodes.length === 1 &&
						node.childNodes[0] instanceof htmlParser.HTMLElement &&
						node.childNodes[0].tagName === 'CODE'
					) {
						text += '\n```\n';
						text += getText(node.childNodes[0]);
						text += '\n```\n';
					} else if (
						node.childNodes.length === 1 &&
						node.childNodes[0] instanceof htmlParser.TextNode &&
						node.childNodes[0].textContent.startsWith('<code>') &&
						node.childNodes[0].textContent.endsWith('</code>')
					) {
						text += '\n```\n';
						text += node.childNodes[0].textContent.slice(6, -7);
						text += '\n```\n';
					} else {
						analyzeChildren(node.childNodes);
					}
					break;
				}

				// インラインコード (<code>)
				case 'CODE': {
					text += '`';
					analyzeChildren(node.childNodes);
					text += '`';
					break;
				}

				case 'BLOCKQUOTE': {
					const t = getText(node);
					if (t) {
						text += '\n> ';
						text += t.split('\n').join('\n> ');
					}
					break;
				}

				case 'P':
				case 'H2':
				case 'H3':
				case 'H4':
				case 'H5':
				case 'H6': {
					text += '\n\n';
					analyzeChildren(node.childNodes);
					break;
				}

				// その他のブロック要素
				case 'DIV':
				case 'HEADER':
				case 'FOOTER':
				case 'ARTICLE':
				case 'LI':
				case 'DT':
				case 'DD': {
					text += '\n';
					analyzeChildren(node.childNodes);
					break;
				}

				default: {
					// インライン要素を含む。
					analyzeChildren(node.childNodes);
					break;
				}
			}
		}
	}

	function toHtml(
		nodes: mfm.MfmNode[] | null,
		mentionedRemoteUsers: IMentionedRemoteUsers = [],
		extraHtml: string | null = null,
	) {
		return mfmToHtml(config, nodes, mentionedRemoteUsers, extraHtml);
	}

	return { fromHtml, toHtml };
}

export type MfmService = ReturnType<typeof createMfmService>;
