/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { CellValue, GridCell } from '@/components/grid/cell.js';
import type { GridColumn } from '@/components/grid/column.js';
import type { GridRow } from '@/components/grid/row.js';
import { i18n } from '@/i18n.js';

type ValidatorParams = {
	column: GridColumn;
	row: GridRow;
	value: CellValue;
	allCells: GridCell[];
};

type ValidatorResult = {
	valid: boolean;
	message?: string;
};

export type GridCellValidator = {
	name?: string;
	ignoreViolation?: boolean;
	validate: (params: ValidatorParams) => ValidatorResult;
};

export type ValidateViolation = {
	valid: boolean;
	params: ValidatorParams;
	violations: ValidateViolationItem[];
};

type ValidateViolationItem = {
	valid: boolean;
	validator: GridCellValidator;
	result: ValidatorResult;
};

/**
 * 列ごとに、値 → その値を持つ行の index。unique の検査でセルごとに全セルを走査すると行数の 2 乗になる
 * (1,000 行 8 列で 1 回の検証に 66 ms、3,000 行で 370 ms)。MkGrid は検証のたびに allCells を作り直し、
 * 検証中はセルの値を変えないので、配列ごとに 1 回だけ作る。
 */
const valueIndexes = new WeakMap<GridCell[], Map<string, Map<CellValue, number[]>>>();

function valueIndexOf(allCells: GridCell[]): Map<string, Map<CellValue, number[]>> {
	let index = valueIndexes.get(allCells);
	if (index != null) return index;
	index = new Map();
	for (const cell of allCells) {
		const bindTo = cell.column.setting.bindTo;
		let byValue = index.get(bindTo);
		if (byValue == null) {
			byValue = new Map();
			index.set(bindTo, byValue);
		}
		const rows = byValue.get(cell.value);
		if (rows == null) byValue.set(cell.value, [cell.row.index]);
		else rows.push(cell.row.index);
	}
	valueIndexes.set(allCells, index);
	return index;
}

export function cellValidation(allCells: GridCell[], cell: GridCell, newValue: CellValue): ValidateViolation {
	const { column, row } = cell;
	const validators = column.setting.validators ?? [];

	const params: ValidatorParams = {
		column,
		row,
		value: newValue,
		allCells,
	};

	const violations: ValidateViolationItem[] = validators.map((validator) => {
		const result = validator.validate(params);
		return {
			valid: result.valid,
			validator,
			result,
		};
	});

	return {
		valid: violations.every((v) => v.result.valid),
		params,
		violations,
	};
}

class ValidatorPreset {
	required(): GridCellValidator {
		return {
			name: 'required',
			validate: ({ value }): ValidatorResult => {
				return {
					valid: value !== null && value !== undefined && value !== '',
					message: i18n.ts._gridComponent._error.requiredValue,
				};
			},
		};
	}

	regex(pattern: RegExp): GridCellValidator {
		return {
			name: 'regex',
			validate: ({ value }): ValidatorResult => {
				pattern.lastIndex = 0;
				return {
					valid: typeof value !== 'string' || pattern.test(value),
					message: i18n.tsx._gridComponent._error.patternNotMatch({ pattern: pattern.source }),
				};
			},
		};
	}

	unique(): GridCellValidator {
		return {
			name: 'unique',
			validate: ({ column, row, value, allCells }): ValidatorResult => {
				const rows = valueIndexOf(allCells).get(column.setting.bindTo)?.get(value) ?? [];
				const isUnique = rows.every((index) => index === row.index);
				return {
					valid: isUnique,
					message: i18n.ts._gridComponent._error.notUnique,
				};
			},
		};
	}
}

export const validators = new ValidatorPreset();
