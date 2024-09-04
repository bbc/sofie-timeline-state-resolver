import { CommandWithContext, Device } from '../../service/device'
import {
	ActionExecutionResult,
	ActionExecutionResultCode,
	DeviceStatus,
	StatusCode,
	TSRTimelineContent,
	Timeline,
	BBCGSAASOptions,
	TimelineContentTypeBBCGSAAS,
	Mappings,
	Mapping,
	DeviceType,
	ContinuePayload,
	ClearAllPayload,
	ClearZonePayload,
	TimelineContentBBCGSAASLoad,
	TimelineContentBBCGSAASUpdate,
	BBCGSAASActions,
	MappingBBCGSAASType,
	SomeMappingBBCGSAAS,
} from 'timeline-state-resolver-types'

import CacheableLookup from 'cacheable-lookup'
import { isEqual } from 'underscore'
import got, { OptionsOfJSONResponseBody, RequestError, Response } from 'got'
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent'
import { cloneDeep, t } from '../../lib'

export type BBCGSAASDeviceState = {
	[group: string]: {
		[channel: string]: {
			/** Timeline Object ID for the LOAD command. */
			tlObjId?: string
			control: TimelineContentBBCGSAASLoad['control']
			scenes: TimelineContentBBCGSAASLoad['scenes']
			objects: {
				/** Timeline Object ID that generated this object. */
				tlObjId: string
				take: TimelineContentBBCGSAASUpdate['take']
				clear: TimelineContentBBCGSAASUpdate['clear']
			}[]
		}
	}
}

export interface BBCGSAASDeviceCommand extends CommandWithContext {
	command:
		| {
				type: TimelineContentTypeBBCGSAAS.LOAD
				group: string
				channel: string
				payload: Pick<TimelineContentBBCGSAASLoad, 'control' | 'scenes'>
		  }
		| {
				type: TimelineContentTypeBBCGSAAS.UNLOAD
				group: string
				channel: string
		  }
		| {
				type: TimelineContentTypeBBCGSAAS.UPDATE
				group: string
				channel: string
				payload: TimelineContentBBCGSAASUpdate['take'] | TimelineContentBBCGSAASUpdate['clear']
		  }
}

export class BBCGSAASDevice extends Device<BBCGSAASOptions, BBCGSAASDeviceState, BBCGSAASDeviceCommand> {
	private options!: BBCGSAASOptions
	//private activeLayers = new Map<string, string>()
	private cacheable!: CacheableLookup
	private _terminated = false
	private _internalState: BBCGSAASDeviceState = {}

	async init(options: BBCGSAASOptions): Promise<boolean> {
		this.options = {
			...options,
			brokerUrl: options.brokerUrl.endsWith('/') ? options.brokerUrl : `${options.brokerUrl}/`,
		}
		this.cacheable = new CacheableLookup()
		return true
	}
	async terminate(): Promise<void> {
		this._terminated = true
	}

	get connected(): boolean {
		return false
	}
	getStatus(): Omit<DeviceStatus, 'active'> {
		return {
			statusCode: StatusCode.GOOD,
			messages: [],
		}
	}

	readonly actions: {
		[id in BBCGSAASActions]: (id: string, payload?: Record<string, any>) => Promise<ActionExecutionResult>
	} = {
		[BBCGSAASActions.Resync]: async () => {
			this.context.resetResolver()
			return { result: ActionExecutionResultCode.Ok }
		},
		[BBCGSAASActions.Continue]: async (_id: string, payload?: Record<string, any>) =>
			this.continue(payload as ContinuePayload | undefined),
		[BBCGSAASActions.ClearAll]: async (_id: string, payload?: Record<string, any>) =>
			this.clearAll(payload as ClearAllPayload | undefined),
		[BBCGSAASActions.ClearZone]: async (_id: string, payload?: Record<string, any>) =>
			this.clearZone(payload as ClearZonePayload | undefined),
	}

