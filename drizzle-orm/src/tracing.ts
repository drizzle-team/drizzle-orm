import { type Span, type Tracer } from '@opentelemetry/api';
import { iife } from '~/utils';
import { npmVersion } from '~/version';

let otel: typeof import('@opentelemetry/api') | undefined;
let rawTracer: Tracer | undefined;
// try {
// 	otel = await import('@opentelemetry/api');
// } catch (err: any) {
// 	if (err.code !== 'MODULE_NOT_FOUND' && err.code !== 'ERR_MODULE_NOT_FOUND') {
// 		throw err;
// 	}
// }

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
								message: e instanceof Error ? e.message : 'Unknown error',
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
