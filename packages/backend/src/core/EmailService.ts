/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { promises as dns } from 'node:dns';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import juice from 'juice';
import disposableEmailDomains from 'disposable-email-domains';
import { UtilityService } from '@/core/UtilityService.js';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/_.js';
import { LoggerService } from '@/core/LoggerService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { countVerifiedUserProfilesByEmailFromDatabase } from '@/core/UserProfileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

const disposableEmailDomainsSet = new Set(disposableEmailDomains);

/**
 * deep-email-validator の validateDisposable + validateMx 相当。
 * 使い捨てドメインリストとの照合と、MX レコードが引けるかどうかを検査する。
 */
async function validateEmailDeliverability(emailAddress: string): Promise<{
	valid: boolean;
	reason: 'disposable' | 'mx' | null;
}> {
	const domain = emailAddress.split('@')[1]?.toLowerCase();
	if (!domain) {
		return { valid: false, reason: 'mx' };
	}

	if (disposableEmailDomainsSet.has(domain)) {
		return { valid: false, reason: 'disposable' };
	}

	try {
		const records = await dns.resolveMx(domain);
		if (records.length === 0) {
			return { valid: false, reason: 'mx' };
		}
	} catch {
		return { valid: false, reason: 'mx' };
	}

	return { valid: true, reason: null };
}

