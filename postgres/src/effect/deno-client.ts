// The DrizzlePostgresClient namespace for Deno. Its make, layer and layerConfig already provide the
// transport that dials with Deno.connect.
import { provideTransport } from './provide-transport.ts'
import { layer as transport } from './deno-transport.ts'

export * from './DrizzlePostgresClient.ts'

export const { make, layer, layerConfig } = provideTransport(transport)
