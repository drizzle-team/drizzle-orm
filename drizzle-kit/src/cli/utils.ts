import semver from 'semver';
import {
	OrmVersionCliError,
	RequiredEitherPackagesCliError,
	RequiredPackagesCliError,
	StudioNodeVersionCliError,
} from './errors';

export const assertExists = (it?: any) => {
	if (!it) throw new Error();
};

export const ormVersionGt = async (version: string) => {
	const { npmVersion } = await import('drizzle-orm/version');
	if (!semver.gte(npmVersion, version)) {
		return false;
	}
	return true;
};

export const assertStudioNodeVersion = () => {
	if (semver.gte(process.version, '18.0.0')) return;
	throw new StudioNodeVersionCliError();
};

export const checkPackage = async (it: string) => {
	try {
		await import(it);
		return true;
	} catch {
		return false;
	}
};

export const assertPackages = async (...pkgs: string[]) => {
	try {
		for (let i = 0; i < pkgs.length; i++) {
			const it = pkgs[i];
			await import(it);
		}
	} catch {
		throw new RequiredPackagesCliError(pkgs);
	}
};

// ex: either pg or postgres are needed
export const assertEitherPackage = async (
	...pkgs: string[]
): Promise<string[]> => {
	const availables = [] as string[];
	for (let i = 0; i < pkgs.length; i++) {
		try {
			const it = pkgs[i];
			await import(it);
			availables.push(it);
		} catch {}
	}

	if (availables.length > 0) {
		return availables;
	}
	throw new RequiredEitherPackagesCliError(pkgs);
};

const requiredApiVersion = 14;
export const assertOrmCoreVersion = async () => {
	try {
		const { compatibilityVersion } = await import('drizzle-orm/version');

		await import('drizzle-orm/_relations');

		if (Number(compatibilityVersion) === requiredApiVersion) {
			return;
		}

		if (!compatibilityVersion || compatibilityVersion < requiredApiVersion) {
			throw new OrmVersionCliError(
				'This version of drizzle-kit requires newer version of drizzle-orm\nPlease update drizzle-orm package to the latest version 👍',
				'orm_too_old',
			);
		} else {
			throw new OrmVersionCliError(
				'This version of drizzle-kit is outdated\nPlease update drizzle-kit package to the latest version 👍',
				'kit_outdated',
			);
		}
	} catch {
		throw new OrmVersionCliError('Please install latest version of drizzle-orm', 'orm_missing');
	}
};

export const ormCoreVersions = async () => {
	try {
		const { compatibilityVersion, npmVersion } = await import(
			'drizzle-orm/version'
		);
		return { compatibilityVersion, npmVersion };
	} catch {
		return {};
	}
};

const MAX_ERROR_DEPTH = 5;
const UNKNOWN_ERROR_MESSAGE = 'Unknown error';

const toStringSafe = (it: unknown) => {
	try {
		return String(it);
	} catch {
		return '';
	}
};

/*
	Errors thrown by database drivers are not always `Error` instances with a meaningful `message`:
	- `AggregateError` (node's connection retries, `Promise.any`, etc.) has an empty message and keeps
	  the actual reasons in `errors`
	- wrappers (`DrizzleQueryError`, `QueryError`, `fetch` failures) keep the real error in `cause`
	- drivers may reject with plain objects or strings
	This walks all of them so we never end up with an empty error message.
*/
export const extractErrorMessage = (error: unknown, depth = 0): string => {
	if (error === null || error === undefined) return UNKNOWN_ERROR_MESSAGE;
	if (depth > MAX_ERROR_DEPTH) return UNKNOWN_ERROR_MESSAGE;

	if (typeof error === 'string') return error.trim() || UNKNOWN_ERROR_MESSAGE;
	if (typeof error !== 'object') return toStringSafe(error) || UNKNOWN_ERROR_MESSAGE;

	const it = error as {
		message?: unknown;
		errors?: unknown;
		cause?: unknown;
		name?: unknown;
		code?: unknown;
	};

	const message = typeof it.message === 'string' ? it.message.trim() : '';
	if (message) return message;

	// AggregateError-like: the actual reasons are in `errors`
	if (Array.isArray(it.errors) && it.errors.length > 0) {
		const messages = [
			...new Set(
				it.errors
					.map((e) => extractErrorMessage(e, depth + 1))
					.filter((m) => m !== UNKNOWN_ERROR_MESSAGE),
			),
		];
		if (messages.length > 0) return messages.join('; ');
	}

	if (it.cause !== undefined && it.cause !== null) {
		const causeMessage = extractErrorMessage(it.cause, depth + 1);
		if (causeMessage !== UNKNOWN_ERROR_MESSAGE) return causeMessage;
	}

	if (typeof it.code === 'string' && it.code.trim()) return it.code.trim();

	const name = typeof it.name === 'string' ? it.name.trim() : '';
	if (name) return name;

	const stringified = toStringSafe(error);
	return stringified && stringified !== '[object Object]' ? stringified : UNKNOWN_ERROR_MESSAGE;
};

export type SerializedError = {
	name: string;
	message: string;
	code?: string | number;
	errors?: SerializedError[];
	cause?: SerializedError;
};

/*
	Converts anything that can be thrown into a plain, always serializable object
	with a guaranteed non-empty `message`
*/
export const serializeError = (error: unknown, depth = 0): SerializedError => {
	const message = extractErrorMessage(error, depth);

	if (error === null || typeof error !== 'object' || depth > MAX_ERROR_DEPTH) {
		return {
			name: error instanceof Error ? error.name : 'Error',
			message,
		};
	}

	const it = error as {
		name?: unknown;
		errors?: unknown;
		cause?: unknown;
		code?: unknown;
	};

	const serialized: SerializedError = {
		name: typeof it.name === 'string' && it.name.trim() ? it.name.trim() : 'Error',
		message,
	};

	if (typeof it.code === 'string' || typeof it.code === 'number') {
		serialized.code = it.code;
	}

	if (Array.isArray(it.errors) && it.errors.length > 0) {
		serialized.errors = it.errors.map((e) => serializeError(e, depth + 1));
	}

	if (it.cause !== undefined && it.cause !== null) {
		serialized.cause = serializeError(it.cause, depth + 1);
	}

	return serialized;
};

export class QueryError extends Error {
	constructor(wrapped: unknown, public readonly sql: string, public readonly params: any[]) {
		super(extractErrorMessage(wrapped), { cause: wrapped });
	}
}
