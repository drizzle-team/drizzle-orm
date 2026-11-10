import { and, eq, getColumns, gt, or, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { extractRow } from '../shared/event-normalization.js';
import { comparePkValues, isInsertPrepend, isPkComparable } from '../shared/pk-utils.js';
import { applyProjectionPipeline } from '../shared/projection.js';
import type {
  LoadMoreRequest,
  LoadMoreResponse,
  PullRequest,
  PullResetResponse,
  PullResponse,
  PullResponseError,
  PullResponseErrorResult,
  SubscribeRequest,
  SubscribeResponse,
} from '../shared/protocol-types.js';

import type {
  PulseAuthContext,
  PulseWireEvent,
  ResolvedPulseQuery,
  WhereClause,
} from '../types.js';
import { formatCursor, parseCursor } from './cursor.js';
import { buildWhereClausePredicate } from './drizzle-utils.js';
import type { AnyPulseBuilders, PulseRegistry } from './pulse-registry.js';
import type { PulseSourceDb } from './pulse-sql.js';
import { buildSelectQuery } from './pulse-sql.js';
import type { PulseStore } from './pulse-store.js';
import { getQueryColumnKey } from './pulse-types.js';

// Hard cap on events a single pull may replay; overflow falls back to a full reset instead
// of streaming an unbounded batch. Overridable via PulseRuntimeConfig.pull.eventLimit.
export const DEFAULT_PULL_EVENT_LIMIT = 1000;

export type SubscribeHandlerResponseBody =
  | SubscribeResponse<Record<string, unknown>>
  | { error: string };
export type LoadMoreHandlerResponseBody =
  | LoadMoreResponse<Record<string, unknown>>
  | { error: string };
export type PullHandlerResponseBody =
  | {
      results: Record<
        string,
        PullResponse<Record<string, unknown>, PulseWireEvent> | PullResponseErrorResult
      >;
    }
  | { error: string };

export type PulseHandlerResult<TBody> = {
  status: number;
  body: TBody;
};

// Reconstructed on every request from the (auth-re-resolved) query plus the client's current
// window — the server holds no subscription state between requests. order/limit
// come from `query` (server-derived, never trusted from the client); rangeStart/rangeEnd and
// hasMore are client-supplied and only narrow/annotate the window.
type Subscription = {
  queryName: string;
  query: ResolvedPulseQuery;
  rangeStart: unknown | null;
  rangeEnd: unknown | null;
  hasMore: boolean;
};

type NormalizedEvent = {
  snapshot: number;
  pk: unknown;
  op: 'insert' | 'update' | 'delete' | 'snapshot';
  matchesNew: boolean;
  matchesOld: boolean;
  row: Record<string, unknown> | null;
  old_row: Record<string, unknown> | null;
};

// The query's own `.transform()` runs before projection, so a transform may add or rename fields
// that `.columns()` then selects from.
async function applyResponsePipeline(
  rows: Record<string, unknown>[],
  pulseQuery: ResolvedPulseQuery,
): Promise<Record<string, unknown>[]> {
  return applyProjectionPipeline(await pulseQuery.transformRows(rows), pulseQuery);
}

export class PulseRequestHandler {
  constructor(
    private readonly registry: PulseRegistry<AnyPulseBuilders>,
    private readonly sourceDb: PulseSourceDb,
    private readonly getPulseStore: () => Pick<PulseStore, 'getDb' | 'getLatestSnapshot'>,
    private readonly getEventsTable: (queryName: string) => PgTable,
    private readonly getEpoch: (queryName: string) => string | undefined,
    private readonly pullEventLimit: number = DEFAULT_PULL_EVENT_LIMIT,
    // Routes handler-level 500s through the runtime's LogLevel gating (defaults to raw
    // console.error for callers — mock harnesses, tests — that don't wire a runtime).
    private readonly logError: (message: string, ...args: unknown[]) => void = console.error,
  ) {}

  async subscribe(
    request: SubscribeRequest,
    auth: PulseAuthContext,
  ): Promise<PulseHandlerResult<SubscribeHandlerResponseBody>> {
    try {
      const { queryName, args } = request;

      let resolvedQuery: ResolvedPulseQuery;
      let sourceTable: PgTable;
      try {
        resolvedQuery = this.registry.resolve(queryName, args, auth);
        // resolve() throws on an unknown query, so this is unreachable in practice.
        const table = this.registry.getSourceTable(queryName);
        if (!table) throw new Error(`Unknown query: "${queryName}"`);
        sourceTable = table;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Validation failed';
        return { status: 400, body: { error: message } };
      }

      // Read the snapshot cursor BEFORE the baseline SELECT (matches the embedded path's
      // startHandshake ordering): a write whose event lands between these two reads must
      // still be covered by the cursor returned here, or it would be lost until an
      // unrelated reset. Duplicate replays are already idempotent client-side.
      const snapshot = await this.getPulseStore().getLatestSnapshot(this.getEventsTable(queryName));

      // Fetch limit+1 so hasMore is authoritative (mirrors loadMore): a full page of
      // exactly `limit` rows must not report hasMore unless a further row exists.
      const pageLimit = typeof resolvedQuery.limit === 'number' ? resolvedQuery.limit : undefined;
      const fetchQuery =
        pageLimit !== undefined ? { ...resolvedQuery, limit: pageLimit + 1 } : resolvedQuery;
      const fetchedRows = await buildSelectQuery(this.sourceDb, sourceTable, fetchQuery);
      const hasMore = pageLimit !== undefined ? fetchedRows.length > pageLimit : false;
      const rows =
        pageLimit !== undefined && hasMore ? fetchedRows.slice(0, pageLimit) : fetchedRows;

      // Every in-memory row is keyed by JS property key — index by the PK's JS query key,
      // which can still differ from pkColumn.name (e.g. `orderId: serial('order_id')`).
      const pkQueryKey = this.getPkQueryKey(resolvedQuery);
      const rawRangeStart = rows[0]?.[pkQueryKey] ?? null;
      const rawRangeEnd = rows[rows.length - 1]?.[pkQueryKey] ?? null;
      let rangeStart = isPkComparable(rawRangeStart) ? rawRangeStart : null;
      let rangeEnd = isPkComparable(rawRangeEnd) ? rawRangeEnd : null;
      if (resolvedQuery.order === 'desc') {
        [rangeStart, rangeEnd] = [rangeEnd, rangeStart];
      }

      const pipelinedRows = await applyResponsePipeline(rows, resolvedQuery);

      const response: SubscribeResponse<Record<string, unknown>> = {
        rows: pipelinedRows,
        rangeStart,
        rangeEnd,
        snapshot: this.token(queryName, snapshot),
        order: resolvedQuery.order,
        limit: resolvedQuery.limit,
        hasMore,
      };

      return { status: 200, body: response };
    } catch (error) {
      this.logError('Error handling subscribe request:', error);
      return { status: 500, body: { error: 'server_error' } };
    }
  }

  async loadMore(
    request: LoadMoreRequest,
    auth: PulseAuthContext,
  ): Promise<PulseHandlerResult<LoadMoreHandlerResponseBody>> {
    try {
      const { queryName, args, cursor } = request;

      let resolvedQuery: ResolvedPulseQuery;
      try {
        resolvedQuery = this.registry.resolve(queryName, args, auth);
        if (!this.registry.getSourceTable(queryName)) {
          throw new Error(`Unknown query: "${queryName}"`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Validation failed';
        return { status: 400, body: { error: message } };
      }

      if (cursor === undefined || cursor === null) {
        return { status: 400, body: { error: 'missing_cursor' } };
      }
      if (!isPkComparable(cursor)) {
        return { status: 400, body: { error: 'invalid_cursor' } };
      }

      const subscription = this.reconstructSubscription(
        queryName,
        resolvedQuery,
        request.rangeStart,
        request.rangeEnd,
      );

      // WhereClause keys are matched against query.columns (JS property keys) — use the PK's
      // JS query key here, which can still differ from pkColumn.name.
      const cursorCondition: WhereClause = {
        [this.getPkQueryKey(subscription.query)]:
          subscription.query.order === 'asc' ? { gt: cursor } : { lt: cursor },
      };
      const cursorWhere: WhereClause = subscription.query.where
        ? { AND: [subscription.query.where, cursorCondition] }
        : cursorCondition;
      const fetchQuery: ResolvedPulseQuery = {
        ...subscription.query,
        where: cursorWhere,
        allowedColumnNames: this.getInternalAllowedColumnNames(subscription.query),
        limit:
          typeof subscription.query.limit === 'number'
            ? subscription.query.limit + 1
            : subscription.query.limit,
      };

      const sourceTable = subscription.query.table;
      const rows = await buildSelectQuery(this.sourceDb, sourceTable, fetchQuery);
      const pageLimit = subscription.query.limit ?? undefined;
      const hasMore = pageLimit !== undefined ? rows.length > pageLimit : false;
      const fetchedRows = pageLimit !== undefined && hasMore ? rows.slice(0, pageLimit) : rows;

      // Every in-memory row is keyed by JS property key — index by the PK's JS query key,
      // which can still differ from pkColumn.name.
      const pkRowKey = this.getPkQueryKey(subscription.query);
      const ids = fetchedRows
        .map((row) => row[pkRowKey])
        .filter((pk) => pk !== undefined)
        .filter(isPkComparable);
      let newRangeStart: unknown | null = null;
      let newRangeEnd: unknown | null = null;
      for (const id of ids) {
        if (newRangeStart === null || comparePkValues(id, newRangeStart) < 0) newRangeStart = id;
        if (newRangeEnd === null || comparePkValues(id, newRangeEnd) > 0) newRangeEnd = id;
      }

      const updatedRangeStart =
        newRangeStart !== null
          ? subscription.rangeStart !== null
            ? comparePkValues(newRangeStart, subscription.rangeStart) < 0
              ? newRangeStart
              : subscription.rangeStart
            : newRangeStart
          : subscription.rangeStart;
      const updatedRangeEnd =
        newRangeEnd !== null
          ? subscription.rangeEnd !== null
            ? comparePkValues(newRangeEnd, subscription.rangeEnd) > 0
              ? newRangeEnd
              : subscription.rangeEnd
            : newRangeEnd
          : subscription.rangeEnd;

      const pipelinedRows = await applyResponsePipeline(fetchedRows, subscription.query);
      const response: LoadMoreResponse<Record<string, unknown>> = {
        rows: pipelinedRows,
        rangeStart: updatedRangeStart,
        rangeEnd: updatedRangeEnd,
        hasMore,
      };
      return { status: 200, body: response };
    } catch (error) {
      this.logError('Error handling loadMore request:', error);
      return { status: 500, body: { error: 'server_error' } };
    }
  }

  async pull(
    request: PullRequest,
    auth: PulseAuthContext,
  ): Promise<PulseHandlerResult<PullHandlerResponseBody>> {
    try {
      const { subscriptions } = request;
      if (!Array.isArray(subscriptions)) {
        return { status: 400, body: { error: 'missing_subscriptions' } };
      }

      const pulseStore = this.getPulseStore();
      const results: Record<
        string,
        PullResponse<Record<string, unknown>, PulseWireEvent> | PullResponseErrorResult
      > = {};

      for (const entry of subscriptions) {
        // Guard before destructuring: a null entry must not escape per-entry isolation
        // and 500 the whole batch.
        if (entry === null || typeof entry !== 'object') {
          continue;
        }
        const { key, queryName, args } = entry;
        if (typeof key !== 'string' || key.length === 0) {
          continue;
        }

        // Re-resolve per pull so auth changes (a revoked queryFn filter) take effect on the
        // next pull without any server-held subscription to invalidate.
        let resolvedQuery: ResolvedPulseQuery;
        try {
          resolvedQuery = this.registry.resolve(queryName, args, auth);
          if (!this.registry.getSourceTable(queryName)) {
            throw new Error(`Unknown query: "${queryName}"`);
          }
        } catch {
          results[key] = { error: 'query_resolution_failed' };
          continue;
        }

        const subscription = this.reconstructSubscription(
          queryName,
          resolvedQuery,
          entry.rangeStart,
          entry.rangeEnd,
          entry.hasMore ?? false,
        );

        // Validate the epoch token BEFORE any snapshot comparison: a stale token (minted
        // against a since-recreated events table) or an unparseable one resets immediately.
        const currentEpoch = this.getEpoch(queryName);
        const parsed = typeof entry.snapshot === 'string' ? parseCursor(entry.snapshot) : null;
        if (parsed === null || currentEpoch === undefined || parsed.epoch !== currentEpoch) {
          results[key] = await this.resetOrError(subscription, pulseStore, 'epoch');
          continue;
        }

        const incremental = await this.buildIncrementalResponse(
          subscription,
          parsed.snapshot,
          pulseStore,
        );
        if ('error' in incremental) {
          results[key] = { error: incremental.error };
          continue;
        }
        if ('reset' in incremental && incremental.reset === true) {
          results[key] = await this.resetOrError(subscription, pulseStore, incremental.reason);
          continue;
        }

        results[key] = incremental;
      }

      return { status: 200, body: { results } };
    } catch (error) {
      this.logError('Error handling pull request:', error);
      return { status: 500, body: { error: 'server_error' } };
    }
  }

  private async resetOrError(
    subscription: Subscription,
    pulseStore: Pick<PulseStore, 'getDb' | 'getLatestSnapshot'>,
    reason: string,
  ): Promise<PullResetResponse<Record<string, unknown>, PulseWireEvent> | PullResponseErrorResult> {
    const latestSnapshot = await pulseStore.getLatestSnapshot(
      this.getEventsTable(subscription.queryName),
    );
    const rerun = await this.buildResetResponse(subscription, latestSnapshot, reason);
    if ('error' in rerun) {
      return { error: 'reset_failed' };
    }
    return rerun;
  }

  private reconstructSubscription(
    queryName: string,
    query: ResolvedPulseQuery,
    rawRangeStart: unknown,
    rawRangeEnd: unknown,
    hasMore = false,
  ): Subscription {
    return {
      queryName,
      query,
      rangeStart: isPkComparable(rawRangeStart) ? rawRangeStart : null,
      rangeEnd: isPkComparable(rawRangeEnd) ? rawRangeEnd : null,
      hasMore,
    };
  }

  private token(queryName: string, snapshot: number): string {
    const epoch = this.getEpoch(queryName);
    if (epoch === undefined) {
      // Only reachable before bootstrap() has populated epochs; a running runtime always has one.
      throw new Error(`No epoch provisioned for query "${queryName}"`);
    }
    return formatCursor(epoch, snapshot);
  }

  // PK's JS property key (query.columns), which diverges from its SQL name for e.g.
  // `orderId: serial('order_id')`; falls back to the SQL name only if it's absent there.
  private getPkQueryKey(query: ResolvedPulseQuery): string {
    return getQueryColumnKey(query.columns, query.pkColumn) ?? query.pkColumn.name;
  }

  private getInternalAllowedColumnNames(query: ResolvedPulseQuery): ReadonlySet<string> {
    const pkQueryKey = getQueryColumnKey(query.columns, query.pkColumn);
    return pkQueryKey
      ? new Set([...query.allowedColumnNames, pkQueryKey])
      : query.allowedColumnNames;
  }

  private normalizeEvent(
    rawEvent: Record<string, unknown> & {
      $snapshot?: unknown;
      $op?: unknown;
      $matches_new?: unknown;
      $matches_old?: unknown;
    },
    query: ResolvedPulseQuery,
  ): NormalizedEvent {
    return {
      snapshot: Number(rawEvent.$snapshot ?? 0),
      pk: rawEvent[this.getPkQueryKey(query)],
      op: String(rawEvent.$op) as NormalizedEvent['op'],
      matchesNew: Boolean(rawEvent.$matches_new),
      matchesOld: Boolean(rawEvent.$matches_old),
      row: extractRow(rawEvent, query.columns),
      old_row: extractRow(rawEvent, query.columns, '$old_'),
    };
  }

  private async applyPipelineToRow(
    query: ResolvedPulseQuery,
    row: Record<string, unknown> | null,
  ): Promise<Record<string, unknown> | null> {
    if (!row) {
      return null;
    }
    const [pipelinedRow] = await applyResponsePipeline([row], query);
    // A transform that filters a row out yields undefined; propagate that (callers
    // treat a falsy result as "filtered"), never the un-pipelined original row.
    return pipelinedRow ?? null;
  }

  private withOpPredicate(
    opColumn: PgTable['_']['columns'][string],
    op: 'insert' | 'update' | 'delete' | 'snapshot',
    predicate?: ReturnType<typeof buildWhereClausePredicate>,
  ) {
    return predicate ? and(eq(opColumn, op), predicate) : eq(opColumn, op);
  }

  private matchesLimitedInsertWindow(subscription: Subscription, pkValue: unknown): boolean {
    if (typeof subscription.query.limit !== 'number') {
      return true;
    }
    return isInsertPrepend(
      subscription.query.order,
      pkValue,
      subscription.rangeStart,
      subscription.rangeEnd,
    );
  }

  private computeUpdatedRange(
    subscription: Subscription,
    events: PulseWireEvent[],
  ): { rangeStart: unknown | null; rangeEnd: unknown | null } {
    let nextRangeStart = subscription.rangeStart;
    let nextRangeEnd = subscription.rangeEnd;
    for (const event of events) {
      if (event.op !== 'insert') {
        continue;
      }
      const pkValue = event.pk;
      if (!isPkComparable(pkValue)) {
        continue;
      }
      if (nextRangeStart === null || comparePkValues(pkValue, nextRangeStart) < 0) {
        nextRangeStart = pkValue;
      }
      if (nextRangeEnd === null || comparePkValues(pkValue, nextRangeEnd) > 0) {
        nextRangeEnd = pkValue;
      }
    }
    return { rangeStart: nextRangeStart, rangeEnd: nextRangeEnd };
  }

  private buildResetWhereClause(subscription: Subscription): WhereClause | null {
    // WhereClause keys are matched against query.columns (JS property keys) — use the PK's JS
    // query key here, which can still differ from pkColumn.name.
    const pkColumnName = this.getPkQueryKey(subscription.query);
    if (subscription.query.order === 'desc') {
      if (!isPkComparable(subscription.rangeStart)) {
        return subscription.query.where;
      }
      const pkWhere: WhereClause = { [pkColumnName]: { gte: subscription.rangeStart } };
      return subscription.query.where ? { AND: [subscription.query.where, pkWhere] } : pkWhere;
    }
    if (!isPkComparable(subscription.rangeEnd)) {
      return subscription.query.where;
    }
    const pkWhere: WhereClause = { [pkColumnName]: { lte: subscription.rangeEnd } };
    return subscription.query.where ? { AND: [subscription.query.where, pkWhere] } : pkWhere;
  }

  private async buildResetResponse(
    subscription: Subscription,
    latestSnapshot: number,
    reason = 'snapshot',
  ): Promise<PullResetResponse<Record<string, unknown>, PulseWireEvent> | PullResponseError> {
    const sourceTable = this.registry.getSourceTable(subscription.queryName);
    if (!sourceTable) {
      return { error: 'source_table_not_found' };
    }
    const rerunQuery: ResolvedPulseQuery = {
      ...subscription.query,
      where: this.buildResetWhereClause(subscription),
      allowedColumnNames: this.getInternalAllowedColumnNames(subscription.query),
      limit: null,
    };
    const rows = await buildSelectQuery(this.sourceDb, sourceTable, rerunQuery);
    const pipelinedRows = await applyResponsePipeline(rows, subscription.query);
    const rerunPks = pipelinedRows
      .map((row: Record<string, unknown> & { $pk?: unknown }) => row.$pk)
      .filter(isPkComparable);
    let rangeStart: unknown | null = null;
    let rangeEnd: unknown | null = null;
    for (const pk of rerunPks) {
      if (rangeStart === null || comparePkValues(pk, rangeStart) < 0) {
        rangeStart = pk;
      }
      if (rangeEnd === null || comparePkValues(pk, rangeEnd) > 0) {
        rangeEnd = pk;
      }
    }
    return {
      events: [],
      rows: pipelinedRows,
      rangeStart,
      rangeEnd,
      snapshot: this.token(subscription.queryName, latestSnapshot),
      reset: true,
      reason,
      order: subscription.query.order,
      limit: subscription.query.limit,
      hasMore: subscription.hasMore,
    };
  }

  private async buildIncrementalResponse(
    subscription: Subscription,
    sinceSnapshot: number,
    pulseStore: Pick<PulseStore, 'getDb' | 'getLatestSnapshot'>,
  ): Promise<
    | PullResponse<Record<string, unknown>, PulseWireEvent>
    | { reset: true; reason: string }
    | PullResponseError
  > {
    const latestSnapshot = await pulseStore.getLatestSnapshot(
      this.getEventsTable(subscription.queryName),
    );
    if (sinceSnapshot >= latestSnapshot) {
      return {
        events: [],
        rangeStart: subscription.rangeStart,
        rangeEnd: subscription.rangeEnd,
        snapshot: this.token(subscription.queryName, sinceSnapshot),
      };
    }

    const eventsDb = pulseStore.getDb();
    // Total for registered queries — the runtime resolves an events table for every
    // source table at construction, so this throws rather than returning null for a
    // genuinely unknown query (subscription lookup upstream already guards that case).
    const eventsTable = this.getEventsTable(subscription.queryName);
    // buildEventsTable() keys every column by its JS property key (mirroring the source
    // table), so getColumns() lookups by the query key below need no re-keying.
    const eventTableColumns = getColumns(eventsTable);
    const eventColumns = Object.fromEntries(
      Object.entries(subscription.query.columns).map(([queryKey]) => {
        const eventColumn = eventTableColumns[queryKey];
        if (!eventColumn) {
          throw new Error(`Missing events column "${queryKey}" for query`);
        }
        return [queryKey, eventColumn] as const;
      }),
    );
    const oldEventColumns = Object.fromEntries(
      Object.entries(subscription.query.columns).map(([queryKey]) => {
        const oldColumnKey = `$old_${queryKey}`;
        const oldEventColumn = eventTableColumns[oldColumnKey];
        if (!oldEventColumn) {
          throw new Error(`Missing events old column "${oldColumnKey}" for query`);
        }
        return [queryKey, oldEventColumn] as const;
      }),
    );
    const currentPredicate = buildWhereClausePredicate(
      subscription.query.where,
      eventColumns,
      subscription.query.allowedColumnNames,
    );
    const oldPredicate = buildWhereClausePredicate(
      subscription.query.where,
      oldEventColumns,
      subscription.query.allowedColumnNames,
    );

    const systemColumns = eventTableColumns as typeof eventTableColumns & {
      $snapshot?: PgTable['_']['columns'][string];
      $op?: PgTable['_']['columns'][string];
    };
    const snapshotColumn = systemColumns.$snapshot;
    const opColumn = systemColumns.$op;
    if (!snapshotColumn || !opColumn) {
      return { error: 'events_table_not_found' };
    }
    const updatePredicate =
      currentPredicate && oldPredicate
        ? or(currentPredicate, oldPredicate)
        : (currentPredicate ?? oldPredicate);
    const rawEvents = await eventsDb
      .select({
        // Projection keys are the events table's JS property keys (which mirror the source
        // table's), matching extractRow's contract: rawEvent[keyPrefix + queryKey].
        ...eventTableColumns,
        $matches_new: currentPredicate ? sql<boolean>`(${currentPredicate})` : sql<boolean>`true`,
        $matches_old: oldPredicate ? sql<boolean>`(${oldPredicate})` : sql<boolean>`true`,
      })
      .from(eventsTable)
      .where(
        and(
          gt(snapshotColumn, sinceSnapshot),
          or(
            this.withOpPredicate(opColumn, 'insert', currentPredicate),
            this.withOpPredicate(opColumn, 'update', updatePredicate),
            this.withOpPredicate(opColumn, 'delete', oldPredicate),
            this.withOpPredicate(opColumn, 'snapshot'),
          ),
        ),
      )
      .orderBy(snapshotColumn)
      // +1 so an exactly-at-cap batch is distinguishable from an over-cap one.
      .limit(this.pullEventLimit + 1);
    if (rawEvents.length > this.pullEventLimit) {
      return { reset: true, reason: 'cap' };
    }
    const normalizedEvents = rawEvents.map((rawEvent) =>
      this.normalizeEvent(rawEvent, subscription.query),
    );
    if (normalizedEvents.some((event: NormalizedEvent) => event.op === 'snapshot')) {
      return { reset: true, reason: 'snapshot' };
    }

    const events: PulseWireEvent[] = [];
    let nextSnapshot = sinceSnapshot;
    for (const event of normalizedEvents) {
      nextSnapshot = Math.max(nextSnapshot, event.snapshot);
      if (!isPkComparable(event.pk)) {
        continue;
      }
      const row = event.row;
      const oldRow = event.old_row;
      if (event.op === 'insert') {
        if (!row || !this.matchesLimitedInsertWindow(subscription, event.pk)) {
          continue;
        }
        const pipelinedRow = await this.applyPipelineToRow(subscription.query, row);
        if (!pipelinedRow) {
          continue;
        }
        events.push({ op: 'insert', row: pipelinedRow, pk: event.pk });
        continue;
      }
      if (event.op === 'update') {
        if (!row && !oldRow) {
          continue;
        }
        const matchesNew = event.matchesNew && !!row;
        const matchesOld = event.matchesOld && !!oldRow;
        if (!matchesNew && !matchesOld) {
          continue;
        }
        const pipelinedRow = await this.applyPipelineToRow(subscription.query, row);
        const pipelinedOldRow = await this.applyPipelineToRow(subscription.query, oldRow);
        if ((matchesNew && !pipelinedRow) || (matchesOld && !pipelinedOldRow)) {
          continue;
        }
        events.push({
          op: 'update',
          // Each side ships only when that side matches the subscriber's WHERE — the other
          // side is out-of-scope row state. The redacted new side keeps `$pk` because the
          // client's merge core keys the membership removal off the wire row; a
          // transform-filtered new row has no post-transform `$pk` and ships `{}`, which the
          // client skips whole.
          row: matchesNew ? (pipelinedRow ?? {}) : pipelinedRow ? { $pk: pipelinedRow['$pk'] } : {},
          old_row: matchesOld && pipelinedOldRow ? pipelinedOldRow : {},
          pk: event.pk,
          matchesNew,
        });
        continue;
      }
      if (event.op === 'delete' && oldRow) {
        if (!event.matchesOld) {
          continue;
        }
        const pipelinedOldRow = await this.applyPipelineToRow(subscription.query, oldRow);
        if (!pipelinedOldRow) {
          continue;
        }
        events.push({
          op: 'delete',
          old_row: pipelinedOldRow,
          pk: event.pk,
        });
      }
    }

    const nextRange = this.computeUpdatedRange(subscription, events);
    return {
      events,
      rangeStart: nextRange.rangeStart,
      rangeEnd: nextRange.rangeEnd,
      snapshot: this.token(subscription.queryName, nextSnapshot),
    };
  }
}
