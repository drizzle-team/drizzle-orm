import { entityKind } from '~/entity.ts';
import { IndexColumn } from '~/singlestore-core/indexes.ts';
import { SingleStoreTable } from '~/singlestore-core/table.ts';

export type VectorIndexType = 'AUTO' | 'FLAT' | 'IVF_FLAT' | 'IVF_PQ' | 'IVF_PQFS' | 'HNSW_FLAT' | 'HNSW_PQ';
type VectorMetricType = 'EUCLIDEAN_DISTANCE' | 'DOT_PRODUCT';

// type VectorIndexConfigExtensions<T extends VectorIndexType> = T extends 'IVF_FLAT' ? { nlist?: number; nprobe?: number }
// 	: T extends 'IVF_PQ' ? { nlist?: number; m?: number; nbits?: number; nprobe?: number }
// 	: T extends 'IVF_PQFS' ? { nlist?: number; m?: number; nprobe?: number }
// 	: T extends 'HNSW_FLAT' ? { M?: number; efConstruction?: number; ef?: number }
// 	: T extends 'HNSW_PQ' ? { M?: number; efConstruction?: number; m?: number; ef?: number; nbits?: number }
// 	: {};

interface VectorIndexConfig<T extends VectorIndexType> {
	name: string;

	column: IndexColumn;

	indexType: T;

	metricType?: VectorMetricType;

	// type-specific properties

	nlist?: number; // IVF_FLAT, IVF_PQ, IVF_PQFS

	nprobe?: number; // IVF_FLAT, IVF_PQ, IVF_PQFS

	nbits?: number; // IVF_PQ, HNSW_PQ

	m?: number; // IVF_PQ, IVF_PQFS, HNSW_PQ

	M?: number; // HNSW_FLAT, HNSW_PQ

	ef?: number; // HNSW_FLAT, HNSW_PQ

	efConstruction?: number; // HNSW_FLAT, HNSW_PQ
}

// type VectorIndexConfig<T extends VectorIndexType> = VectorIndexConfigBase<T>;

type VectorIndexBuilderMap<T extends VectorIndexType> = T extends 'AUTO' | 'FLAT' ? VectorIndexBuilder<'AUTO' | 'FLAT'>
	: T extends 'IVF_FLAT' ? IVFVectorIndexBuilder<'IVF_FLAT'>
	: T extends 'IVF_PQ' ? IVF_PQVectorIndexBuilder
	: T extends 'IVF_PQFS' ? IVF_PQFSVectorIndexBuilder<'IVF_PQFS'>
	: T extends 'HNSW_FLAT' ? HNSW_FLATVectorIndexBuilder<'HNSW_FLAT'>
	: T extends 'HNSW_PQ' ? HNSW_PQVectorIndexBuilder
	: never;

export class VectorIndexBuilderOn<T extends VectorIndexType> {
	static readonly [entityKind]: string = 'SingleStoreVectorIndexBuilderOn';

	constructor(private name: string, private indexType: T) {}

	on(column: IndexColumn): VectorIndexBuilderMap<T> {
		switch (this.indexType) {
			case 'IVF_FLAT':
				return new IVFVectorIndexBuilder(this.name, column, this.indexType) as VectorIndexBuilderMap<T>;
			case 'IVF_PQ':
				return new IVF_PQVectorIndexBuilder(this.name, column, this.indexType) as VectorIndexBuilderMap<T>;
			case 'IVF_PQFS':
				return new IVF_PQFSVectorIndexBuilder(this.name, column, this.indexType) as VectorIndexBuilderMap<T>;
			case 'HNSW_FLAT':
				return new HNSW_FLATVectorIndexBuilder(this.name, column, this.indexType) as VectorIndexBuilderMap<T>;
			case 'HNSW_PQ':
				return new HNSW_PQVectorIndexBuilder(this.name, column, this.indexType) as VectorIndexBuilderMap<T>;
			default:
				// this.indexType is "AUTO" or "FLAT"
				return new VectorIndexBuilder<'AUTO' | 'FLAT'>(this.name, column, this.indexType) as VectorIndexBuilderMap<T>;
		}
	}
}

export interface AnyVectorIndexBuilder<T extends VectorIndexType> {
	build(table: SingleStoreTable): VectorIndex<T>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface VectorIndexBuilder<T extends VectorIndexType> extends AnyVectorIndexBuilder<T> {}

export class VectorIndexBuilder<T extends VectorIndexType> implements AnyVectorIndexBuilder<T> {
	static readonly [entityKind]: string = 'SingleStoreVectorIndexBuilder';

	/** @internal */
	config: VectorIndexConfig<T>;

	constructor(name: string, column: IndexColumn, indexType: T) {
		this.config = {
			name,
			column,
			indexType,
		} as VectorIndexConfig<T>;
	}

	metricType(metricType: VectorMetricType): this {
		this.config.metricType = metricType;
		return this;
	}

	/** @internal */
	build(table: SingleStoreTable): VectorIndex<T> {
		return new VectorIndex(this.config, table);
	}
}

class IVFVectorIndexBuilder<T extends 'IVF_FLAT' | 'IVF_PQ' | 'IVF_PQFS'> extends VectorIndexBuilder<T> {
	nlist(nlist: number): this {
		this.config.nlist = nlist;
		return this;
	}

	nprobe(nprobe: number): this {
		this.config.nprobe = nprobe;
		return this;
	}
}

class IVF_PQFSVectorIndexBuilder<T extends 'IVF_PQ' | 'IVF_PQFS'> extends IVFVectorIndexBuilder<T> {
	m(m: number): this {
		this.config.m = m;
		return this;
	}
}

class IVF_PQVectorIndexBuilder extends IVF_PQFSVectorIndexBuilder<'IVF_PQ'> {
	nbits(nbits: number): this {
		this.config.nbits = nbits;
		return this;
	}
}

class HNSW_FLATVectorIndexBuilder<T extends 'HNSW_FLAT' | 'HNSW_PQ'> extends VectorIndexBuilder<T> {
	M(M: number): this {
		this.config.M = M;
		return this;
	}

	ef(ef: number): this {
		this.config.ef = ef;
		return this;
	}

	efConstruction(efConstruction: number): this {
		this.config.efConstruction = efConstruction;
		return this;
	}
}

class HNSW_PQVectorIndexBuilder extends HNSW_FLATVectorIndexBuilder<'HNSW_PQ'> {
	m(m: number): this {
		this.config.m = m;
		return this;
	}

	nbits(nbits: number): this {
		this.config.nbits = nbits;
		return this;
	}
}

export class VectorIndex<T extends VectorIndexType> {
	static readonly [entityKind]: string = 'SingleStoreVectorIndex';

	readonly config: VectorIndexConfig<T> & { table: SingleStoreTable };

	constructor(config: VectorIndexConfig<T>, table: SingleStoreTable) {
		this.config = { ...config, table };
	}
}

export function vectorIndex<T extends VectorIndexType>(
	name: string,
	indexType: T = 'AUTO' as T,
): VectorIndexBuilderOn<T> {
	return new VectorIndexBuilderOn(name, indexType);
}
