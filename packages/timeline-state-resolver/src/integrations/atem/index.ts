import * as _ from 'underscore'
import { DeviceStatus, StatusCode } from './../../devices/device'
import {
	AtemOptions,
	Mappings,
	Timeline,
	TSRTimelineContent,
	ActionExecutionResult,
	ActionExecutionResultCode,
	AtemActions,
	SomeMappingAtem,
} from 'timeline-state-resolver-types'
import { AtemState, State as DeviceState } from 'atem-state'
import {
	BasicAtem,
	Commands as AtemCommands,
	AtemState as NativeAtemState,
	AtemStateUtil,
	Enums as ConnectionEnums,
} from 'atem-connection'
import { CommandWithContext, Device } from '../../service/device'
import { AtemStateBuilder } from './stateBuilder'
import { createDiffOptions } from './diffState'
import { StateTracker } from './stateTracker'
import { AnyAddressState, diffAddressStates, getDeviceStateWithBlockedStates, updateFromAtemState } from './state'

export interface AtemCommandWithContext extends CommandWithContext {
	command: AtemCommands.ISerializableCommand[]
	context: string
	state: AtemDeviceState
}

type AtemDeviceState = DeviceState & { controlValue?: string }

/**
 * This is a wrapper for the Atem Device. Commands to any and all atem devices will be sent through here.
 */
export class AtemDevice extends Device<AtemOptions, AtemDeviceState, AtemCommandWithContext> {
	readonly actions: {
		[id in AtemActions]: (id: string, payload?: Record<string, any>) => Promise<ActionExecutionResult>
	} = {
		[AtemActions.Resync]: this.resyncState.bind(this),
	}

	private readonly _atem = new BasicAtem()
	private _protocolVersion = ConnectionEnums.ProtocolVersion.V8_1_1
	private _connected = false // note: ideally this should be replaced by this._atem.connected

	private _atemStatus: {
		psus: Array<boolean>
	} = {
		psus: [],
	}

	// this tracks various substates of both the Device's State and the TSR's State:
	private tracker = new StateTracker<AnyAddressState>(diffAddressStates)

	/**
	 * Initiates the connection with the ATEM through the atem-connection lib
	 * and initiates Atem State lib.
	 */
	async init(options: AtemOptions): Promise<boolean> {
		this.tracker.on('blocked', () => {
			// the tracker has found that someone/something is controlling some part of the device

			// we want to make sure we send the correct (possibly none) commands to the device
			this.context.recalcDiff()
		})

		this._atem.on('disconnected', () => {
			this._connected = false
			this._connectionChanged()
		})
		this._atem.on('error', (e) => this.context.logger.error('Atem', new Error(e)))
		this._atem.on('stateChanged', (state) => {
			// the external device is communicating something changed, the tracker should be updated (and may fire a "blocked" event if the change is caused by someone else)
			updateFromAtemState((addr, addrState) => this.tracker.updateState(addr, addrState), state) // todo - only update depending on the actual paths that changed?

			// old stuff for connection statuses/events:
			this._onAtemStateChanged(state)
		})

		this._atem.on('connected', () => {
			this._connected = true

			this._connectionChanged()

			if (this._atem.state) {
				// Do a state diff to get to the desired state
				this._protocolVersion = this._atem.state.info.apiVersion
				this.context
					.resetToState(this._atem.state)
					.catch((e) => this.context.logger.error('Error resetting atem state', new Error(e)))
			} else {
				// Do a state diff to at least send all the commands we know about
				this.context.resetState().catch((e) => this.context.logger.error('Error resetting atem state', new Error(e)))
			}
		})

		// This only waits for the child thread to start, it doesn't wait for connection
		await this._atem.connect(options.host, options.port)

		return true
	}
	/**
	 * Safely terminate everything to do with this device such that it can be
	 * garbage collected.
	 */
	async terminate(): Promise<void> {
		await this._atem.disconnect().catch(() => null)
		await this._atem.destroy().catch(() => null)
		this._atem.removeAllListeners()
	}

