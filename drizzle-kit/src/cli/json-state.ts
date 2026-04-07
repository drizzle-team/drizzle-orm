export abstract class JsonState<TPayload extends Record<string, unknown>> {
	protected abstract payload(): TPayload;

	toJSON(): { status: 'ok' } & TPayload {
		return Object.assign({ status: 'ok' as const }, this.payload());
	}
}
