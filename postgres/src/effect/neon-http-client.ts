// The DrizzlePostgresHttpClient namespace for Neon's SQL-over-HTTP endpoint: make, layer and layerConfig create the
// client with @drizzle-team/postgres/neon-http.
import * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import { NeonHttpClient, type NeonHttpConfig } from '../neon-http.ts';
import { toSqlError } from './DrizzlePostgresClient.ts';
import * as Shared from './DrizzlePostgresHttpClient.ts';

export * from './DrizzlePostgresHttpClient.ts';

/** The Neon HTTP client's settings, with the connection string, password and auth token as Redacted, plus span
 *  attributes. */
export interface NeonHttpClientConfig
	extends Omit<NeonHttpConfig, 'url' | 'password' | 'authToken'>, Shared.FromClientOptions
{
	readonly url?: Redacted.Redacted | undefined;
	readonly password?: Redacted.Redacted | undefined;
	/** A bearer token (or a getter) for Neon Authorize / RLS. */
	readonly authToken?: Redacted.Redacted | (() => string | Promise<string>) | undefined;
}

const hostOf = (config: NeonHttpClientConfig) => {
	if (config.host) return config.host;
	try {
		return config.url ? new URL(Redacted.value(config.url)).hostname : undefined;
	} catch {
		return undefined;
	}
};

/** The service over a Neon HTTP client that the caller created. */
export const fromClient = (client: NeonHttpClient, options?: Shared.FromClientOptions) =>
	Shared.fromClient('neon', client, options);

/** Creates the service with its own Neon HTTP client. HTTP holds no connections, so there is nothing to close. */
export const make = (config: NeonHttpClientConfig) =>
	Effect.try({
		try: () => {
			const { url, password, authToken, spanAttributes, ...rest } = config;
			const client = new NeonHttpClient({
				...rest,
				url: url && Redacted.value(url),
				password: password && Redacted.value(password),
				authToken: Redacted.isRedacted(authToken) ? Redacted.value(authToken) : authToken,
			});
			return Shared.fromClient('neon', client, { spanAttributes, host: hostOf(config) });
		},
		catch: (e) => toSqlError(e, 'connect'),
	});

/** A layer with its own Neon HTTP client. */
export const layer = (config: NeonHttpClientConfig) => Layer.effect(Shared.DrizzlePostgresHttpClient, make(config));

/** Like `layer`, with the settings read from Effect Config. */
export const layerConfig = (config: Config.Wrap<NeonHttpClientConfig>) =>
	Layer.effect(Shared.DrizzlePostgresHttpClient, Effect.flatMap(Config.unwrap(config), make));

/** A layer over a Neon HTTP client that the caller created. */
export const layerFromClient = (client: NeonHttpClient, options?: Shared.FromClientOptions) =>
	Shared.layerFromClient('neon', client, options);
