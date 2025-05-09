export type Resolver<T extends { name: string; schema?: string; table?: string }> = (it: {
	created: T[];
	deleted: T[];
}) => Promise<{ created: T[]; deleted: T[]; renamedOrMoved: { from: T; to: T }[] }>;
