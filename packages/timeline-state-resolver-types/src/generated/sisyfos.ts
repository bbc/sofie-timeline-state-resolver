/* eslint-disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run "yarn generate-schema-types" to regenerate this file.
 */
import { ActionExecutionResult } from ".."

export interface SisyfosOptions {
	host: string
	port: number
}

export interface MappingSisyfosChannel {
	channel: number
	setLabelToLayerName?: boolean
	mappingType: MappingSisyfosType.Channel
}

export interface MappingSisyfosChannelByLabel {
	label: string
	mappingType: MappingSisyfosType.ChannelByLabel
}

export interface MappingSisyfosChannels {
	mappingType: MappingSisyfosType.Channels
}

export enum MappingSisyfosType {
	Channel = 'channel',
	ChannelByLabel = 'channel_by_label',
	Channels = 'channels',
}

export type SomeMappingSisyfos = MappingSisyfosChannel | MappingSisyfosChannelByLabel | MappingSisyfosChannels

export interface ReSyncChannelPayload {
	channel: number
}

export interface SetSisyfosChannelStatePayload {
	channel: number
}

export enum SisyfosActions {
	Reinit = 'reinit',
	ReSyncChannel = 'reSyncChannel',
	SetSisyfosChannelState = 'setSisyfosChannelState'
}
export interface SisyfosActionExecutionResults {
	reinit: () => void,
	reSyncChannel: (payload: ReSyncChannelPayload) => void,
	setSisyfosChannelState: (payload: SetSisyfosChannelStatePayload) => void
}
export type SisyfosActionExecutionPayload<A extends keyof SisyfosActionExecutionResults> = Parameters<
	SisyfosActionExecutionResults[A]
>[0]

export type SisyfosActionExecutionResult<A extends keyof SisyfosActionExecutionResults> =
	ActionExecutionResult<ReturnType<SisyfosActionExecutionResults[A]>>
