import { Layer } from 'effect';
import { EffectCache } from '~/cache/core/cache-effect.ts';
import { EffectLogger } from './logger.ts';

export const DefaultServices = Layer.merge(
	EffectCache.Default,
	EffectLogger.Default,
);
