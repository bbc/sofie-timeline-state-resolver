import { DeviceType } from '..'

export enum TimelineContentTypeBBCGSAAS {
	LOAD = 'load',
	UNLOAD = 'unload',
	UPDATE = 'update',
}

export type TimelineContentBBCGSAASAny =
	| TimelineContentBBCGSAASUpdate
	| TimelineContentBBCGSAASLoad
	| TimelineContentBBCGSAASUnload
export interface TimelineContentBBCGSAASBase {
	deviceType: DeviceType.BBC_GSAAS
	type: TimelineContentTypeBBCGSAAS
}

export type TimelineContentBBCGSAASUpdate = TimelineContentBBCGSAASBase & {
	type: TimelineContentTypeBBCGSAAS.UPDATE
	take: Record<string, any>
	clear: Record<string, any>
}

export type TimelineContentBBCGSAASLoad = TimelineContentBBCGSAASBase & {
	type: TimelineContentTypeBBCGSAAS.LOAD
	scenes: {
		'*'?: string
		[id: string]: string | undefined
	}
}

export type TimelineContentBBCGSAASUnload = TimelineContentBBCGSAASBase & {
	type: TimelineContentTypeBBCGSAAS.UNLOAD
}
