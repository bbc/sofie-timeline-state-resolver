import {
	DeviceType,
	TSRTimelineObj,
	TimelineContentBBCGSAASUpdate,
	TimelineContentBBCGSAASLoad,
	TimelineContentTypeBBCGSAAS,
} from 'timeline-state-resolver'
import { TSRInput } from '../src'
import { literal } from 'timeline-state-resolver/dist/devices/device'

export const input: TSRInput = {
	timeline: [
		literal<TSRTimelineObj<TimelineContentBBCGSAASLoad>>({
			id: '0',
			enable: {
				start: Date.now() + 2000,
			},
			layer: 'gsaasLoad0',
			content: {
				deviceType: DeviceType.BBC_GSAAS,
				type: TimelineContentTypeBBCGSAAS.LOAD,
				scenes: {
					'*': 'bbc-graphics-cloud-lower-thirds-graphics/2.0.0/index.html',
				},
			},
		}),		
		literal<TSRTimelineObj<TimelineContentBBCGSAASUpdate>>({
			id: '1',
			enable: {
				start: Date.now() + 4000,
				duration: 5000,
			},
			layer: 'gsaasZone0',
			content: {
				deviceType: DeviceType.BBC_GSAAS,
				type: TimelineContentTypeBBCGSAAS.UPDATE,
				take: {
					data: {"mainStrap":{"action":"goIn","details":{"component":"headline","style":"Default","text1":"Top Line","text2":""},"style":"Default"}}
				},
				clear: {
					data: {"mainStrap":{"action":"goOut","details":{"component":"headline","logoOut":true}}}
				}
			},
		}),
		literal<TSRTimelineObj<TimelineContentBBCGSAASUpdate>>({
			id: '2',
			enable: {
				start: Date.now() + 4000,
			},
			layer: 'gsaasZone1',
			content: {
				deviceType: DeviceType.BBC_GSAAS,
				type: TimelineContentTypeBBCGSAAS.UPDATE,
				take: {
					data: {"locatorLeft":{"details":{"tabText":"LIVE","clock":"off","mainText":"Here","component":"leftLocator"},"action":"goIn","style":"Default"}}
				},
				clear: {
					data: {"locatorLeft":{"action":"goOut","details":{"component":"leftLocator"}}}
				}
			},
		}),
		literal<TSRTimelineObj<TimelineContentBBCGSAASUpdate>>({
			id: '3',
			enable: {
				start: Date.now() + 8000,
			},
			layer: 'gsaasZone1',
			content: {
				deviceType: DeviceType.BBC_GSAAS,
				type: TimelineContentTypeBBCGSAAS.UPDATE,
				take: {
					data: {"locatorLeft":{"details":{"tabText":"EARLIER","clock":"off","mainText":"There","component":"leftLocator"},"action":"goIn","style":"Default"}}
				},
				clear: {
					data: {"locatorLeft":{"action":"goOut","details":{"component":"leftLocator"}}}
				}
			},
		}),
	],
}
