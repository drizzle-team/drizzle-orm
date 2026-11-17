import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleSQLiteConfig } from '../utils.ts';

export type EffectDrizzleSQLiteConfig<
	TRelations extends AnyRelations = EmptyRelations,
> = Omit<DrizzleSQLiteConfig<TRelations>, 'cache' | 'logger'>;
