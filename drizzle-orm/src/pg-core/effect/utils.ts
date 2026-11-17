import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzlePgConfig } from '../utils.ts';

export type EffectDrizzlePgConfig<
	TRelations extends AnyRelations = EmptyRelations,
> = Omit<DrizzlePgConfig<TRelations>, 'cache' | 'logger'>;
