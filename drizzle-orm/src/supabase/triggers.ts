import type { PgTable } from '~/pg-core/table.ts';
import type { PgFunction } from './functions.ts';
import { entityKind } from '~/entity.ts';

export type TriggerEvent = 'insert' | 'update' | 'delete';
export type TriggerType = 'before' | 'after';
export type TriggerOrientation = 'row' | 'statement';

export interface PgTriggerConfig {
  table?: PgTable;
  events?: TriggerEvent[];
  triggerType?: TriggerType;
  orientation?: TriggerOrientation;
  function?: PgFunction;
}

export class PgTrigger implements PgTriggerConfig {
  static readonly [entityKind]: string = 'PgTrigger';

  readonly table: PgTriggerConfig['table'];
  readonly events: PgTriggerConfig['events'];
  readonly triggerType: PgTriggerConfig['triggerType'];
  readonly orientation: PgTriggerConfig['orientation'];
  readonly function: PgTriggerConfig['function'];

  constructor(
    readonly name: string,
    config?: PgTriggerConfig
  ) {
    if (config) {
      this.table = config.table;
      this.events = config.events;
      this.triggerType = config.triggerType;
      this.orientation = config.orientation;
      this.function = config.function;
    }
  }
}

export function pgTrigger(name: string, config?: PgTriggerConfig) {
  return new PgTrigger(name, config);
}
