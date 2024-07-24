import type { SingleStoreColumn } from ".."
import type { ColumnBaseConfig, ColumnDataType } from "~/index"

export type OptimizeTableArgument =
	| 'FULL'
	| 'FLUSH'
	| 'FIX_ALTER'
	| 'INDEX'

export type SelectedColumns = [SingleStoreColumn<ColumnBaseConfig<ColumnDataType, string>, object>]