	private async continue(payload?: ContinuePayload): Promise<ActionExecutionResult> {
		if (!payload) {
			return {
				result: ActionExecutionResultCode.Error,
				response: t('Failed to send contine: Missing payload'),
			}
		}
		const { channel, group, zone } = payload
		const endpoint = `continue/${group}/${channel}/${zone}`

		try {
			const response = await this.sendToBroker(endpoint)

			if (!response) {
				return {
					result: ActionExecutionResultCode.Error,
					response: t('GSAAS Broker did not respond'),
				}
			}

			if (response.statusCode >= 200 && response.statusCode <= 299) {
				this.context.logger.debug(
					`BBC GSAAS: continue: Good statuscode response on url "${endpoint}": ${response.statusCode}`
				)
				return {
					result: ActionExecutionResultCode.Ok,
				}
			} else {
				this.context.logger.warning(
					`BBC GSAAS: continue Bad statuscode response on url "${endpoint}": ${response.statusCode}`
				)
				return {
					result: ActionExecutionResultCode.Error,
					response: t('GSAAS Broker responded with an error'),
				}
			}
		} catch (error) {
			const err = error as RequestError // make typescript happy

			this.context.logger.error(`BBC GSAAS response error on continue "${endpoint}"`, err)
			return {
				result: ActionExecutionResultCode.Error,
				response: t('Failed to send command to GSAAS broker'),
			}
		}
	}

	private async clearAll(payload?: ClearAllPayload): Promise<ActionExecutionResult> {
		if (!payload) {
			return {
				result: ActionExecutionResultCode.Error,
				response: t('Failed to send clearAll: Missing payload'),
			}
		}
		const { channel, group } = payload
		const endpoint = `clearAll/${group}/${channel}`

		try {
			const response = await this.sendToBroker(endpoint)

			if (!response) {
				return {
					result: ActionExecutionResultCode.Error,
					response: t('GSAAS Broker did not respond'),
				}
			}

			if (response.statusCode >= 200 && response.statusCode <= 299) {
				this.context.logger.debug(
					`BBC GSAAS: clearAll: Good statuscode response on url "${endpoint}": ${response.statusCode}`
				)
				await this.context.resetState()
				return {
					result: ActionExecutionResultCode.Ok,
				}
			} else {
				this.context.logger.warning(
					`BBC GSAAS: clearAll Bad statuscode response on url "${endpoint}": ${response.statusCode}`
				)
				return {
					result: ActionExecutionResultCode.Error,
					response: t('GSAAS Broker responded with an error'),
				}
			}
		} catch (error) {
			const err = error as RequestError // make typescript happy

			this.context.logger.error(`BBC GSAAS response error on clearAll "${endpoint}"`, err)
			return {
				result: ActionExecutionResultCode.Error,
				response: t('Failed to send command to GSAAS broker'),
			}
		}
	}

	private async clearZone(payload?: ClearZonePayload): Promise<ActionExecutionResult> {
		if (!payload) {
			return {
				result: ActionExecutionResultCode.Error,
				response: t('Failed to send clearZone: Missing payload'),
			}
		}

		const { channel, group, zone } = payload
		const endpoint = `update/${group}/${channel}`

		if (this._internalState[group] && this._internalState[group][channel]) {
			const obj = this._internalState[group][channel].objects.filter((o) => o.clear.zones[zone])
			if (obj.length > 0) {
				try {
					const response = await this.sendToBroker(endpoint, obj[0].clear)

					if (!response) {
						return {
							result: ActionExecutionResultCode.Error,
							response: t('GSAAS Broker did not respond'),
						}
					}

					if (response.statusCode >= 200 && response.statusCode <= 299) {
						this.context.logger.debug(
							`BBC GSAAS: clearZone: Good statuscode response on url "${endpoint}": ${response.statusCode}`
						)

						await this.context.resetToState(this._internalState)
						return {
							result: ActionExecutionResultCode.Ok,
						}
					} else {
						this.context.logger.warning(
							`BBC GSAAS: clearZone Bad statuscode response on url "${endpoint}": ${response.statusCode}`
						)
						return {
							result: ActionExecutionResultCode.Error,
							response: t('GSAAS Broker responded with an error'),
						}
					}
				} catch (error) {
					const err = error as RequestError // make typescript happy

					this.context.logger.error(`BBC GSAAS response error on clearZone "${endpoint}"`, err)
					return {
						result: ActionExecutionResultCode.Error,
						response: t('Failed to send command to GSAAS broker'),
					}
				}
			} else {
				return {
					result: ActionExecutionResultCode.Ok,
				}
			}
		} else {
			return {
				result: ActionExecutionResultCode.Ok,
			}
		}
	}

