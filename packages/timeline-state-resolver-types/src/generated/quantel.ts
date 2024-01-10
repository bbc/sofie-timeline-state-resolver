/* eslint-disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run "yarn generate-schema-types" to regenerate this file.
 */

export interface QuantelOptions {
	/**
	 * Url to the quantel gateway
	 */
	gatewayUrl: string
	/**
	 * Location of the ISA manager to be connected to first of all
	 */
	ISAUrlMaster: string
	/**
	 * Optional backup ISA manager for the gateway to switch to in the event of failure of the master
	 */
	ISAUrlBackup?: string
	/**
	 * The ID of the zone to use. If omitted, will be using 'default'
	 */
	zoneId?: string
	/**
	 * The id of the server to control. An integer
	 */
	serverId: number
	/**
	 * If set: If a clip turns out to be on the wrong server, an attempt to copy the clip will be done
	 */
	allowCloneClips?: boolean
	/**
	 * If the ISA goes down the gateway will temporarily emit a disconnection warning, this is a false flag when a backup ISA is available. This option will suppress the disconnection warning for a number of ms to give the system time to switch without warnings.
	 */
	suppressDisconnectTime?: number
}

export interface MappingQuantelPort {
	/**
	 * The port to use
	 */
	portId: string
	/**
	 * The channel to connect the port to
	 */
	channelId: number
	mode?: QuantelControlMode
	mappingType: MappingQuantelType.Port
}

/**
 * Which strategy to use during "busy times" (defaults to QUALITY)
 */
export enum QuantelControlMode {
	QUALITY = 'quality',
	SPEED = 'speed'
}

export enum MappingQuantelType {
	Port = 'port',
}

export type SomeMappingQuantel = MappingQuantelPort

export enum QuantelActions {
	RestartGateway = 'restartGateway',
	ClearStates = 'clearStates',
}
