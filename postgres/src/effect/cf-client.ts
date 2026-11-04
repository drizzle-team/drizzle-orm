// The DrizzlePostgresClient namespace for Cloudflare Workers. Its make, layer and layerConfig already provide the
// transport that dials with cloudflare:sockets.
import { layer as transport } from './cf-transport.ts';
import { provideTransport } from './provide-transport.ts';

export * from './DrizzlePostgresClient.ts';

export const { make, layer, layerConfig } = provideTransport(transport);
