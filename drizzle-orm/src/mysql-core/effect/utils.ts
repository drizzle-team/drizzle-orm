import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleMySqlConfig } from '../utils.ts';

export type EffectDrizzleMySqlConfig<
	TRelations extends AnyRelations = EmptyRelations,
> = Omit<DrizzleMySqlConfig<TRelations>, 'cache' | 'logger'>;
