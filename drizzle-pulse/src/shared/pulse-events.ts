export type PulseInsertEvent<TResult> = {
  op: 'insert';
  row: TResult;
  pk: unknown;
};

export type PulseUpdateEvent<TResult> = {
  op: 'update';
  row: TResult;
  old_row: Record<string, unknown>;
  pk: unknown;
  matchesNew: boolean;
};

export type PulseDeleteEvent = {
  op: 'delete';
  old_row: Record<string, unknown>;
  pk: unknown;
};

export type PulseEvent<TResult> =
  | PulseInsertEvent<TResult>
  | PulseUpdateEvent<TResult>
  | PulseDeleteEvent;
