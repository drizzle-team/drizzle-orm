// Prisma 7 compatibility — `import { PrismaPg } from '@drizzle-team/postgres/compat-prisma7'`, a drop-in for
// `@prisma/adapter-pg`:
//
//   const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) })
//
// Prisma 7 runs SQL through a driver adapter: queryRaw/executeRaw for standalone statements, and
// startTransaction for a transaction, on which Prisma itself sends COMMIT or ROLLBACK and then calls commit()
// or rollback() only to hand the connection back. So the adapter always knows which is which: standalone
// statements are shared pool queries, pipelined with other callers' on the least-loaded connection (ADR 0020),
// and a transaction holds one connection from BEGIN to commit()/rollback(). This entry imports nothing from
// Prisma: the result, column-type and error shapes are plain data, and Prisma recognises a
// DriverAdapterError by its name and cause.
//
// Results match @prisma/adapter-pg 7.10.1, whose conversions are ported here: rows as arrays; int8 as a
// string; date, time and numeric as server text; timestamp(tz) as ISO text with '+00:00'; timetz without its
// offset; money without its currency sign; json/jsonb as unparsed text; bytea as bytes; arrays element by
// element. The same SQLSTATEs map to the same error kinds, and the same column types are unsupported.
// test/integration/compat-prisma7.test.ts runs both adapters side by side.
import { addBrand } from '../brand.ts';
import { RESULT_FIELDS, resultFields } from '../connection.ts';
import { parseArrayLiteral } from '../decode.ts';
import { Pool } from '../pool.ts';
import type { Decoder, PoolConfig, QueryOptions } from '../types.ts';

const ADAPTER_NAME = '@drizzle-team/postgres/compat-prisma7';
const FIRST_NORMAL_OBJECT_ID = 16384; // user-defined types (enums, domains, …) start here

/** Prisma's ColumnTypeEnum (@prisma/driver-adapter-utils), by value. */
const C = {
	Int32: 0,
	Int64: 1,
	Float: 2,
	Double: 3,
	Numeric: 4,
	Boolean: 5,
	Text: 7,
	Date: 8,
	Time: 9,
	DateTime: 10,
	Json: 11,
	Bytes: 13,
	Uuid: 15,
	Int32Array: 64,
	Int64Array: 65,
	FloatArray: 66,
	DoubleArray: 67,
	NumericArray: 68,
	BooleanArray: 69,
	CharacterArray: 70,
	TextArray: 71,
	DateArray: 72,
	TimeArray: 73,
	DateTimeArray: 74,
	JsonArray: 75,
	BytesArray: 77,
	UuidArray: 78,
} as const;

// Postgres type OID -> Prisma column type, as adapter-pg's fieldToColumnType.
const COLUMN_TYPES = new Map<number, number>([
	[21, C.Int32], // int2
	[23, C.Int32], // int4
	[20, C.Int64], // int8
	[26, C.Int64], // oid
	[700, C.Float],
	[701, C.Double],
	[16, C.Boolean],
	[1082, C.Date],
	[1083, C.Time], // time
	[1266, C.Time], // timetz
	[1114, C.DateTime], // timestamp
	[1184, C.DateTime], // timestamptz
	[1700, C.Numeric],
	[790, C.Numeric], // money
	[114, C.Json],
	[3802, C.Json], // jsonb
	[2950, C.Uuid],
	...[1042, 25, 1043, 1560, 1562, 869, 650, 142, 19].map((oid) => [oid, C.Text] as [number, number]), // bpchar text varchar bit varbit inet cidr xml name
	[17, C.Bytes],
	[1005, C.Int32Array],
	[1007, C.Int32Array],
	[1021, C.FloatArray],
	[1022, C.DoubleArray],
	[1231, C.NumericArray],
	[791, C.NumericArray], // money[]
	[1000, C.BooleanArray],
	[1002, C.CharacterArray], // "char"[]
	...[1014, 1009, 1015, 1563, 1561, 1041, 651, 143].map((oid) => [oid, C.TextArray] as [number, number]),
	[1182, C.DateArray],
	[1183, C.TimeArray],
	[1115, C.DateTimeArray],
	[1185, C.DateTimeArray],
	[199, C.JsonArray],
	[3807, C.JsonArray],
	[1001, C.BytesArray],
	[2951, C.UuidArray],
	[1016, C.Int64Array],
	[1028, C.Int64Array], // oid[]
]);

