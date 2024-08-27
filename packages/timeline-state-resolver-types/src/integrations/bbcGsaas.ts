import { DeviceType } from '..'

/** GSAAS update actions. */
export enum BBCGSAASUpdateAction {
	/** Clear a zone. */
	Clear = 'CLEAR',
	/** Update the graphic in a zone. */
	Take = 'TAKE',
}

/** Permissions a GSAAS client may have. */
export enum BBCGSAASClientPermissions {
	/** Clear all graphics within a zone. */
	ClearAll = 'clearAll',
	/** Continue a stepped graphic. */
	Continue = 'continue',
	/** Load a channel. */
	Load = 'load',
	/** Unload a channel. */
	Unload = 'unload',
	/** Update data within a channel. */
	Update = 'update',
}

export enum TimelineContentTypeBBCGSAAS {
	/** Load a channel. */
	LOAD = 'load',
	/** Unload a channel. */
	UNLOAD = 'unload',
	/** Update data within a channel. */
	UPDATE = 'update',
}

export type TimelineContentBBCGSAASAny =
	| TimelineContentBBCGSAASLoad
	| TimelineContentBBCGSAASUnload
	| TimelineContentBBCGSAASUpdate

export interface TimelineContentBBCGSAASBase {
	deviceType: DeviceType.BBC_GSAAS
	type: TimelineContentTypeBBCGSAAS
}

export type TimelineContentBBCGSAASLoad = TimelineContentBBCGSAASBase & {
	type: TimelineContentTypeBBCGSAAS.LOAD
	control: {
		[id: string]: {
			permissions: BBCGSAASClientPermissions[]
			priority: number
		}
	}
	scenes: {
		'*'?: string
		[id: string]: string | undefined
	}
}

export type TimelineContentBBCGSAASUnload = TimelineContentBBCGSAASBase & {
	type: TimelineContentTypeBBCGSAAS.UNLOAD
}

export type TimelineContentBBCGSAASUpdate = TimelineContentBBCGSAASBase & {
	type: TimelineContentTypeBBCGSAAS.UPDATE
	take: {
		id: string
		zones: {
			[id: string]: {
				action: BBCGSAASUpdateAction.Take
				component: string
				priority?: number
				immediate?: boolean
				step?: number
				props: Record<string, any>
			}
		}
	}
	clear: {
		id: string
		zones: {
			[id: string]: {
				action: BBCGSAASUpdateAction.Clear
				priority?: number
				immediate?: boolean
			}
		}
	}
}
