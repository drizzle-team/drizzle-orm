import type { Span, Tracer } from '@opentelemetry/api';
import { iife } from '~/tracing-utils.ts';
import { npmVersion } from '~/version.ts';

let otel: typeof import('@opentelemetry/api') | undefined;
let rawTracer: Tracer | undefined;

// Dynamically import OpenTelemetry API to avoid requiring it at build time.
// This allows the library to be used without OpenTelemetry installed, while still providing tracing capabilities if it is available.
import('@opentelemetry/api').then(o => otel = o).catch(err => {
	if (err.code !== 'MODULE_NOT_FOUND' && err.code !== 'ERR_MODULE_NOT_FOUND') {
		console.error("unable to load '@opentelemetry/api' module, tracing will not be available", err);
	}
});

type SpanName =
	| 'drizzle.operation'
	| 'drizzle.prepareQuery'
	| 'drizzle.buildSQL'
	| 'drizzle.execute'
	| 'drizzle.driver.execute'
	| 'drizzle.mapResponse';

/** @internal */
export const tracer = {
	startActiveSpan<F extends (span?: Span) => unknown>(name: SpanName, fn: F): ReturnType<F> {
		if (!otel) {
			return fn() as ReturnType<F>;
		}

		if (!rawTracer) {
			rawTracer = otel.trace.getTracer('drizzle-orm', npmVersion);
		}

		return iife(
			(otel, rawTracer) =>
				rawTracer.startActiveSpan(
					name,
					((span: Span) => {
						try {
							return fn(span);
						} catch (e) {
							span.setStatus({
								code: otel.SpanStatusCode.ERROR,
								message: e instanceof Error ? e.message : 'Unknown error', // eslint-disable-line no-instanceof/no-instanceof
							});
							throw e;
						} finally {
							span.end();
						}
					}) as F,
				),
			otel,
			rawTracer,
		);
	},
};
