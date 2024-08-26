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
	BbcGsaasActions,
	Mappings,
	Mapping,
	SomeMappingBbcGsaas,
	DeviceType,
	MappingBbcGsaasType,
	ContinuePayload,
	ClearAllPayload,
	ClearZonePayload,
	TimelineContentBBCGSAASLoad,
	TimelineContentBBCGSAASUpdate,
} from 'timeline-state-resolver-types'

import CacheableLookup from 'cacheable-lookup'
import { isEqual, omit } from 'underscore'
import got, { OptionsOfJSONResponseBody, RequestError, Response } from 'got'
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent'
import { cloneDeep, t } from '../../lib'

export type BBCGSAASDeviceState = {
	[group: string]: {
		[channel: string]: {
			control: TimelineContentBBCGSAASLoad['control']
			scenes: {
				tlObjId?: string
				'*'?: string
				[id: string]: string | undefined
			}
			zones: {
				[zone: string]: {
					tlObjId: string
					take: {
						id: string
						zones: Record<string, any>
					}
					clear: {
						id: string
						zones: Record<string, any>
					}
				}
			}
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
		[id in BbcGsaasActions]: (id: string, payload?: Record<string, any>) => Promise<ActionExecutionResult>
	} = {
		[BbcGsaasActions.Resync]: async () => {
			this.context.resetResolver()
			return { result: ActionExecutionResultCode.Ok }
		},
		[BbcGsaasActions.Continue]: async (_id: string, payload?: Record<string, any>) =>
			this.continue(payload as ContinuePayload | undefined),
		[BbcGsaasActions.ClearAll]: async (_id: string, payload?: Record<string, any>) =>
			this.clearAll(payload as ClearAllPayload | undefined),
		[BbcGsaasActions.ClearZone]: async (_id: string, payload?: Record<string, any>) =>
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
		const endpoint = `/continue/${group}/${channel}/${zone}`

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
				response: t('Failed to send contine: Missing payload'),
			}
		}
		const { channel, group } = payload
		const endpoint = `/clearAll/${group}/${channel}`

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
				response: t('Failed to send contine: Missing payload'),
			}
		}

		const { channel, group, zone } = payload
		const endpoint = `/update/${group}/${channel}`

		if (
			this._internalState[group] &&
			this._internalState[group][channel] &&
			this._internalState[group][channel].zones[zone] &&
			this._internalState[group][channel].zones[zone].clear
		) {
			try {
				const response = await this.sendToBroker(endpoint, this._internalState[group][channel].zones[zone].clear)

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

					delete this._internalState[group][channel].zones[zone]

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
	}

	convertTimelineStateToDeviceState(
		state: Timeline.TimelineState<TSRTimelineContent>,
		mappings: Mappings
	): BBCGSAASDeviceState {
		const newState: BBCGSAASDeviceState = {}

		for (const layer of Object.keys(state.layers)) {
			if (!mappings[layer]) continue
			const mapping = mappings[layer] as Mapping<SomeMappingBbcGsaas>
			const { group, channel, mappingType } = mapping.options

			const { content, id } = state.layers[layer]

			if (!newState[group]) {
				newState[group] = {
					[channel]: {
						control: {},
						scenes: {},
						zones: {},
					},
				}
			} else if (!newState[group][channel]) {
				newState[group][channel] = {
					control: {},
					scenes: {},
					zones: {},
				}
			}
			if (content.deviceType === DeviceType.BBC_GSAAS && mapping) {
				switch (content.type) {
					case TimelineContentTypeBBCGSAAS.LOAD:
						if (mappingType !== MappingBbcGsaasType.Channel) {
							continue
						}
						newState[group][channel] = {
							control: content.control,
							scenes: {
								...content.scenes,
								tlObjId: id,
							},
							zones: {},
						}
						continue

					case TimelineContentTypeBBCGSAAS.UPDATE:
						if (mappingType !== MappingBbcGsaasType.Zone) {
							continue
						}
						newState[group][channel].zones[mapping.options.zone] = {
							tlObjId: id,
							take: {
								id: content.take.id,
								zones: {
									[mapping.options.zone]: content.take.zones[mapping.options.zone],
								},
							},
							clear: {
								id: content.clear.id,
								zones: {
									[mapping.options.zone]: content.clear.zones[mapping.options.zone],
								},
							},
						}
						continue

					case TimelineContentTypeBBCGSAAS.UNLOAD:
						if (mappingType !== MappingBbcGsaasType.Channel) {
							continue
						}
						newState[group][channel] = {
							control: {},
							scenes: {
								tlObjId: id,
							},
							zones: {},
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
		const sceneCommands: Array<BBCGSAASDeviceCommand> = []
		const unloadCommands: Array<BBCGSAASDeviceCommand> = []

		for (const groupId of Object.keys(newState)) {
			if (oldState && oldState[groupId]) {
				// Group already exists
				for (const channelId of Object.keys(newState[groupId])) {
					const newChannel = newState[groupId][channelId]
					if (oldState[groupId][channelId]) {
						// Channel already exists.
						const oldChannel = oldState[groupId][channelId]

						// No keys means unload everything.
						if (Object.keys(newChannel.scenes).length === 0) {
							unloadCommands.push({
								timelineObjId: newChannel.scenes.tlObjId ?? '',
								context: `Unloaded scenes for channel ${channelId} in group ${groupId}`,
								command: {
									type: TimelineContentTypeBBCGSAAS.UNLOAD,
									group: groupId,
									channel: channelId,
								},
							})
						} else if (!isEqual(omit(oldChannel.scenes, 'tlObjId'), omit(newChannel.scenes, 'tlObjId'))) {
							loadCommands.push({
								timelineObjId: newChannel.scenes.tlObjId ?? '',
								context: `Updated scenes for channel ${channelId} in group ${groupId}`,
								command: {
									type: TimelineContentTypeBBCGSAAS.LOAD,
									group: groupId,
									channel: channelId,
									payload: {
										control: newChannel.control,
										scenes: omit(newChannel.scenes, 'tlObjId'),
									},
								},
							})
						}

						// Update zone if either if the take payload has changed.
						for (const zoneId of Object.keys(newChannel.zones)) {
							const zone = newState[groupId][channelId].zones[zoneId]
							if (oldState[groupId][channelId].zones[zoneId]) {
								const oldZone = oldState[groupId][channelId].zones[zoneId]
								if (!isEqual(zone.take, oldZone.take)) {
									sceneCommands.push({
										timelineObjId: zone.tlObjId ?? '',
										context: `Updated zone ${zoneId} for channel ${channelId} in group ${groupId}`,
										command: {
											type: TimelineContentTypeBBCGSAAS.UPDATE,
											group: groupId,
											channel: channelId,
											payload: zone.take,
										},
									})
								}
							} else {
								sceneCommands.push({
									timelineObjId: zone.tlObjId ?? '',
									context: `Added zone ${zoneId} for channel ${channelId} in group ${groupId}`,
									command: {
										type: TimelineContentTypeBBCGSAAS.UPDATE,
										group: groupId,
										channel: channelId,
										payload: zone.take,
									},
								})
							}
						}
					} else {
						// New channel.
						if (newChannel.scenes) {
							loadCommands.push({
								timelineObjId: newChannel.scenes.tlObjId ?? '',
								context: `Added channel ${channelId} to existing group ${groupId}`,
								command: {
									type: TimelineContentTypeBBCGSAAS.LOAD,
									group: groupId,
									channel: channelId,
									payload: {
										control: newChannel.control,
										scenes: omit(newChannel.scenes, 'tlObjId'),
									},
								},
							})
						}
						if (newChannel.zones) {
							for (const zoneId of Object.keys(newChannel.zones)) {
								const zone = newState[groupId][channelId].zones[zoneId]
								sceneCommands.push({
									timelineObjId: zone.tlObjId ?? '',
									context: `Added channel ${channelId} and zone ${zoneId} to existing group ${groupId}`,
									command: {
										type: TimelineContentTypeBBCGSAAS.UPDATE,
										group: groupId,
										channel: channelId,
										payload: zone.take,
									},
								})
							}
						}
					}
				}
			} else {
				// New group.
				for (const channelId of Object.keys(newState[groupId])) {
					const newChannel = newState[groupId][channelId]
					if (newChannel.scenes) {
						loadCommands.push({
							timelineObjId: newChannel.scenes.tlObjId ?? '',
							context: `Added group ${groupId} and channel ${channelId}`,
							command: {
								type: TimelineContentTypeBBCGSAAS.LOAD,
								group: groupId,
								channel: channelId,
								payload: {
									control: newChannel.control,
									scenes: omit(newChannel.scenes, 'tlObjId'),
								},
							},
						})
					}
					if (newChannel.zones) {
						for (const zoneId of Object.keys(newChannel.zones)) {
							const zone = newState[groupId][channelId].zones[zoneId]
							sceneCommands.push({
								timelineObjId: zone.tlObjId ?? '',
								context: `Added group ${groupId} and channel ${channelId} and zone ${zoneId}`,
								command: {
									type: TimelineContentTypeBBCGSAAS.UPDATE,
									group: groupId,
									channel: channelId,
									payload: zone.take,
								},
							})
						}
					}
				}
			}
		}

		if (oldState) {
			for (const groupId of Object.keys(oldState)) {
				if (newState[groupId]) {
					for (const channelId of Object.keys(oldState[groupId])) {
						const oldChannel = oldState[groupId][channelId]
						if (newState[groupId][channelId]) {
							const newChannel = newState[groupId][channelId]
							for (const zoneId of Object.keys(oldChannel.zones)) {
								if (!newChannel.zones[zoneId]) {
									const oldZone = oldChannel.zones[zoneId]
									sceneCommands.push({
										timelineObjId: oldZone.tlObjId ?? '',
										context: `Removed zone ${zoneId} from channel ${channelId} from group ${groupId}`,
										command: {
											type: TimelineContentTypeBBCGSAAS.UPDATE,
											group: groupId,
											channel: channelId,
											payload: oldZone.clear,
										},
									})
								}
							}
						} else {
							unloadCommands.push({
								timelineObjId: oldChannel.scenes.tlObjId ?? '',
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
							timelineObjId: oldChannel.scenes.tlObjId ?? '',
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

		return [...unloadCommands, ...loadCommands, ...sceneCommands]
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

		let endpoint = '/'
		switch (type) {
			case TimelineContentTypeBBCGSAAS.LOAD:
				endpoint += 'load'
				payload = command.payload
				break

			case TimelineContentTypeBBCGSAAS.UPDATE:
				endpoint += 'update'
				payload = command.payload
				break

			case TimelineContentTypeBBCGSAAS.UNLOAD:
				endpoint += 'unload'
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

		const path = brokerUrl + 'v3' + endpoint
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
