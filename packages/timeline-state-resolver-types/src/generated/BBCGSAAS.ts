/* eslint-disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run "yarn generate-schema-types" to regenerate this file.
 */
import { ActionExecutionResult } from ".."

export interface BBCGSAASOptions {
	/**
	 * GSAAS Broker URL
	 */
	brokerUrl: string
	/**
	 * GSAAS Client ID
	 */
	clientId: string
	/**
	 * GSAAS API Key
	 */
	apiKey?: string
	/**
	 * HTTP Proxy
	 */
	httpProxy?: string
	/**
	 * HTTPS Proxy
	 */
	httpsProxy?: string
	/**
	 * URLs not to use a proxy for (E.G. github.com)
	 */
	noProxy?: string[]
}

export interface MappingBBCGSAASLayer {
	group: string
	channel: string
	layer: string
	mappingType: MappingBBCGSAASType.Layer
}

export interface MappingBBCGSAASChannel {
	group: string
	channel: string
	mappingType: MappingBBCGSAASType.Channel
}

export enum MappingBBCGSAASType {
	Layer = 'layer',
	Channel = 'channel',
}

export type SomeMappingBBCGSAAS = MappingBBCGSAASLayer | MappingBBCGSAASChannel

export interface ContinuePayload {
	group: string
	channel: string
	zone: string
}

export interface ClearAllPayload {
	group: string
	channel: string
}

export interface ClearZonePayload {
	group: string
	channel: string
	zone: string
}

export enum BBCGSAASActions {
	Resync = 'resync',
	Continue = 'continue',
	ClearAll = 'clearAll',
	ClearZone = 'clearZone'
}
export interface BBCGSAASActionExecutionResults {
	resync: () => void,
	continue: (payload: ContinuePayload) => void,
	clearAll: (payload: ClearAllPayload) => void,
	clearZone: (payload: ClearZonePayload) => void
}
export type BBCGSAASActionExecutionPayload<A extends keyof BBCGSAASActionExecutionResults> = Parameters<
	BBCGSAASActionExecutionResults[A]
>[0]

export type BBCGSAASActionExecutionResult<A extends keyof BBCGSAASActionExecutionResults> =
	ActionExecutionResult<ReturnType<BBCGSAASActionExecutionResults[A]>>
