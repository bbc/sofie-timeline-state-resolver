import {
	Timeline,
	TSRTimelineContent,
	Mappings,
	SomeMappingSisyfos,
	MappingSisyfosType,
	DeviceType,
	TimelineContentTypeSisyfos,
	SisyfosChannelOptions,
	ResolvedTimelineObjectInstanceExtended,
	Mapping,
} from 'timeline-state-resolver-types'
import { SisyfosChannel, SisyfosChannelAPI, SisyfosState } from './connection'
import _ = require('underscore')

export function convertTimelineStateToDeviceState(
	state: Timeline.TimelineState<TSRTimelineContent>,
	mappings: Mappings<SomeMappingSisyfos>
) {
	const deviceState: SisyfosState = {
		channels: {},
		resync: false,
	}

	const getChannel = (ch: number, withDefaults: boolean) => {
		if (!deviceState.channels[ch]) {
			// make a new channel:
			deviceState.channels[ch] = withDefaults ? getDefaultChannel() : getEmptyChannel()
		}

		return deviceState.channels[ch]
	}

	_.each(mappings, (mapping) => {
		if (mapping.options.mappingType !== MappingSisyfosType.Channel) return
		const channel = getChannel(mapping.options.channel, !mapping.options.disableDefaults)

		if (!mapping.options.setLabelToLayerName) return
		if (!mapping.layerName) return

		channel.label = mapping.layerName
	})

	// Preparation: put all channels that comes from the timeline in an array:
	const foundChannels: ({
		overridePriority: number
		channel: number
		isLookahead: boolean
		timelineObjId: string
		triggerValue?: string
		disableDefaults?: boolean
	} & SisyfosChannelOptions)[] = []

	_.each(state.layers, (layer: ResolvedTimelineObjectInstanceExtended, layerName) => {
		if (layer.content.deviceType !== DeviceType.SISYFOS) return

		let mapping = mappings[layerName]

		// Allow resync without valid channel mapping
		if (
			layer.content.type === TimelineContentTypeSisyfos.CHANNELS ||
			layer.content.type === TimelineContentTypeSisyfos.CHANNEL
		) {
			if (layer.content.resync !== undefined) deviceState.resync = deviceState.resync || layer.content.resync
		}

		// Allow global retrigger without valid channel mapping
		if (layer.content.type === TimelineContentTypeSisyfos.TRIGGERVALUE && layer.content.triggerValue !== undefined) {
			deviceState.triggerValue = layer.content.triggerValue
		}

		// if the tlObj is specifies to load to PST the original Layer is used to resolve the mapping
		if (!mapping && layer.isLookahead && layer.lookaheadForLayer) {
			mapping = mappings[layer.lookaheadForLayer]
		}

		// everything else needs a valid mapping
		if (!mapping || layer.content.deviceType !== DeviceType.SISYFOS) return

		foundChannels.push(...getChannelsFromTimelineLayer(layer, mapping, mappings))

		if ('resync' in layer.content) {
			deviceState.resync = deviceState.resync || layer.content.resync || false
		}
	})

	// now go through every channel and make sure we pick the right ones
	_.each(
		_.sortBy(foundChannels, (channel) => channel.overridePriority),
		(newChannel) => {
			const channel = getChannel(newChannel.channel, !newChannel.disableDefaults)

			if (newChannel.isPgm !== undefined) {
				if (newChannel.isLookahead) {
					channel.pstOn = newChannel.isPgm || 0
				} else {
					channel.pgmOn = newChannel.isPgm || 0
				}
			}

			if (newChannel.faderLevel !== undefined) channel.faderLevel = newChannel.faderLevel
			if (newChannel.label !== undefined && newChannel.label !== '') channel.label = newChannel.label
			if (newChannel.visible !== undefined) channel.visible = newChannel.visible
			if (newChannel.fadeTime !== undefined) channel.fadeTime = newChannel.fadeTime
			if (newChannel.muteOn !== undefined) channel.muteOn = newChannel.muteOn
			if (newChannel.inputGain !== undefined) channel.inputGain = newChannel.inputGain
			if (newChannel.inputSelector !== undefined) channel.inputSelector = newChannel.inputSelector
			if (newChannel.triggerValue !== undefined) channel.triggerValue = newChannel.triggerValue

			channel.timelineObjIds.push(newChannel.timelineObjId)
		}
	)

	const addressStates: Record<string, AnyAddressState> = {}

	for (const [index, channel] of Object.entries<SisyfosChannel>(deviceState.channels)) {
		addressStates['channel.' + index] = {
			type: AddressType.Channel,
			// controlValue: channel.timelineObjIds.join('+'), // + '_' + channel.triggerValue + '_' + deviceState.triggerValue,
			controlValue: channel.triggerValue ?? channel.timelineObjIds.join(),
			index: [index],

			state: {
				...channel,
			},
		}
	}

	return { deviceState, addressStates }
}