// Value conversions adapter-pg applies on top of pg's own parsers (its customParsers), as decoder overrides.
const OFFSET = /[+-]\d{2}(:\d{2})?$/;
const text = (b: Buffer) => b.toString('utf8');
const timestamp = (s: string) => `${s.replace(' ', 'T')}+00:00`;
const timestamptz = (s: string) => s.replace(' ', 'T').replace(OFFSET, '+00:00');
const timetz = (s: string) => s.replace(OFFSET, '');
const money = (s: string) => s.slice(1);
const same = (s: string) => s;
const arrayOf = (leaf: (s: string) => unknown): Decoder => {
	const parse = parseArrayLiteral(leaf);
	return (b) => parse(text(b));
};
const DECODERS: Record<number, Decoder> = {
	1082: text, // date, as server text
	1182: arrayOf(same),
	1114: (b) => timestamp(text(b)),
	1115: arrayOf(timestamp),
	1184: (b) => timestamptz(text(b)),
	1185: arrayOf(timestamptz),
	1266: (b) => timetz(text(b)),
	790: (b) => money(text(b)),
	791: arrayOf(money),
	114: text, // json, unparsed
	199: arrayOf(same),
	3802: text, // jsonb, unparsed
	3807: arrayOf(same),
	1561: arrayOf(same), // bit[]
	1563: arrayOf(same), // varbit[]
	143: arrayOf(same), // xml[]
	1041: arrayOf(same), // inet[]
	651: arrayOf(same), // cidr[]
	1002: text, // "char"[]: pg has no parser for it and returns the literal
};

/** One SQL statement as Prisma's query engine hands it over. */
export interface SqlQuery {
	sql: string;
	args: unknown[];
	argTypes: Array<{ scalarType: string; dbType?: string; arity: 'scalar' | 'list' }>;
}
export interface SqlResultSet {
	columnTypes: number[];
	columnNames: string[];
	rows: unknown[][];
	lastInsertId?: string;
}
type IsolationLevel = 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SNAPSHOT' | 'SERIALIZABLE';

export interface PrismaPgOptions {
	/** The schema Prisma queries, reported by getConnectionInfo(), as adapter-pg's option. */
	schema?: string;
	/** A server-side statement name per query (undefined = unnamed), as adapter-pg's option. */
	statementNameGenerator?: (query: SqlQuery) => string | undefined;
	/** Converts values of user-defined types (OID >= 16384), as adapter-pg's option. */
	userDefinedTypeParser?: (oid: number, value: unknown, adapter: PrismaPgQueryable) => Promise<unknown>;
}

/** The error Prisma unwraps into its own error codes: it checks `name` and reads `cause`. */
export class DriverAdapterError extends Error {
	override name = 'DriverAdapterError';
	override cause: Record<string, unknown>;
	constructor(payload: Record<string, unknown>) {
		super(typeof payload['message'] === 'string' ? payload['message'] : undefined);
		this.cause = payload;
	}
}

