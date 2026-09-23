class WorkerEntrypoint {
	constructor(ctx, env) {
		this.ctx = ctx;
		this.env = env;
	}
}

class DurableObject {
	constructor(state, env) {
		this.state = state;
		this.env = env;
	}
}

class RpcTarget {
	constructor(value) {
		this.value = value;
	}
}

class RpcStub extends RpcTarget {}

const env = {};
const caches = { default: {} };
const scheduler = {};
const executionCtx = {};

module.exports = {
	WorkerEntrypoint,
	DurableObject,
	RpcTarget,
	RpcStub,
	env,
	caches,
	scheduler,
	executionCtx,
};