	convertTimelineStateToDeviceState(
		state: Timeline.TimelineState<TSRTimelineContent>,
		mappings: Mappings
	): BBCGSAASDeviceState {
		const newState: BBCGSAASDeviceState = {}

		for (const layer of Object.keys(state.layers)) {
			if (!mappings[layer]) continue
			const mapping = mappings[layer] as Mapping<SomeMappingBBCGSAAS>
			const { group, channel, mappingType } = mapping.options

			const { content, id } = state.layers[layer]

			if (!newState[group]) {
				newState[group] = {
					[channel]: {
						control: {},
						scenes: {},
						objects: [],
					},
				}
			} else if (!newState[group][channel]) {
				newState[group][channel] = {
					control: {},
					scenes: {},
					objects: [],
				}
			}
			if (content.deviceType === DeviceType.BBC_GSAAS && mapping) {
				switch (content.type) {
					case TimelineContentTypeBBCGSAAS.LOAD:
						if (mappingType !== MappingBBCGSAASType.Channel) {
							continue
						}
						newState[group][channel] = {
							tlObjId: id,
							control: content.control,
							scenes: {
								...content.scenes,
							},
							objects: [],
						}
						continue

					case TimelineContentTypeBBCGSAAS.UPDATE:
						if (mappingType !== MappingBBCGSAASType.Layer) {
							continue
						}
						newState[group][channel].objects.push({
							tlObjId: id,
							take: content.take,
							clear: content.clear,
						})
						continue

					case TimelineContentTypeBBCGSAAS.UNLOAD:
						if (mappingType !== MappingBBCGSAASType.Channel) {
							continue
						}
						newState[group][channel] = {
							tlObjId: id,
							control: {},
							scenes: {},
							objects: [],
						}
						continue
				}
			}
		}
		this._internalState = cloneDeep(newState)
		return newState
	}

