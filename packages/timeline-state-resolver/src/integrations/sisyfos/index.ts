import * as _ from 'underscore'
import { CommandWithContext, DeviceStatus, StatusCode } from './../../devices/device'
import { Device, DeviceContextAPI } from '../../service/device'
import {
	Mappings,
	SisyfosOptions,
	SomeMappingSisyfos,
	MappingSisyfosType,
	MappingSisyfosChannel,
	TSRTimelineContent,
	Timeline,
	Mapping,
	ActionExecutionResultCode,
	SetSisyfosChannelStatePayload,
	LoadMixerPresetPayload,
	ActionExecutionResult,
	SisyfosActionExecutionResults,
	SisyfosActions,
} from 'timeline-state-resolver-types'

import { SisyfosApi, SisyfosCommand, SisyfosState, SisyfosChannel, SisyfosCommandType } from './connection'
import Debug from 'debug'
import { PromisifyResult, t } from '../../lib'
import {
	addressStateFromChannelUpdate,
	addressStateReassertsControl,
	AnyAddressState,
	applyAddressState,
	convertTimelineStateToDeviceState,
	diffAddressState,
} from './state'
const debug = Debug('timeline-state-resolver:sisyfos')

interface Command extends CommandWithContext {
	command: SisyfosCommand
}

