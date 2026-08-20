/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

interface LocaleRecord {
	[key: string]: unknown;
}

interface VerificationErrorData {
	expected?: string;
	actual?: string;
	parameter?: string;
}

export interface VerificationError {
	type: 'mismatched_type' | 'missing_parameter';
	lang: string;
	tree: string;
	data: VerificationErrorData;
}

function isLocaleRecord(value: unknown): value is LocaleRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valueType(value: unknown): string {
	if (Array.isArray(value)) return 'array';
	if (value === null) return 'null';
	return typeof value;
}

function verify(expected: LocaleRecord, actual: LocaleRecord, lang: string, errors: VerificationError[], trace?: string): void {
	for (const key in expected) {
		if (!Object.prototype.hasOwnProperty.call(actual, key)) {
			continue;
		}

		const expectedValue = expected[key];
		const actualValue = actual[key];
		const tree = trace ? `${trace}.${key}` : key;

		if (isLocaleRecord(expectedValue)) {
			if (!isLocaleRecord(actualValue)) {
				errors.push({ type: 'mismatched_type', lang, tree, data: { expected: 'object', actual: valueType(actualValue) } });
				continue;
			}
			verify(expectedValue, actualValue, lang, errors, tree);
		} else if (typeof expectedValue === 'string') {
			if (typeof actualValue !== 'string') {
				errors.push({ type: 'mismatched_type', lang, tree, data: { expected: 'string', actual: valueType(actualValue) } });
				continue;
			}

			const expectedParameters = new Set(expectedValue.match(/\{[^}]+\}/g)?.map((s) => s.slice(1, -1)));
			const actualParameters = new Set(actualValue.match(/\{[^}]+\}/g)?.map((s) => s.slice(1, -1)));
			for (const parameter of expectedParameters) {
				if (!actualParameters.has(parameter)) {
					errors.push({ type: 'missing_parameter', lang, tree, data: { parameter } });
				}
			}
		}
	}
}

export function verifyLocales(locales: Record<string, LocaleRecord>): VerificationError[] {
	const original = locales['ja-JP'];
	if (original === undefined) throw new Error('The ja-JP locale was not found.');

	const errors: VerificationError[] = [];
	for (const [lang, locale] of Object.entries(locales)) {
		if (lang !== 'ja-JP') verify(original, locale, lang, errors);
	}
	return errors;
}

export function runVerification(
	locales: Record<string, LocaleRecord>,
	writeError: (error: VerificationError) => void = (error) => process.stderr.write(`${JSON.stringify(error)}\n`),
): number {
	const errors = verifyLocales(locales);
	for (const error of errors) writeError(error);
	return errors.length > 0 ? 1 : 0;
}

export async function loadBuiltLocales(): Promise<Record<string, LocaleRecord>> {
	const { locales } = await import('../built/index.js');
	return locales as Record<string, LocaleRecord>;
}

if (import.meta.main) {
	process.exitCode = runVerification(await loadBuiltLocales());
}