	diffStates(oldState: BBCGSAASDeviceState | undefined, newState: BBCGSAASDeviceState): Array<BBCGSAASDeviceCommand> {
		const loadCommands: Array<BBCGSAASDeviceCommand> = []
		const unloadCommands: Array<BBCGSAASDeviceCommand> = []
		const scenesCommands: Array<BBCGSAASDeviceCommand> = []

		const zonesMap: {
			[group: string]: {
				[channel: string]: {
					[zone: string]: Record<string, any>
				}
			}
		} = {}

		for (const groupId of Object.keys(newState)) {
			zonesMap[groupId] = {}
			if (oldState && oldState[groupId]) {
				// Group already exists
				for (const channelId of Object.keys(newState[groupId])) {
					zonesMap[groupId][channelId] = {}
					const newChannel = newState[groupId][channelId]
					if (oldState[groupId][channelId]) {
						// Channel already exists.
						const oldChannel = oldState[groupId][channelId]

						// No keys means unload everything.
						if (Object.keys(newChannel.scenes).length === 0) {
							unloadCommands.push({
								timelineObjId: newChannel.tlObjId ?? '',
								context: `Unloaded scenes for channel ${channelId} in group ${groupId}`,
								command: {
									type: TimelineContentTypeBBCGSAAS.UNLOAD,
									group: groupId,
									channel: channelId,
								},
							})
						} else if (!isEqual(oldChannel.scenes, newChannel.scenes)) {
							loadCommands.push({
								timelineObjId: newChannel.tlObjId ?? '',
								context: `Updated scenes for channel ${channelId} in group ${groupId}`,
								command: {
									type: TimelineContentTypeBBCGSAAS.LOAD,
									group: groupId,
									channel: channelId,
									payload: {
										control: newChannel.control,
										scenes: newChannel.scenes,
									},
								},
							})
						}

						for (const obj of newChannel.objects) {
							for (const zone of Object.keys(obj.take.zones)) {
								if (zonesMap[groupId][channelId][zone]) {
									this.context.logger.warning(`GSAAS Zone ${zone} is defined twice in take requests`)
								}
								zonesMap[groupId][channelId][zone] = obj.take.zones[zone]
							}
						}
					} else {
						// New channel.
						if (newChannel.scenes) {
							loadCommands.push({
								timelineObjId: newChannel.tlObjId ?? '',
								context: `Added channel ${channelId} to existing group ${groupId}`,
								command: {
									type: TimelineContentTypeBBCGSAAS.LOAD,
									group: groupId,
									channel: channelId,
									payload: {
										control: newChannel.control,
										scenes: newChannel.scenes,
									},
								},
							})
						}
						for (const obj of newChannel.objects) {
							for (const zone of Object.keys(obj.take.zones)) {
								if (zonesMap[zone]) {
									this.context.logger.warning(`GSAAS Zone ${zone} is defined twice in take requests`)
								}
								zonesMap[groupId][channelId][zone] = obj.take.zones[zone]
							}
						}
					}
				}
			} else {
				// New group.
				for (const channelId of Object.keys(newState[groupId])) {
					zonesMap[groupId][channelId] = {}
					const newChannel = newState[groupId][channelId]
					if (newChannel.scenes) {
						loadCommands.push({
							timelineObjId: newChannel.tlObjId ?? '',
							context: `Added group ${groupId} and channel ${channelId}`,
							command: {
								type: TimelineContentTypeBBCGSAAS.LOAD,
								group: groupId,
								channel: channelId,
								payload: {
									control: newChannel.control,
									scenes: newChannel.scenes,
								},
							},
						})
					}
					for (const obj of newChannel.objects) {
						for (const zone of Object.keys(obj.take.zones)) {
							if (zonesMap[groupId][channelId][zone]) {
								this.context.logger.warning(`GSAAS Zone ${zone} is defined twice in take requests`)
							}
							zonesMap[groupId][channelId][zone] = obj.take.zones[zone]
						}
					}
				}
			}
		}

		if (oldState) {
			for (const groupId of Object.keys(oldState)) {
				if (!zonesMap[groupId]) {
					zonesMap[groupId] = {}
				}
				if (newState[groupId]) {
					for (const channelId of Object.keys(oldState[groupId])) {
						if (!zonesMap[groupId][channelId]) {
							zonesMap[groupId][channelId] = {}
						}
						const oldChannel = oldState[groupId][channelId]
						if (newState[groupId][channelId]) {
							for (const obj of oldChannel.objects) {
								for (const zone of Object.keys(obj.take.zones)) {
									if (zonesMap[groupId][channelId][zone]) {
										continue
									}
									zonesMap[groupId][channelId][zone] = obj.clear.zones[zone]
								}
							}
						} else {
							unloadCommands.push({
								timelineObjId: oldChannel.tlObjId ?? '',
								context: `Removed channel ${channelId} from group ${groupId}`,
								command: {
									type: TimelineContentTypeBBCGSAAS.UNLOAD,
									group: groupId,
									channel: channelId,
								},
							})
						}
					}
				} else {
					for (const channelId of Object.keys(oldState[groupId])) {
						const oldChannel = oldState[groupId][channelId]
						unloadCommands.push({
							timelineObjId: oldChannel.tlObjId ?? '',
							context: `Removed channel ${channelId} from group ${groupId}`,
							command: {
								type: TimelineContentTypeBBCGSAAS.UNLOAD,
								group: groupId,
								channel: channelId,
							},
						})
					}
				}
			}
		}

		for (const group of Object.keys(zonesMap)) {
			for (const channel of Object.keys(zonesMap[group])) {
				scenesCommands.push({
					timelineObjId: '',
					context: `Update payload for ${group} / ${channel}`,
					command: {
						type: TimelineContentTypeBBCGSAAS.UPDATE,
						group,
						channel,
						payload: {
							id: '',
							zones: zonesMap[group][channel],
						},
					},
				})
			}
		}

		return [...unloadCommands, ...loadCommands, ...scenesCommands]
	}