function getEmptyChannel() {
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
function getDefaultChannel() {
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

function getChannelsFromTimelineLayer(
	layer: ResolvedTimelineObjectInstanceExtended,
	mapping: Mapping<SomeMappingSisyfos>,
	mappings: Mappings
): ({
	overridePriority: number
	channel: number
	isLookahead: boolean
	timelineObjId: string
	triggerValue?: string
	disableDefaults?: boolean
} & SisyfosChannelOptions)[] {
	if (layer.content.deviceType !== DeviceType.SISYFOS) return []

	const foundChannels: ({
		overridePriority: number
		channel: number
		isLookahead: boolean
		timelineObjId: string
		triggerValue?: string
		disableDefaults?: boolean
	} & SisyfosChannelOptions)[] = []

	if (
		mapping.options.mappingType === MappingSisyfosType.Channel &&
		layer.content.type === TimelineContentTypeSisyfos.CHANNEL
	) {
		foundChannels.push({
			...layer.content,
			channel: mapping.options.channel,
			overridePriority: layer.content.overridePriority || 0,
			isLookahead: layer.isLookahead || false,
			timelineObjId: layer.id,
			triggerValue: layer.content.triggerValue,
			disableDefaults: mapping.options.disableDefaults,
		})
	} else if (
		mapping.options.mappingType === MappingSisyfosType.ChannelByLabel &&
		layer.content.type === TimelineContentTypeSisyfos.CHANNEL
	) {
		// yeah no, i don't like this one anymore!!!!
	} else if (
		mapping.options.mappingType === MappingSisyfosType.Channels &&
		layer.content.type === TimelineContentTypeSisyfos.CHANNELS
	) {
		for (const channel of layer.content.channels) {
			const referencedMapping = mappings[channel.mappedLayer] as Mapping<SomeMappingSisyfos> | undefined
			if (!referencedMapping) continue

			let channelNumber: number | undefined
			if (referencedMapping.options.mappingType === MappingSisyfosType.Channel) {
				channelNumber = referencedMapping.options.channel
			} else if (referencedMapping.options.mappingType === MappingSisyfosType.ChannelByLabel) {
				// ignoring because ya dumb
				// channelNumber = this._sisyfos.getChannelByLabel(referencedMapping.options.label)
				// debug(`Channel by label ${referencedMapping.options.label}(${channelNumber}): ${channel.isPgm}`)
			}

			if (channelNumber === undefined) continue

			foundChannels.push({
				...channel,
				channel: channelNumber,
				overridePriority: layer.content.overridePriority || 0,
				isLookahead: layer.isLookahead || false,
				timelineObjId: layer.id,
				triggerValue: layer.content.triggerValue,
				disableDefaults: mapping.options.disableDefaults,
			})
		}
	}

	return foundChannels
}

enum AddressType {
	Channel = 'Channel', // note - future me will probably want to tear this apart a bit further

	// FaderLevel = 'faderLevel',
	// PgmOn = 'pgmOn',
	// PstOn = 'pstOn',
	// Label = 'label',
	// Visible = 'visible',
	// FadeTime = 'fadeTime',
	// MuteOn = 'muteOn',
	// InputGain = 'inputGain',
	// InputSelector = 'inputSelector',
}

interface AddressState<Type extends AddressType, State> {
	type: Type
	controlValue: string
	index: (number | string)[]

	state: State
}

type ChannelAddressState = AddressState<AddressType.Channel, SisyfosChannelAPI>

export type AnyAddressState = ChannelAddressState

export function applyAddressState(state: SisyfosState, _address: string, addressState: AnyAddressState): void {
	if (addressState.type !== AddressType.Channel) return

	const channel = state.channels[addressState.index[0]]
	if (!channel) return

	channel.faderLevel = addressState.state.faderLevel ?? channel.faderLevel
	channel.pgmOn = addressState.state.pgmOn ?? channel.pgmOn
	channel.pstOn = addressState.state.pstOn ?? channel.pstOn
	channel.label = addressState.state.label ?? channel.label
	channel.visible = addressState.state.visible ?? channel.visible
	channel.fadeTime = addressState.state.fadeTime ?? channel.fadeTime
	channel.muteOn = addressState.state.muteOn ?? channel.muteOn
	channel.inputGain = addressState.state.inputGain ?? channel.inputGain
	channel.inputSelector = addressState.state.inputSelector ?? channel.inputSelector
}
export function diffAddressState(state1: AnyAddressState, state2: AnyAddressState): boolean {
	return (
		state1.state.faderLevel !== state2.state.faderLevel ||
		state1.state.pgmOn !== state2.state.pgmOn ||
		(state1.state.pstOn !== undefined &&
			state2.state.pstOn !== undefined &&
			state1.state.pstOn !== state2.state.pstOn) ||
		// state1.state.label !== state2.state.label ||
		state1.state.visible !== state2.state.visible ||
		// state1.state.fadeTime !== state2.state.fadeTime ||
		state1.state.muteOn !== state2.state.muteOn ||
		state1.state.inputGain !== state2.state.inputGain ||
		state1.state.inputSelector !== state2.state.inputSelector
	)
}
export function addressStateReassertsControl(
	oldState: AnyAddressState | undefined,
	newState: AnyAddressState
): boolean {
	// note - one option can be to not return true if oldState is undefined..
	return oldState?.controlValue !== newState?.controlValue
}

export function addressStateFromChannelUpdate(
	index: number,
	channel: SisyfosChannelAPI
): { address: string; state: AnyAddressState } {
	const address = 'channel.' + index
	const state: AnyAddressState = {
		type: AddressType.Channel,
		index: [index],
		controlValue: '', // not important for updates coming from the device

		state: channel,
	}

	return { address, state }
}
