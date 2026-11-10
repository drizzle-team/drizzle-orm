import type { PgTable } from 'drizzle-orm/pg-core';
import { getPulsePkColumn } from '../pulse-table.js';
import type {
  PulseAuthContext,
  PulseRegistryQuery,
  ResolvedPulseQuery,
  WhereClause,
} from '../types.js';
import type { PulseBuilder } from './pulse-builder.js';
import type { PulseClientContract } from './pulse-types.js';

export type AnyPulseBuilder = PulseBuilder<
  PgTable,
  Record<string, boolean>,
  unknown,
  Record<string, unknown>
>;

export type AnyPulseBuilders = Record<string, AnyPulseBuilder>;

function buildPulseQuery(query: AnyPulseBuilder): PulseRegistryQuery {
  const { config } = query;
  const sourceTable = config.table.source;

  getPulsePkColumn(sourceTable);

  return {
    table: sourceTable,
    pkColumn: config.pkColumn,
    columns: config.columns,
    selectedColumns: config.selectedColumns,
    allowedColumnNames: new Set(Object.keys(config.selectedColumns)),
    order: config.order ?? 'asc',
    limit: config.limit ?? null,
    argsSchema: config.argsSchema,
    queryFn: config.queryFn,
    hasTransform: config.transformFn !== null,
    transformRows: (rows: Record<string, unknown>[]) =>
      config.transformFn ? config.transformFn(rows) : rows,
  };
}

export class PulseRegistry<TQueries extends AnyPulseBuilders> {
  readonly $client!: PulseClientContract<TQueries>;
  private readonly pulseQueries: Record<string, PulseRegistryQuery>;

  constructor(queries: TQueries) {
    this.pulseQueries = Object.fromEntries(
      Object.entries(queries).map(([name, query]) => [name, buildPulseQuery(query)]),
    );
  }

  getPulseQuery(name: string) {
    return this.pulseQueries[name] ?? null;
  }

  getSourceTable(name: string) {
    return this.pulseQueries[name]?.table ?? null;
  }

  getQueryNames() {
    return Object.keys(this.pulseQueries);
  }

  resolve(name: string, rawArgs: unknown, auth: PulseAuthContext): ResolvedPulseQuery {
    const registryQuery = this.pulseQueries[name];
    if (!registryQuery) throw new Error(`Unknown query: "${name}"`);
    // Never pass raw client input through as `args` when no schema was ever seeded via
    // `.args()` — a queryFn that reads `ctx.args` without declaring a schema would
    // otherwise let attacker-controlled JSON reach buildColumnFilterPredicate as
    // operator-shaped filters. Queries that need args MUST chain `.args(schema)`.
    const args = registryQuery.argsSchema ? registryQuery.argsSchema.parse(rawArgs) : {};
    const where =
      registryQuery.queryFn?.({
        query: (clause: WhereClause) => clause,
        args,
        auth,
      }) ?? null;
    const { queryFn, ...rest } = registryQuery;
    return { ...rest, where };
  }
}

export function createPulseRegistry<TQueries extends AnyPulseBuilders>(queries: TQueries) {
  return new PulseRegistry(queries);
}