	async sendCommand({ timelineObjId, context, command }: BBCGSAASDeviceCommand): Promise<void> {
		if (this._terminated) {
			return Promise.resolve()
		}

		const cwc: CommandWithContext = {
			context,
			command,
			timelineObjId,
		}
		this.context.logger.debug({ context, timelineObjId, command })

		const { group, channel, type } = command
		let payload: Record<string, any> | undefined

		let endpoint: string
		switch (type) {
			case TimelineContentTypeBBCGSAAS.LOAD:
				endpoint = 'load'
				payload = command.payload
				break

			case TimelineContentTypeBBCGSAAS.UPDATE:
				endpoint = 'update'
				payload = command.payload
				break

			case TimelineContentTypeBBCGSAAS.UNLOAD:
				endpoint = 'unload'
				break

			default:
				this.context.logger.warning(`BBC GSAAS - Invalid command type (${context})`)
				return Promise.resolve()
		}
		endpoint += `/${group}/${channel}`

		try {
			const response = await this.sendToBroker(endpoint, payload)

			if (!response) {
				return Promise.resolve()
			}

			if (response.statusCode >= 200 && response.statusCode <= 299) {
				this.context.logger.debug(
					`BBC GSAAS: ${type}: Good statuscode response on url "${endpoint}": ${response.statusCode} (${context})`
				)
			} else {
				this.context.logger.warning(
					`BBC GSAAS: ${type}: Bad statuscode response on url "${endpoint}": ${response.statusCode} (${context})`
				)
			}
		} catch (error) {
			const err = error as RequestError // make typescript happy

			this.context.logger.error(`BBC GSAAS response error on ${type} "${endpoint}" (${context})`, err)
			this.context.commandError(err, cwc)

			if ('code' in err) {
				/*const retryCodes = [
					'ETIMEDOUT',
					'ECONNRESET',
					'EADDRINUSE',
					'ECONNREFUSED',
					'EPIPE',
					'ENOTFOUND',
					'ENETUNREACH',
					'EHOSTUNREACH',
					'EAI_AGAIN',
				]

				if (retryCodes.includes(err.code) && this.options?.resendTime && command.commandName !== 'manual') {
					const timeLeft = Math.max(this.options.resendTime - (Date.now() - t), 0)
					setTimeout(() => {
						this.sendCommand({
							tlObjId,
							context,
							command: {
								...command,
								commandName: 'retry',
							},
						}).catch(() => null) // errors will be emitted
					}, timeLeft)
				}*/
			}
		}
	}

	private async sendToBroker(endpoint: string, payload?: Record<string, any>): Promise<Response<unknown> | void> {
		if (this._terminated) {
			return Promise.resolve()
		}
		const { apiKey, brokerUrl, clientId } = this.options

		const path = brokerUrl + endpoint
		const options: OptionsOfJSONResponseBody = {
			dnsCache: this.cacheable,
			retry: 0,
			headers: {
				'api-key': apiKey,
				ClientID: clientId,
			},
			json: payload,
		}

		const url = new URL(path)
		if (url.protocol === 'http:' && this.options.httpProxy) {
			options.agent = {
				http: new HttpProxyAgent({
					proxy: this.options.httpProxy,
				}),
			}
		} else if (url.protocol === 'https:' && this.options.httpsProxy) {
			options.agent = {
				https: new HttpsProxyAgent({
					proxy: this.options.httpsProxy,
				}),
			}
		}

		return got.post(url, options)
	}
}
