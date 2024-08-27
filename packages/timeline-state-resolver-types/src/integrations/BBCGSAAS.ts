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

interface Scene {
	name: string
	updateMode: string
	startupDelay: number
	throttle: number
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
		'*'?: Scene
		[id: string]: Scene | undefined
	}
}

export type TimelineContentBBCGSAASUnload = TimelineContentBBCGSAASBase & {
	type: TimelineContentTypeBBCGSAAS.UNLOAD
}

export type TimelineContentBBCGSAASUpdate = TimelineContentBBCGSAASBase & {
	type: TimelineContentTypeBBCGSAAS.UPDATE
	take: {
		id: string
		zones: Record<string, any>
	}
	clear: {
		id: string
		zones: {
			[id: string]: Record<string, any>
		}
	}
}
