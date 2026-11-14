// The DrizzlePostgresHttpClient namespace for the httpostgres gateway: make, layer and layerConfig create the
// client with @drizzle-team/postgres/http.
import * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import { HttpClient, type HttpConfig } from '../http.ts';
import { toSqlError } from './DrizzlePostgresClient.ts';
import * as Shared from './DrizzlePostgresHttpClient.ts';

export * from './DrizzlePostgresHttpClient.ts';

/** The gateway client's settings, with the token as Redacted (or a getter), plus span attributes. */
export interface DrizzlePostgresHttpClientConfig extends Omit<HttpConfig, 'token'>, Shared.FromClientOptions {
	readonly token?: Redacted.Redacted | (() => string | Promise<string>) | undefined;
}

const hostOf = (url: string) => {
	try {
		return new URL(url).host;
	} catch {
		return undefined;
	}
};

/** The service over a gateway client that the caller created. */
export const fromClient = (client: HttpClient, options?: Shared.FromClientOptions) =>
	Shared.fromClient('gateway', client, options);

/** Creates the service with its own gateway client. HTTP holds no connections, so there is nothing to close. */
export const make = (config: DrizzlePostgresHttpClientConfig) =>
	Effect.try({
		try: () => {
			const { token, spanAttributes, ...rest } = config;
			const client = new HttpClient({ ...rest, token: Redacted.isRedacted(token) ? Redacted.value(token) : token });
			return Shared.fromClient('gateway', client, { spanAttributes, host: hostOf(config.url) });
		},
		catch: (e) => toSqlError(e, 'connect'),
	});

/** A layer with its own gateway client. */
export const layer = (config: DrizzlePostgresHttpClientConfig) =>
	Layer.effect(Shared.DrizzlePostgresHttpClient, make(config));

/** Like `layer`, with the settings read from Effect Config. */
export const layerConfig = (config: Config.Wrap<DrizzlePostgresHttpClientConfig>) =>
	Layer.effect(Shared.DrizzlePostgresHttpClient, Effect.flatMap(Config.unwrap(config), make));

/** A layer over a gateway client that the caller created. */
export const layerFromClient = (client: HttpClient, options?: Shared.FromClientOptions) =>
	Shared.layerFromClient('gateway', client, options);
