/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

function stringifyTarget(target: unknown): string {
	if (typeof target === 'function') {
		return target.name;
	}

	if (target != null && typeof target === 'object' && 'name' in target && typeof target.name === 'string') {
		return target.name;
	}

	return String(target);
}

function stringifyCriteria(criteria: unknown): string {
	try {
		return JSON.stringify(criteria, null, 4);
	} catch {
		return String(criteria);
	}
}

export class EntityNotFoundError extends Error {
	public readonly entityClass: unknown;
	public readonly criteria: unknown;

	constructor(entityClass: unknown, criteria: unknown) {
		super(`Could not find any entity of type "${stringifyTarget(entityClass)}" matching: ${stringifyCriteria(criteria)}`);
		this.name = 'EntityNotFoundError';
		this.entityClass = entityClass;
		this.criteria = criteria;
	}
}

export class UpdateValuesMissingError extends Error {
	constructor() {
		super('Cannot perform update query because update values are not defined. Call "qb.set(...)" method to specify updated values.');
		this.name = 'UpdateValuesMissingError';
	}
}

export function isEntityNotFoundError(error: unknown): boolean {
	return error instanceof EntityNotFoundError
		|| (error instanceof Error && error.name === 'EntityNotFoundError');
}