export class SisyfosMessageDevice
	extends Device<SisyfosOptions, SisyfosState, Command, AnyAddressState>
	implements PromisifyResult<SisyfosActionExecutionResults>
{
	private _sisyfos: SisyfosApi
	private _isResyncPending = false
	private logger: DeviceContextAPI<SisyfosState>['logger']

	constructor(context: DeviceContextAPI<SisyfosState, AnyAddressState>) {
		super(context)
		this.logger = this.context.logger // just for convenience

		this._sisyfos = new SisyfosApi()
		this._sisyfos.on('error', (e) => this.logger.error('error', e))
		this._sisyfos.on('connected', () => {
			this._connectionChanged()
		})
		this._sisyfos.on('disconnected', () => {
			this._connectionChanged()
		})
		this._sisyfos.on('initialized', () => {
			this._connectionChanged()
		})
		this._sisyfos.on('mixerOnline', (onlineStatus) => {
			if (this._sisyfos.mixerOnline === onlineStatus) return

			this._sisyfos.setMixerOnline(onlineStatus)
			this._connectionChanged()
		})
		this._sisyfos.on('updateChannel', (index, channel) => {
			const { address, state } = addressStateFromChannelUpdate(index, channel)
			this.context.setAddressState(address, state)
			this.logger.debug('Update address state "' + address + '"')
		})
	}

	public async reinit(): Promise<ActionExecutionResult<undefined>> {
		return this._initialize()
			.then(() => ({
				result: ActionExecutionResultCode.Ok,
			}))
			.catch(() => ({
				result: ActionExecutionResultCode.Error,
			}))
	}

	public async setSisyfosChannelState(
		payload: SetSisyfosChannelStatePayload
	): Promise<ActionExecutionResult<undefined>> {
		if (typeof payload?.channel !== 'number') {
			return {
				result: ActionExecutionResultCode.Error,
			}
		}
		this._sisyfos.setSisyfosChannel(payload.channel + 1, { ...this._getDeviceState().channels[payload.channel] })
		return {
			result: ActionExecutionResultCode.Ok,
		}
	}

	public async loadMixerPreset(payload: LoadMixerPresetPayload): Promise<ActionExecutionResult<undefined>> {
		if (!payload?.name) {
			return { result: ActionExecutionResultCode.Error, response: t('Missing name') }
		}
		if (!this._sisyfos.connected || !this._sisyfos.mixerOnline)
			return {
				result: ActionExecutionResultCode.Error,
			}
		this._sisyfos.send({
			type: SisyfosCommandType.LOAD_MIXER_PRESET,
			presetName: payload.name,
		})
		return {
			result: ActionExecutionResultCode.Ok,
		}
	}

	public readonly actions: {
		[id in SisyfosActions]: (payload?: any) => Promise<ActionExecutionResult>
	} = this

	public async init(initOptions: SisyfosOptions): Promise<boolean> {
		this._sisyfos.once('initialized', () => {
			this.context
				.resetToState(this._getDeviceState(false))
				.catch((e) => this.context.logger.error('Failed to reset to full state', e))
		})

		this._sisyfos
			.connect(initOptions.host, initOptions.port)
			.catch((e) => this.logger.error('Failed to initialise Sisyfos connection', e))

		return true
	}

	public async terminate() {
		this._sisyfos.dispose()
		this._sisyfos.removeAllListeners()
	}

	public getStatus(): Omit<DeviceStatus, 'active'> {
		let statusCode = StatusCode.GOOD
		const messages: Array<string> = []

		if (!this._sisyfos.connected) {
			statusCode = StatusCode.BAD
			messages.push('Not connected')
		}

		if (!this._sisyfos.state && !this._isResyncPending) {
			statusCode = StatusCode.BAD
			messages.push(`Sisyfos device connection not initialized (restart required)`)
		}

		if (!this._sisyfos.mixerOnline) {
			statusCode = StatusCode.BAD
			messages.push(`Sisyfos has no connection to Audiomixer`)
		}
		return {
			statusCode: statusCode,
			messages: messages,
		}
	}

	public async makeReady(okToDestroyStuff?: boolean): Promise<void> {
		if (okToDestroyStuff) return this._resync()
	}

	private async _initialize(): Promise<void> {
		this._sisyfos.reInitialize()
		this._sisyfos.once('initialized', () => {
			this.context
				.resetToState(this._getDeviceState(false))
				.catch((e) => this.context.logger.error('Failed to reset to state', e))
		})
	}

	private async _resync(): Promise<void> {
		if (this._isResyncPending) return
		this._isResyncPending = true
		// If state is still not reinitialised afer 5 seconds, we may have a problem.
		setTimeout(() => (this._isResyncPending = false), 5000)

		this._sisyfos.reInitialize()
		this._sisyfos.once('initialized', () => {
			this._isResyncPending = false
			const targetState = this.context.getCurrentState()

			if (targetState) {
				this.context
					.resetToState(this._getDeviceState(false))
					.catch((e) => this.context.logger.error('Failed to reset to state while resyncing', e))
			}
		})
	}

	get connected(): boolean {
		return this._sisyfos.connected
	}

	private _getDeviceState(isDefaultState = true, mappings?: Mappings): SisyfosState {
		let deviceStateFromAPI = this._sisyfos.state
		const deviceState: SisyfosState = {
			channels: {},
			resync: false,
		}

		if (!deviceStateFromAPI) deviceStateFromAPI = deviceState

		const channels = mappings
			? Object.values<Mapping<unknown>>(mappings || {})
					.filter(
						(m): m is Mapping<MappingSisyfosChannel> =>
							(m as Mapping<SomeMappingSisyfos>).options.mappingType === MappingSisyfosType.Channel
					)
					.map((m: Mapping<MappingSisyfosChannel>) => ({
						index: m.options.channel,
						disableDefaults: m.options.disableDefaults,
					}))
			: Object.keys(deviceStateFromAPI.channels).map((index) => ({ index, disableDefaults: true }))

		for (const ch of channels) {
			const channelFromAPI = deviceStateFromAPI.channels[ch.index]

			let channel: SisyfosChannel = {
				...channelFromAPI,
				timelineObjIds: [],
			}

			if (isDefaultState) {
				// reset values for default state
				channel = {
					...channel,
					...(ch.disableDefaults ? this._getBlankStateChannel() : this._getDefaultStateChannel()),
				}
			}

			deviceState.channels[ch.index] = channel
		}
		return deviceState
	}

	/** Returns a channel with defaults */
	private _getDefaultStateChannel(): SisyfosChannel {
		return {
			faderLevel: 0.75, // 0 dB
			pgmOn: 0,
			pstOn: 0,
			label: '',
			visible: true,
			muteOn: false,
			inputGain: 0.75,
			inputSelector: 1,
			timelineObjIds: [],
		}
	}

	/** Returns a channel without defaults */
	private _getBlankStateChannel(): SisyfosChannel {
		return {
			label: '',
			timelineObjIds: [],
			// we want those undefined properties to exist
			faderLevel: undefined,
			pgmOn: undefined,
			pstOn: undefined,
			visible: undefined,
			inputGain: undefined,
			inputSelector: undefined,
			muteOn: undefined,
		}
	}

	/**
	 * Transform the timeline state into a device state, which is in this case also
	 * a timeline state.
	 * @param state
	 */
	public convertTimelineStateToDeviceState(
		state: Timeline.TimelineState<TSRTimelineContent>,
		mappings: Mappings<SomeMappingSisyfos>
	): { deviceState: SisyfosState; addressStates: Record<string, AnyAddressState> } {
		return convertTimelineStateToDeviceState(state, mappings)
	}

	/**
	 * Compares the new timeline-state with the old one, and generates commands to account for the difference
	 */
	public diffStates(oldSisyfosState: SisyfosState | undefined, newSisyfosState: SisyfosState): Command[] {
		const commands: Command[] = []

		// resync is silly when we track the device anyway, right?
		// if (newSisyfosState.resync && !oldSisyfosState?.resync) {
		// 	commands.push({
		// 		context: `Resyncing with Sisyfos`,
		// 		command: {
		// 			type: SisyfosCommandType.RESYNC,
		// 		},
		// 		timelineObjId: '',
		// 	})
		// }

		_.each(newSisyfosState.channels, (newChannel: SisyfosChannel, index) => {
			const oldChannel: SisyfosChannel | undefined = oldSisyfosState?.channels[index]

			// these trigger values get very confusing now that we have shared control....

			// if (newSisyfosState.triggerValue && newSisyfosState.triggerValue !== oldSisyfosState?.triggerValue) {
			// 	// || (!oldChannel && Number(index) >= 0)) {
			// 	// push commands for everything
			// 	debug('reset channel ' + index)
			// 	commands.push({
			// 		context: `Channel ${index} reset`,
			// 		command: {
			// 			type: SisyfosCommandType.SET_CHANNEL,
			// 			channel: Number(index),
			// 			values: newChannel,
			// 		},
			// 		timelineObjId: newChannel.timelineObjIds[0] || '',
			// 	})
			// 	return
			// }

			// if (newChannel.triggerValue && oldChannel?.triggerValue !== newChannel.triggerValue) {
			// 	// note - should we only do this if we have an oldchannel?
			// 	debug('reset channel ' + index)
			// 	commands.push({
			// 		context: `Channel ${index} reset`,
			// 		command: {
			// 			type: SisyfosCommandType.SET_CHANNEL,
			// 			channel: Number(index),
			// 			values: newChannel,
			// 		},
			// 		timelineObjId: newChannel.timelineObjIds[0] || '',
			// 	})
			// 	return
			// }

			if (!oldChannel) return

			if (oldChannel.pgmOn !== newChannel.pgmOn && newChannel.pgmOn !== undefined) {
				debug(`Channel ${index} pgm goes from "${oldChannel.pgmOn}" to "${newChannel.pgmOn}"`)
				const values: number[] = [newChannel.pgmOn]
				if (newChannel.fadeTime) {
					values.push(newChannel.fadeTime)
				}
				commands.push({
					context: `Channel ${index} pgm goes from "${oldChannel.pgmOn}" to "${newChannel.pgmOn}"`,
					command: {
						type: SisyfosCommandType.TOGGLE_PGM,
						channel: Number(index),
						values,
					},
					timelineObjId: newChannel.timelineObjIds[0] || '',
				})
			}

			if (oldChannel.pstOn !== newChannel.pstOn && newChannel.pstOn !== undefined) {
				debug(`Channel ${index} pst goes from "${oldChannel.pstOn}" to "${newChannel.pstOn}"`)
				commands.push({
					context: `Channel ${index} pst goes from "${oldChannel.pstOn}" to "${newChannel.pstOn}"`,
					command: {
						type: SisyfosCommandType.TOGGLE_PST,
						channel: Number(index),
						value: newChannel.pstOn,
					},
					timelineObjId: newChannel.timelineObjIds[0] || '',
				})
			}

			if (oldChannel.faderLevel !== newChannel.faderLevel && newChannel.faderLevel !== undefined) {
				debug(`change faderLevel ${index}: "${newChannel.faderLevel}"`)
				const values: number[] = [newChannel.faderLevel]
				if (newChannel.fadeTime) {
					values.push(newChannel.fadeTime)
				}
				commands.push({
					context: 'faderLevel change',
					command: {
						type: SisyfosCommandType.SET_FADER,
						channel: Number(index),
						values,
					},
					timelineObjId: newChannel.timelineObjIds[0] || '',
				})
			}

			newChannel.label = newChannel.label || oldChannel.label
			if (newChannel.label !== '' && oldChannel.label !== newChannel.label) {
				debug(`set label on fader ${index}: "${newChannel.label}"`)
				commands.push({
					context: 'set label on fader',
					command: {
						type: SisyfosCommandType.LABEL,
						channel: Number(index),
						value: newChannel.label,
					},
					timelineObjId: newChannel.timelineObjIds[0] || '',
				})
			}

			if (oldChannel.visible !== newChannel.visible && newChannel.visible !== undefined) {
				debug(`Channel ${index} Visibility goes from "${oldChannel.visible}" to "${newChannel.visible}"`)
				commands.push({
					context: `Channel ${index} Visibility goes from "${oldChannel.visible}" to "${newChannel.visible}"`,
					command: {
						type: SisyfosCommandType.VISIBLE,
						channel: Number(index),
						value: newChannel.visible,
					},
					timelineObjId: newChannel.timelineObjIds[0] || '',
				})
			}

			if (oldChannel.muteOn !== newChannel.muteOn && newChannel.muteOn !== undefined) {
				debug(`Channel ${index} mute goes from "${oldChannel.muteOn}" to "${newChannel.muteOn}"`)
				commands.push({
					context: `Channel ${index} mute goes from "${oldChannel.muteOn}" to "${newChannel.muteOn}"`,
					command: {
						type: SisyfosCommandType.SET_MUTE,
						channel: Number(index),
						value: newChannel.muteOn,
					},
					timelineObjId: newChannel.timelineObjIds[0] || '',
				})
			}

			if (oldChannel.inputGain !== newChannel.inputGain && newChannel.inputGain !== undefined) {
				debug(`Channel ${index} inputGain goes from "${oldChannel.inputGain}" to "${newChannel.inputGain}"`)
				commands.push({
					context: `Channel ${index} inputGain goes from "${oldChannel.inputGain}" to "${newChannel.inputGain}"`,
					command: {
						type: SisyfosCommandType.SET_INPUT_GAIN,
						channel: Number(index),
						value: newChannel.inputGain,
					},
					timelineObjId: newChannel.timelineObjIds[0] || '',
				})
			}

			if (oldChannel.inputSelector !== newChannel.inputSelector && newChannel.inputSelector !== undefined) {
				debug(`Channel ${index} inputSelector goes from "${oldChannel.inputSelector}" to "${newChannel.inputSelector}"`)
				commands.push({
					context: `Channel ${index} inputSelector goes from "${oldChannel.inputSelector}" to "${newChannel.inputSelector}"`,
					command: {
						type: SisyfosCommandType.SET_INPUT_SELECTOR,
						channel: Number(index),
						value: newChannel.inputSelector,
					},
					timelineObjId: newChannel.timelineObjIds[0] || '',
				})
			}
		})

		return commands
	}

	public async sendCommand(command: Command): Promise<void> {
		this.logger.debug(command)

		if (command.command.type === SisyfosCommandType.RESYNC) {
			return this._resync()
		} else {
			try {
				this._sisyfos.send(command.command)

				return Promise.resolve()
			} catch (e) {
				return Promise.reject(e)
			}
		}
	}

	private _connectionChanged() {
		this.context.connectionChanged(this.getStatus())
	}

	applyAddressState(state: SisyfosState, address: string, addressState: AnyAddressState): void {
		applyAddressState(state, address, addressState)
	}
	diffAddressState(state1: AnyAddressState, state2: AnyAddressState): boolean {
		return diffAddressState(state1, state2)
	}
	addressStateReassertsControl(oldState: AnyAddressState | undefined, newState: AnyAddressState): boolean {
		return addressStateReassertsControl(oldState, newState)
	}
}
