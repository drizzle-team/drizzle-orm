import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { PullClient } from './client/create-client.js';
import type { PulseEvent } from './shared/pulse-events.js';

/** Column filter operators */
export type ColumnOperators<V> = {
  eq?: V;
  ne?: V;
  gt?: V;
  gte?: V;
  lt?: V;
  lte?: V;
  in?: V[];
  isNull?: true;
  isNotNull?: true;
};

/** Type-safe where condition for a table row type. */
type ColumnWhereCondition<T extends Record<string, unknown>> = {
  [K in keyof T]?: NonNullable<T[K]> | ColumnOperators<NonNullable<T[K]>>;
} & {
  AND?: never;
  OR?: never;
  NOT?: never;
};

type AndWhereCondition<T extends Record<string, unknown>> = {
  AND: WhereCondition<T>[];
  OR?: never;
  NOT?: never;
};

type OrWhereCondition<T extends Record<string, unknown>> = {
  OR: WhereCondition<T>[];
  AND?: never;
  NOT?: never;
};

type NotWhereCondition<T extends Record<string, unknown>> = {
  NOT: WhereCondition<T>;
  AND?: never;
  OR?: never;
};

export type WhereCondition<T extends Record<string, unknown>> =
  | ColumnWhereCondition<T>
  | AndWhereCondition<T>
  | OrWhereCondition<T>
  | NotWhereCondition<T>;

/** Untyped where clause — server internal use (index signature). */
type ColumnWhereClause = {
  [column: string]: unknown;
  AND?: never;
  OR?: never;
  NOT?: never;
};

type AndWhereClause = {
  AND: WhereClause[];
  OR?: never;
  NOT?: never;
};

type OrWhereClause = {
  OR: WhereClause[];
  AND?: never;
  NOT?: never;
};

type NotWhereClause = {
  NOT: WhereClause;
  AND?: never;
  OR?: never;
};

export type WhereClause = ColumnWhereClause | AndWhereClause | OrWhereClause | NotWhereClause;

export interface PulseAuthContext {
  userId: number | null;
}

export interface PulseRegistryQuery {
  readonly table: PgTable;
  readonly pkColumn: PgColumn;
  readonly columns: Record<string, PgColumn>;
  readonly selectedColumns: Record<string, PgColumn>;
  readonly allowedColumnNames: ReadonlySet<string>;
  readonly order: 'asc' | 'desc';
  readonly limit: number | null;
  readonly argsSchema: { parse: (input: unknown) => unknown } | null;
  readonly queryFn:
    | ((ctx: {
        query: (where: WhereClause) => WhereClause;
        args: unknown;
        auth: PulseAuthContext;
      }) => WhereClause | null)
    | null;
  readonly hasTransform: boolean;
  readonly transformRows: (
    rows: Record<string, unknown>[],
  ) => Promise<Record<string, unknown>[]> | Record<string, unknown>[];
}

export type ResolvedPulseQuery = Omit<PulseRegistryQuery, 'queryFn'> & {
  readonly where: WhereClause | null;
};

/**
 * Query descriptor — created by client proxy, consumed by usePulseQuery.
 * TResult is phantom — exists only for type inference.
 */
export class QueryDescriptor<TResult> {
  readonly _!: {
    result: TResult;
  };

  constructor(
    readonly queryName: string,
    readonly args: Record<string, unknown>,
    readonly url: string,
    // Batches this query's polls with its siblings on the HTTP path.
    readonly pullClient: PullClient,
  ) {}
}

// Server-side wire events carried in a pull response (raw rows keyed by SQL name). Distinct
// from the client-facing PulseEvent in shared/pulse-events.ts, which is generic over the
// query's decoded result shape.
export type PulseWireEvent = PulseEvent<Record<string, unknown>>;