// ---- argument conversion (adapter-pg's mapArg) ----
const pad = (n: number, z = 2) => String(n).padStart(z, '0');
const formatDateTime = (d: Date) => {
	const ms = d.getUTCMilliseconds();
	return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${
		pad(d.getUTCMinutes())
	}:${pad(d.getUTCSeconds())}${ms ? '.' + String(ms).padStart(3, '0') : ''}`;
};
const formatDate = (d: Date) => `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const formatTime = (d: Date) => {
	const ms = d.getUTCMilliseconds();
	return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}${
		ms ? '.' + String(ms).padStart(3, '0') : ''
	}`;
};
function mapArg(arg: unknown, argType: SqlQuery['argTypes'][number] | undefined): unknown {
	if (arg === null) return null;
	if (Array.isArray(arg) && argType?.arity === 'list') return arg.map((v) => mapArg(v, argType));
	if (typeof arg === 'string' && argType?.scalarType === 'datetime') arg = new Date(arg);
	if (arg instanceof Date) {
		switch (argType?.dbType) {
			case 'TIME':
			case 'TIMETZ':
				return formatTime(arg);
			case 'DATE':
				return formatDate(arg);
			default:
				return formatDateTime(arg);
		}
	}
	if (typeof arg === 'string' && argType?.scalarType === 'bytes') return Buffer.from(arg, 'base64');
	if (ArrayBuffer.isView(arg)) return Buffer.from(arg.buffer, arg.byteOffset, arg.byteLength);
	return arg;
}

// ---- error mapping (adapter-pg's convertDriverError) ----
const TLS_ERRORS = new Set([
	'UNABLE_TO_GET_ISSUER_CERT',
	'UNABLE_TO_GET_CRL',
	'UNABLE_TO_DECRYPT_CERT_SIGNATURE',
	'UNABLE_TO_DECRYPT_CRL_SIGNATURE',
	'UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY',
	'CERT_SIGNATURE_FAILURE',
	'CRL_SIGNATURE_FAILURE',
	'CERT_NOT_YET_VALID',
	'CERT_HAS_EXPIRED',
	'CRL_NOT_YET_VALID',
	'CRL_HAS_EXPIRED',
	'ERROR_IN_CERT_NOT_BEFORE_FIELD',
	'ERROR_IN_CERT_NOT_AFTER_FIELD',
	'ERROR_IN_CRL_LAST_UPDATE_FIELD',
	'ERROR_IN_CRL_NEXT_UPDATE_FIELD',
	'DEPTH_ZERO_SELF_SIGNED_CERT',
	'SELF_SIGNED_CERT_IN_CHAIN',
	'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
	'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
	'CERT_CHAIN_TOO_LONG',
	'CERT_REVOKED',
	'INVALID_CA',
	'INVALID_PURPOSE',
	'CERT_UNTRUSTED',
	'CERT_REJECTED',
	'HOSTNAME_MISMATCH',
	'ERR_TLS_CERT_ALTNAME_FORMAT',
	'ERR_TLS_CERT_ALTNAME_INVALID',
]);
const SOCKET_ERRORS = new Set(['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT']);

type E = Record<string, unknown> & { code?: unknown; message?: unknown };
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const quoted = (s: string | undefined) => s?.split('"').at(1);
const keyFields = (detail: unknown) => str(detail)?.match(/Key \(([^)]+)\)/)?.at(1)?.split(', ');

function mapPgError(e: E): Record<string, unknown> {
	const message = String(e.message);
	switch (e.code) {
		case '22001':
			return { kind: 'LengthMismatch', column: e['column'] };
		case '22003':
			return { kind: 'ValueOutOfRange', cause: message };
		case '22P02':
			return { kind: 'InvalidInputValue', message };
		case '23505': {
			const fields = keyFields(e['detail']);
			const constraint = str(e['constraint']);
			let table = str(e['table']);
			if (table === undefined && fields !== undefined && fields.length > 0) {
				const suffix = `_${fields.join('_')}_key`;
				if (constraint?.endsWith(suffix)) table = constraint.slice(0, -suffix.length);
			}
			return {
				kind: 'UniqueConstraintViolation',
				constraint: constraint ? { index: constraint } : fields !== undefined ? { fields } : undefined,
				table,
			};
		}
		case '23502': {
			const fields = keyFields(e['detail']);
			return { kind: 'NullConstraintViolation', constraint: fields !== undefined ? { fields } : undefined };
		}
		case '23503':
		case '23001': {
			const column = str(e['column']), constraint = str(e['constraint']);
			return {
				kind: e.code === '23503' ? 'ForeignKeyConstraintViolation' : 'RestrictViolation',
				constraint: column ? { fields: [column] } : constraint ? { index: constraint } : undefined,
			};
		}
		case '3D000':
			return { kind: 'DatabaseDoesNotExist', db: quoted(message.split(' ').at(1)) };
		case '28000':
			return { kind: 'DatabaseAccessDenied', db: quoted(message.split(',').find((s) => s.startsWith(' database'))) };
		case '28P01':
			return { kind: 'AuthenticationFailed', user: quoted(message.split(' ').pop()) };
		case '40001':
		case '40P01':
			return { kind: 'TransactionWriteConflict' };
		case '42P01':
			return { kind: 'TableDoesNotExist', table: quoted(message.split(' ').at(1)) };
		case '42703': {
			const raw = message.match(/^column (.+) does not exist$/)?.at(1);
			return {
				kind: 'ColumnNotFound',
				column: raw?.replace(/"((?:""|[^"])*)"/g, (_, id: string) => id.replaceAll('""', '"')),
			};
		}
		case '42P04':
			return { kind: 'DatabaseAlreadyExists', db: quoted(message.split(' ').at(1)) };
		case '53300':
			return { kind: 'TooManyConnections', cause: message };
		default:
			return {
				kind: 'postgres',
				code: e.code ?? 'N/A',
				severity: e['severity'] ?? 'N/A',
				message,
				detail: e['detail'],
				column: e['column'],
				hint: e['hint'],
			};
	}
}

const isUndefOrString = (v: unknown) => v === undefined || typeof v === 'string';
/** adapter-pg's convertDriverError: a mapped error, or the error itself when it isn't one it knows. */
function convertDriverError(error: unknown): Record<string, unknown> {
	const e = error as E;
	if (
		typeof e.code === 'string' && typeof e['syscall'] === 'string' && typeof e['errno'] === 'number'
		&& SOCKET_ERRORS.has(e.code)
	) {
		switch (e.code) {
			case 'ENOTFOUND':
			case 'ECONNREFUSED':
				return { kind: 'DatabaseNotReachable', host: e['address'] ?? e['hostname'], port: e['port'] };
			case 'ECONNRESET':
				return { kind: 'ConnectionClosed' };
			default:
				return { kind: 'SocketTimeout' };
		}
	}
	if (
		(typeof e.code === 'string' && TLS_ERRORS.has(e.code))
		|| (typeof e.code !== 'string'
			&& (e.message === 'The server does not support SSL connections'
				|| e.message === 'There was an error establishing an SSL connection'))
	) {
		return { kind: 'TlsConnectionError', reason: e.message };
	}
	if (
		typeof e.code === 'string' && typeof e.message === 'string' && typeof e['severity'] === 'string'
		&& isUndefOrString(e['detail']) && isUndefOrString(e['column']) && isUndefOrString(e['hint'])
	) {
		return { originalCode: e.code, originalMessage: e.message, ...mapPgError(e) };
	}
	throw error;
}
const rethrow = (error: unknown): never => {
	throw new DriverAdapterError(convertDriverError(error));
};

// Where a statement runs: the pool (shared) or a transaction's connection. Both have query(sql, params, opts).
interface Runner {
	query(sql: string, params: unknown[], opts: QueryOptions): PromiseLike<unknown>;
}

/** queryRaw/executeRaw, shared by the adapter and its transactions. */
export class PrismaPgQueryable {
	readonly provider = 'postgres';
	readonly adapterName = ADAPTER_NAME;
	protected runner: Runner;
	protected pgOptions: PrismaPgOptions | undefined;
	#typeNames: Pool;

	constructor(runner: Runner, pgOptions: PrismaPgOptions | undefined, typeNames: Pool) {
		this.runner = runner;
		this.pgOptions = pgOptions;
		this.#typeNames = typeNames;
	}

	async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
		const result = await this.#run(query);
		const fields = resultFields(result) ?? [];
		const columnTypes: number[] = new Array(fields.length);
		for (let i = 0; i < fields.length; i++) {
			const oid = fields[i]!.dataTypeOid;
			const type = COLUMN_TYPES.get(oid) ?? (oid >= FIRST_NORMAL_OBJECT_ID ? C.Text : undefined);
			if (type === undefined) {
				throw new DriverAdapterError({ kind: 'UnsupportedNativeDataType', type: await this.#typeName(oid) });
			}
			columnTypes[i] = type;
		}
		const udt = this.pgOptions?.userDefinedTypeParser;
		if (udt) {
			for (let i = 0; i < fields.length; i++) {
				const oid = fields[i]!.dataTypeOid;
				if (oid < FIRST_NORMAL_OBJECT_ID || oid in DECODERS) continue;
				for (const row of result.rows) row[i] = await udt(oid, row[i], this);
			}
		}
		return { columnNames: result.columns, columnTypes, rows: result.rows };
	}

	async executeRaw(query: SqlQuery): Promise<number> {
		return (await this.#run(query)).rowCount ?? 0;
	}

	async #run(query: SqlQuery): Promise<{ rows: unknown[][]; columns: string[]; rowCount: number | null }> {
		const params = query.args.map((arg, i) => mapArg(arg, query.argTypes[i]));
		const opts: QueryOptions = { mode: 'array' };
		const name = this.pgOptions?.statementNameGenerator?.(query);
		if (name) opts.name = name;
		try {
			return (await this.runner.query(query.sql, params, opts)) as never;
		} catch (error) {
			return rethrow(error);
		}
	}

	// adapter-pg names the type in UnsupportedNativeDataType from a table of pg_type names; ask the server instead.
	async #typeName(oid: number): Promise<string> {
		try {
			const r = await this.#typeNames.query('select typname from pg_type where oid = $1', [oid]);
			return ((r.rows[0] as unknown[] | undefined)?.[0] as string | undefined) ?? 'Unknown';
		} catch {
			return 'Unknown';
		}
	}
}

/** A transaction: one connection, held from BEGIN until Prisma, after sending COMMIT or ROLLBACK, calls
 *  commit() or rollback(). */
export class PrismaPgTransaction extends PrismaPgQueryable {
	readonly options = { usePhantomQuery: false };
	#release: () => void;

	constructor(runner: Runner, pgOptions: PrismaPgOptions | undefined, typeNames: Pool, release: () => void) {
		super(runner, pgOptions, typeNames);
		this.#release = release;
	}

	async commit(): Promise<void> {
		this.#release();
	}

	async rollback(): Promise<void> {
		this.#release();
	}

	async createSavepoint(name: string): Promise<void> {
		await this.executeRaw({ sql: `SAVEPOINT ${name}`, args: [], argTypes: [] });
	}

	async rollbackToSavepoint(name: string): Promise<void> {
		await this.executeRaw({ sql: `ROLLBACK TO SAVEPOINT ${name}`, args: [], argTypes: [] });
	}

	async releaseSavepoint(name: string): Promise<void> {
		await this.executeRaw({ sql: `RELEASE SAVEPOINT ${name}`, args: [], argTypes: [] });
	}
}

/** The adapter Prisma gets from PrismaPg.connect(). */
export class PrismaPgAdapter extends PrismaPgQueryable {
	readonly pool: Pool;
	#dispose: () => Promise<void>;

	constructor(pool: Pool, pgOptions: PrismaPgOptions | undefined, dispose: () => Promise<void>) {
		super(pool, pgOptions, pool);
		this.pool = pool;
		this.#dispose = dispose;
	}

	async startTransaction(isolationLevel?: IsolationLevel): Promise<PrismaPgTransaction> {
		let held;
		try {
			held = await this.pool.connect();
		} catch (error) {
			return rethrow(error);
		}
		const tx = new PrismaPgTransaction(held.client, this.pgOptions, this.pool, held.release);
		try {
			await tx.executeRaw({ sql: 'BEGIN', args: [], argTypes: [] });
			if (isolationLevel) {
				await tx.executeRaw({ sql: `SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`, args: [], argTypes: [] });
			}
			return tx;
		} catch (error) {
			held.release(); // the pool rolls back a connection returned inside a transaction
			throw error;
		}
	}

	// As adapter-pg: split on ';' and run the statements one by one.
	async executeScript(script: string): Promise<void> {
		for (const stmt of script.split(';').map((s) => s.trim()).filter((s) => s.length > 0)) {
			try {
				await this.pool.query(stmt);
			} catch (error) {
				rethrow(error);
			}
		}
	}

	getConnectionInfo(): { schemaName?: string; supportsRelationJoins: boolean } {
		return { schemaName: this.pgOptions?.schema, supportsRelationJoins: true };
	}

	dispose(): Promise<void> {
		return this.#dispose();
	}

	underlyingDriver(): Pool {
		return this.pool;
	}
}

/** The driver adapter factory for `new PrismaClient({ adapter })`, in place of @prisma/adapter-pg's PrismaPg.
 *  Takes a connection string or a pool config: the pool decodes values the way Prisma expects, so it is
 *  always one this factory creates. */
export class PrismaPg {
	readonly provider = 'postgres';
	readonly adapterName = ADAPTER_NAME;
	#config: PoolConfig;
	#options: PrismaPgOptions | undefined;

	constructor(config: string | PoolConfig, options?: PrismaPgOptions) {
		const c = typeof config === 'string' ? { url: config } : config;
		// RESULT_FIELDS: results carry the column descriptions, from which queryRaw reports column types
		this.#config = { ...c, int8: 'string', types: { ...c.types, ...DECODERS }, [RESULT_FIELDS]: true } as PoolConfig;
		this.#options = options;
	}

	async connect(): Promise<PrismaPgAdapter> {
		const pool = new Pool(this.#config);
		return new PrismaPgAdapter(pool, this.#options, () => pool.end());
	}

	/** For `prisma migrate`: a temporary database, dropped on dispose(). */
	async connectToShadowDb(): Promise<PrismaPgAdapter> {
		const main = await this.connect();
		const database = `prisma_migrate_shadow_db_${globalThis.crypto.randomUUID()}`;
		await main.executeScript(`CREATE DATABASE "${database}"`);
		const pool = new Pool({ ...this.#config, database });
		return new PrismaPgAdapter(pool, undefined, async () => {
			await pool.end();
			await main.executeScript(`DROP DATABASE "${database}"`);
			await main.dispose();
		});
	}
}

addBrand(DriverAdapterError, 'DriverAdapterError');
addBrand(PrismaPgQueryable, 'PrismaPgQueryable');
addBrand(PrismaPgTransaction, 'PrismaPgTransaction');
addBrand(PrismaPgAdapter, 'PrismaPgAdapter');
addBrand(PrismaPg, 'PrismaPg');
