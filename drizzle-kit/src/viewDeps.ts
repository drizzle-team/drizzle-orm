type ViewWithDefinition = {
	name: string;
	definition?: string;
	schema?: string;
	[key: string]: unknown;
};

function extractViewDependencies(
	definition: string,
	allViewNames: Set<string>,
	dialect: 'pg' | 'mysql' | 'sqlite',
): Set<string> {
	const deps = new Set<string>();
	if (!definition) return deps;

	for (const viewName of allViewNames) {
		let pattern: RegExp;
		if (dialect === 'mysql') {
			pattern = new RegExp(`(?:^|[\\s,(\`])` + '`' + escapeRegex(viewName) + '`' + `(?:[\\s,);\`]|$)`);
		} else {
			pattern = new RegExp(
				`(?:^|[\\s,("])` + '"' + escapeRegex(viewName) + '"' + `(?:[\\s,);"]|$)`,
			);
		}
		if (pattern.test(definition)) {
			deps.add(viewName);
		}
	}

	return deps;
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sortCreateViewStatements<T extends ViewWithDefinition>(
	views: T[],
	dialect: 'pg' | 'mysql' | 'sqlite',
): T[] {
	if (views.length <= 1) return views;

	const allViewNames = new Set(views.map((v) => v.name));
	const graph = new Map<string, Set<string>>();
	const viewMap = new Map<string, T>();

	for (const view of views) {
		viewMap.set(view.name, view);
		const deps = view.definition
			? extractViewDependencies(view.definition, allViewNames, dialect)
			: new Set<string>();
		deps.delete(view.name);
		graph.set(view.name, deps);
	}

	const sorted: T[] = [];
	const visited = new Set<string>();
	const visiting = new Set<string>();

	function visit(name: string): void {
		if (visited.has(name)) return;
		if (visiting.has(name)) return;

		visiting.add(name);

		const deps = graph.get(name);
		if (deps) {
			for (const dep of deps) {
				if (viewMap.has(dep)) {
					visit(dep);
				}
			}
		}

		visiting.delete(name);
		visited.add(name);

		const view = viewMap.get(name);
		if (view) {
			sorted.push(view);
		}
	}

	for (const view of views) {
		visit(view.name);
	}

	return sorted;
}

export function sortDropViewStatements<T extends ViewWithDefinition>(
	drops: T[],
	allViews: Record<string, ViewWithDefinition>,
	dialect: 'pg' | 'mysql' | 'sqlite',
): T[] {
	if (drops.length <= 1) return drops;

	const allViewNames = new Set(Object.values(allViews).map((v) => v.name));
	const graph = new Map<string, Set<string>>();

	for (const [, view] of Object.entries(allViews)) {
		const deps = view.definition
			? extractViewDependencies(view.definition, allViewNames, dialect)
			: new Set<string>();
		deps.delete(view.name);
		graph.set(view.name, deps);
	}

	const dropNames = new Set(drops.map((d) => d.name));
	const dropMap = new Map<string, T>();
	for (const drop of drops) {
		dropMap.set(drop.name, drop);
	}

	const dependents = new Map<string, Set<string>>();
	for (const [name, deps] of graph) {
		for (const dep of deps) {
			if (!dependents.has(dep)) dependents.set(dep, new Set());
			dependents.get(dep)!.add(name);
		}
	}

	const sorted: T[] = [];
	const visited = new Set<string>();
	const visiting = new Set<string>();

	function visit(name: string): void {
		if (visited.has(name)) return;
		if (visiting.has(name)) return;

		visiting.add(name);

		const depsOnThis = dependents.get(name);
		if (depsOnThis) {
			for (const dep of depsOnThis) {
				if (dropNames.has(dep)) {
					visit(dep);
				}
			}
		}

		visiting.delete(name);
		visited.add(name);

		const drop = dropMap.get(name);
		if (drop) {
			sorted.push(drop);
		}
	}

	for (const drop of drops) {
		visit(drop.name);
	}

	return sorted;
}
