// The DrizzlePostgresClient namespace for Node and Bun. Its make, layer and layerConfig already provide the
// transport that dials with node:net and node:tls.
import { layer as transport } from './node-transport.ts';
import { provideTransport } from './provide-transport.ts';

export * from './DrizzlePostgresClient.ts';

export const { make, layer, layerConfig } = provideTransport(transport);
