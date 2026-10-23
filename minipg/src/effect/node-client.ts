// The MinipgClient namespace for Node and Bun. Its make, layer and layerConfig already provide the
// transport that dials with node:net and node:tls.
import { provideTransport } from './provide-transport.ts'
import { layer as transport } from './node-transport.ts'

export * from './MinipgClient.ts'

export const { make, layer, layerConfig } = provideTransport(transport)