export function createEmailService(
	config: Config,
	meta: MiMeta,
	drizzle: MiDrizzleDatabase,
	loggerService: LoggerService,
	utilityService: UtilityService,
	httpRequestService: HttpRequestService,
) {
	const logger = loggerService.getLogger('email');

	async function sendEmail(to: string, subject: string, html: string, text: string) {
		if (!meta.enableEmail) return;

		const iconUrl = `${config.instance.url}/static-assets/mi-white.png`;
		const emailSettingUrl = `${config.instance.url}/settings/email`;

		const enableAuth = meta.smtpUser != null && meta.smtpUser !== '';

		// `proxy` は @types/nodemailer の SMTPTransport.Options に無いが、実際の nodemailer は
		// (nodemailer-proxy 経由で) サポートしている型定義側の欠落なので、ここだけ拡張して型を保つ。
		const options: nodemailer.TransportOptions & SMTPTransport.Options & { proxy?: string } = {
			...(meta.smtpHost == null ? {} : { host: meta.smtpHost }),
			...(meta.smtpPort == null ? {} : { port: meta.smtpPort }),
			secure: meta.smtpSecure,
			ignoreTLS: !enableAuth,
			...(config.outboundNetwork.proxy.smtpUrl == null ? {} : { proxy: config.outboundNetwork.proxy.smtpUrl }),
			...(enableAuth ? {
				auth: {
					user: meta.smtpUser ?? '',
					...(meta.smtpPass == null ? {} : { pass: meta.smtpPass }),
				},
			} : {}),
		};
		const transporter = nodemailer.createTransport(options);

		const htmlContent = `<!doctype html>
<html>
	<head>
		<meta charset="utf-8">
		<title>${ subject }</title>
		<style>
			html {
				background: #eee;
			}

			body {
				padding: 16px;
				margin: 0;
				font-family: sans-serif;
				font-size: 14px;
			}

			a {
				text-decoration: none;
				color: #5c62d8;
			}
			a:hover {
				text-decoration: underline;
			}

			main {
				max-width: 500px;
				margin: 0 auto;
				background: #fff;
				color: #555;
			}
				main > header {
					padding: 32px;
					background: #191b2e;
				}
					main > header > img {
						max-width: 128px;
						max-height: 28px;
						vertical-align: bottom;
					}
				main > article {
					padding: 32px;
				}
					main > article > h1 {
						margin: 0 0 1em 0;
					}
				main > footer {
					padding: 32px;
					border-top: solid 1px #eee;
				}

			nav {
				box-sizing: border-box;
				max-width: 500px;
				margin: 16px auto 0 auto;
				padding: 0 32px;
			}
				nav > a {
					color: #888;
				}
		</style>
	</head>
	<body>
		<main>
			<header>
				<img src="${ meta.logoImageUrl ?? meta.iconUrl ?? iconUrl }"/>
			</header>
			<article>
				<h1>${ subject }</h1>
				<div>${ html }</div>
			</article>
			<footer>
				<a href="${ emailSettingUrl }">${ 'Email setting' }</a>
			</footer>
		</main>
		<nav>
			<a href="${ config.instance.url }">${ config.runtime.host }</a>
		</nav>
	</body>
</html>`;

		const inlinedHtml = juice(htmlContent);

		try {
			// TODO: htmlサニタイズ
			const info = await transporter.sendMail({
				from: meta.name ? {
					name: meta.name,
					address: meta.email!,
				} : meta.email!,
				to: to,
				subject: subject,
				text: text,
				html: inlinedHtml,
			});

			logger.info(`Message sent: ${info.messageId}`);
		} catch (err) {
			logger.error(err as Error);
			throw err;
		}
	}

	async function validateEmailForAccount(emailAddress: string): Promise<{
		available: boolean;
		reason: null | 'used' | 'format' | 'disposable' | 'mx' | 'smtp' | 'banned' | 'network' | 'blacklist';
	}> {
		if (!utilityService.validateEmailFormat(emailAddress)) {
			return {
				available: false,
				reason: 'format',
			};
		}

		const exist = await countVerifiedUserProfilesByEmailFromDatabase(drizzle, emailAddress);

		if (exist !== 0) {
			return {
				available: false,
				reason: 'used',
			};
		}

		let validated: {
			valid: boolean,
			reason?: string | null,
		} = { valid: true, reason: null };

		if (meta.enableActiveEmailValidation) {
			if (meta.enableVerifymailApi && meta.verifymailAuthKey != null) {
				validated = await verifyMail(emailAddress, meta.verifymailAuthKey);
			} else if (meta.enableTruemailApi && meta.truemailInstance && meta.truemailAuthKey != null) {
				validated = await trueMail(meta.truemailInstance, emailAddress, meta.truemailAuthKey);
			} else {
				// 従来 deep-email-validator に相当する検査 (regex は validateEmailFormat で確認済)。
				// SMTP 検査は日本だと25ポートが殆どのプロバイダーで塞がれていてタイムアウトになるのでしない
				validated = await validateEmailDeliverability(emailAddress);
			}
		}

		if (!validated.valid) {
			const formatReason: Record<string, 'format' | 'disposable' | 'mx' | 'smtp' | 'network' | 'blacklist' | undefined> = {
				regex: 'format',
				disposable: 'disposable',
				mx: 'mx',
				smtp: 'smtp',
				network: 'network',
				blacklist: 'blacklist',
			};

			return {
				available: false,
				reason: validated.reason ? formatReason[validated.reason] ?? null : null,
			};
		}

		const emailDomain = emailAddress.slice(emailAddress.lastIndexOf('@') + 1);
		const isBanned = utilityService.isBlockedHost(meta.bannedEmailDomains, emailDomain);

		if (isBanned) {
			return {
				available: false,
				reason: 'banned',
			};
		}

		return {
			available: true,
			reason: null,
		};
	}

	async function verifyMail(emailAddress: string, verifymailAuthKey: string): Promise<{
		valid: boolean;
		reason: 'used' | 'format' | 'disposable' | 'mx' | 'smtp' | null;
	}> {
		const endpoint = 'https://verifymail.io/api/' + emailAddress + '?key=' + verifymailAuthKey;
		const res = await httpRequestService.send(endpoint, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Accept: 'application/json, */*',
			},
		});

		const json = (await res.json()) as Partial<{
			message: string;
			block: boolean;
			catch_all: boolean;
			deliverable_email: boolean;
			disposable: boolean;
			domain: string;
			email_address: string;
			email_provider: string;
			mx: boolean;
			mx_fallback: boolean;
			mx_host: string[];
			mx_ip: string[];
			mx_priority: { [key: string]: number };
			privacy: boolean;
			related_domains: string[];
		}>;

		/* api error: when there is only one `message` attribute in the returned result */
		if (Object.keys(json).length === 1 && Reflect.has(json, 'message')) {
			return {
				valid: false,
				reason: null,
			};
		}
		if (json.email_address === undefined) {
			return {
				valid: false,
				reason: 'format',
			};
		}
		if (json.deliverable_email !== undefined && !json.deliverable_email) {
			return {
				valid: false,
				reason: 'smtp',
			};
		}
		if (json.disposable) {
			return {
				valid: false,
				reason: 'disposable',
			};
		}
		if (json.mx !== undefined && !json.mx) {
			return {
				valid: false,
				reason: 'mx',
			};
		}

		return {
			valid: true,
			reason: null,
		};
	}

	async function trueMail<T>(truemailInstance: string, emailAddress: string, truemailAuthKey: string): Promise<{
		valid: boolean;
		reason: 'used' | 'format' | 'blacklist' | 'mx' | 'smtp' | 'network' | T | null;
	}> {
		const endpoint = truemailInstance + '?email=' + emailAddress;
		try {
			const res = await httpRequestService.send(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
					Authorization: truemailAuthKey,
				},
				isLocalAddressAllowed: true,
			});

			const json = (await res.json()) as {
				email: string;
				success: boolean;
				error?: string;
				errors?: {
					list_match?: string;
					regex?: string;
					mx?: string;
					smtp?: string;
				} | null;
			};

			if (json.email === undefined || json.errors?.regex) {
				return {
					valid: false,
					reason: 'format',
				};
			}
			if (json.errors?.smtp) {
				return {
					valid: false,
					reason: 'smtp',
				};
			}
			if (json.errors?.mx) {
				return {
					valid: false,
					reason: 'mx',
				};
			}
			if (!json.success) {
				return {
					valid: false,
					reason: json.errors?.list_match as T || 'blacklist',
				};
			}

			return {
				valid: true,
				reason: null,
			};
		} catch (_) {
			return {
				valid: false,
				reason: 'network',
			};
		}
	}

	return { sendEmail, validateEmailForAccount };
}

export type EmailService = ReturnType<typeof createEmailService>;
