import { DeviceType } from '..'

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
			permissions: string[]
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
				action: 'TAKE'
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
				action: 'CLEAR'
				priority?: number
				immediate?: boolean
			}
		}
	}
}
