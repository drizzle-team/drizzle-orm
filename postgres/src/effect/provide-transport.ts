// make, layer and layerConfig of /effect/core with a runtime's transport already provided. Each runtime
// client module exports the result.
import type * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Core from './core-client.ts';
import type { DrizzlePostgresTransport } from './DrizzlePostgresTransport.ts';

export const provideTransport = (transport: Layer.Layer<DrizzlePostgresTransport>) => ({
	/** Creates a client with its own pool. The pool opens now and ends when the scope closes. */
	make: (config: Core.DrizzlePostgresClientConfig) => Effect.provide(Core.make(config), transport),
	/** A layer with its own pool, opened when the layer is built and ended when its scope closes. */
	layer: (config: Core.DrizzlePostgresClientConfig) => Core.layer(config).pipe(Layer.provide(transport)),
	/** Like `layer`, with the settings read from Effect Config. */
	layerConfig: (config: Config.Wrap<Core.DrizzlePostgresClientConfig>) =>
		Core.layerConfig(config).pipe(Layer.provide(transport)),
});
