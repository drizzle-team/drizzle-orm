// The DrizzlePostgresClient namespace for Cloudflare Workers. Its make, layer and layerConfig already provide the
// transport that dials with cloudflare:sockets.
import { provideTransport } from './provide-transport.ts'
import { layer as transport } from './cf-transport.ts'

export * from './DrizzlePostgresClient.ts'

export const { make, layer, layerConfig } = provideTransport(transport)