	private async resyncState(): Promise<ActionExecutionResult> {
		this.context.resetResolver()

		return {
			result: ActionExecutionResultCode.Ok,
		}
	}

	get connected(): boolean {
		return this._connected
	}

	/**
	 * Convert a timeline state into an Atem state.
	 * @param timelineState The state to be converted
	 */
	convertTimelineStateToDeviceState(
		timelineState: Timeline.TimelineState<TSRTimelineContent>,
		mappings: Mappings
	): AtemDeviceState {
		return AtemStateBuilder.fromTimeline(timelineState.layers, mappings)
	}

	/**
	 * Check status and return it with useful messages appended.
	 */
	public getStatus(): Omit<DeviceStatus, 'active'> {
		if (!this._connected) {
			return {
				statusCode: StatusCode.BAD,
				messages: [`Atem disconnected`],
			}
		} else {
			let statusCode = StatusCode.GOOD
			const messages: Array<string> = []

			const psus = this._atemStatus.psus
			psus.forEach((psu: boolean, i: number) => {
				if (!psu) {
					statusCode = StatusCode.WARNING_MAJOR
					messages.push(`Atem PSU ${i + 1} is faulty. The device has ${psus.length} PSU(s) in total.`)
				}
			})

			return {
				statusCode: statusCode,
				messages: messages,
			}
		}
	}

	/**
	 * Compares the new timeline-state with the old one, and generates commands to account for the difference
	 * @param oldAtemState
	 * @param newAtemState
	 */
	diffStates(
		oldAtemState: AtemDeviceState | undefined,
		newAtemState: AtemDeviceState,
		mappings: Mappings
	): Array<AtemCommandWithContext> {
		// Skip diffing if not connected, a resolverReset will be fired upon reconnection
		if (!this._connected) return []

		// Make sure there is something to diff against
		oldAtemState = oldAtemState ?? this._atem.state ?? AtemStateUtil.Create()

		// we update the old and new state with any blocked AddressStates to make sure we don't control them
		const overriddenNewAtemState = getDeviceStateWithBlockedStates(
			newAtemState,
			this.tracker,
			// if the control value changes, we want to make sure to move (back) to TSR's expected state
			(a) => this.tracker.getControlValue(a) === newAtemState.controlValue
		)
		const overriddenOldAtemState = getDeviceStateWithBlockedStates(oldAtemState, this.tracker, () => true)

		const diffOptions = createDiffOptions(mappings as Mappings<SomeMappingAtem>)
		const commands = AtemState.diffStates(
			this._protocolVersion,
			overriddenOldAtemState,
			overriddenNewAtemState,
			diffOptions
		)

		if (commands.length > 0) {
			return [
				{
					command: commands,
					state: newAtemState, // keeping the state as part of the command here so we can use it to update the tracker when it is executed
					context: '',
					timelineObjId: '',
				},
			]
		} else {
			return []
		}
	}

	async sendCommand({ command, context, timelineObjId, state }: AtemCommandWithContext): Promise<void> {
		const cwc: CommandWithContext = {
			context,
			command,
			timelineObjId,
		}
		this.context.logger.debug(cwc)

		// now that we are executing these commands we update the tracker with our new expected state
		updateFromAtemState(
			(addr, addrState) => this.tracker.updateExpectedState(addr, addrState, state.controlValue),
			state
		)
		// update control value for all addresses, including the ones that were not included in the state - note: this is a specific detail to how the atem-integration works
		this.tracker
			.getAllAddresses()
			.forEach((addr) => state.controlValue && this.tracker.setControlValue(addr, state.controlValue))

		// Skip attempting send if not connected
		if (!this._connected) return

		try {
			await this._atem.sendCommands(command)
		} catch (error: any) {
			this.context.commandError(error, cwc)
		}
	}
	private _onAtemStateChanged(newState: Readonly<NativeAtemState>) {
		const psus = newState.info.power || []

		if (!_.isEqual(this._atemStatus.psus, psus)) {
			this._atemStatus.psus = psus.slice()

			this._connectionChanged()
		}
	}
	private _connectionChanged() {
		this.context.connectionChanged(this.getStatus())
	}
}
