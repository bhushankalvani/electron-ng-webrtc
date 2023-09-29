const { ipcRenderer, desktopCapturer } = require('electron')

console.log('ipcRenderer loaded');


/** @debug effects on resources */
// contextBridge.exposeInMainWorld("ipcRenderer",ipcRenderer)

// WebRTC default TURN server from many examples.
const RTCConfig = {
	iceServers: [{
		// 'urls': ['stun:stun.l.google.com:19302'],
		'urls': [
			'stun:stun.l.google.com:19302',
			'stun:stun1.l.google.com:19302',
			'stun:stun2.l.google.com:19302',
		],
	}],
	sdpSemantics: 'unified-plan', //newer implementation of WebRTC
	iceCandidatePoolSize: 2
};

let PeerConnection;

/** @note create request */
ipcRenderer.on('REQUEST_SCREENCAST', RequestScreencast);

async function RequestScreencast(event, sourceId, ScreenSize) {
	console.log('method::REQUEST_SCREENCAST, ipcRenderer');
	if (!PeerConnection) {
		createPeerConnection();
	}

	const offer = await PeerConnection.createOffer();
	if (PeerConnection.signalingState != "stable") {
		return;
	}

	await PeerConnection.setLocalDescription(offer);

	// try {
	// 	const streams = await navigator.mediaDevices.getUserMedia({
	// 		audio: false,
	// 		video: {
	// 		mandatory: {
	// 			chromeMediaSource: 'desktop',
	// 			chromeMediaSourceId: sourceId,
	// 			minWidth: ScreenSize.width,
	// 			maxWidth: ScreenSize.width,
	// 			minHeight: ScreenSize.height,
	// 			maxHeight: ScreenSize.height,
	// 		}
	// 		}
	// 	});

	// 	streams.getTracks().forEach(async (track) => {
	// 		await PeerConnection.addTrack(track, streams);
	// 	});
	// 	console.log('handle local streams', streams);
	// } catch (overConstErr) {
	// 	console.log('overConstErr', overConstErr, overConstErr.constraint);
	// }

	ipcRenderer.send('NEW_SCREENCAST_REQ', { sdp: JSON.stringify(PeerConnection.localDescription) });
}

ipcRenderer.on('REQUEST_RECEIVED', AcceptRTCRequest);

async function AcceptRTCRequest(event, message, sourceId, ScreenSize) {
	// async function AcceptRTCRequest(event, message) {
	console.log('method::REQUEST_RECEIVED, ipcRenderer');
	if (!PeerConnection) {
		createPeerConnection();
	}


	if (PeerConnection.signalingState != "stable") {

		// Set the local and remove descriptions for rollback; don't proceed
		// until both return.
		await Promise.all([
			PeerConnection.setLocalDescription({ type: "rollback" }),
			PeerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(message.sdp)))
		]);
		return;
	} else {
		await PeerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(message.sdp)));
	}


	try {

		const streams = await navigator.mediaDevices.getUserMedia({
			audio: false,
			video: {
				mandatory: {
					chromeMediaSource: 'desktop',
					chromeMediaSourceId: sourceId,
					minWidth: ScreenSize.width,
					maxWidth: ScreenSize.width,
					minHeight: ScreenSize.height,
					maxHeight: ScreenSize.height,
				}
			}
		});

		// const streams = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
		streams.getTracks().forEach(async (track) => {
			await PeerConnection.addTrack(track, streams);
		});
		console.log('handle local streams', streams);
		handleLocalStream(streams);


		await PeerConnection.setLocalDescription(await PeerConnection.createAnswer());

		/** @note send data using sockets */
		ipcRenderer.send('ACCEPT_INVITE', { sdp: JSON.stringify(PeerConnection.localDescription) });
	} catch (error) {
		console.log('stream error', error);
	}
}


ipcRenderer.on('SHARE_SCREEN', ShareScreen);

// async function ShareScreen(event, sourceId, ScreenSize, peerAnswer) {
async function ShareScreen(event, peerAnswer) {
	console.log('method::SHARE_SCREEN, ipcRenderer');
	try {
		if (PeerConnection.signalingState != 'stable') {
			const answer = new RTCSessionDescription(JSON.parse(peerAnswer.sdp));
			await PeerConnection.setRemoteDescription(answer);
		}
		// const streams = await navigator.mediaDevices.getUserMedia({
		// 	audio: false,
		// 	video: {
		// 	mandatory: {
		// 		chromeMediaSource: 'desktop',
		// 		chromeMediaSourceId: sourceId,
		// 		minWidth: ScreenSize.width,
		// 		maxWidth: ScreenSize.width,
		// 		minHeight: ScreenSize.height,
		// 		maxHeight: ScreenSize.height,
		// 	}
		// 	}
		// });

		// // const streams = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });

		// streams.getTracks().forEach(async (track) => {
		// 	await PeerConnection.addTrack(track, streams);
		// });

		// console.log('local streams', streams);
		// let inboundStream = new MediaStream(streams[0]);
		// handleLocalStream(inboundStream);
	} catch (e) {
		console.error('error in screencast', e);
	}
}


/**
 * @link https://github.com/mdn/samples-server/blob/master/s/webrtc-from-chat/chatclient.js#L348
 * @link https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection
 */
function createPeerConnection() {
	PeerConnection = new RTCPeerConnection(RTCConfig);

	/** @fixme Pending event handlers */
	PeerConnection.onicecandidate = onCreateNewICECandidateEvent;
	PeerConnection.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
	PeerConnection.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
	PeerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;
	PeerConnection.ontrack = handleTrackEvent;
	PeerConnection.onnegotiationneeded = handleNegotiationNeededEvent;

	PeerConnection.addEventListener('track', async (event) => {
		console.log('remote tracks found', event);
		const [remoteStream] = event.streams;
		handleRemoteStream(remoteStream);
		// remoteVideo.srcObject = remoteStream;
	});
}

async function handleTrackEvent(event) {
	console.log('remote stream', event.streams);
	// const [remoteStream] = event.streams;
	// if (event.streams.length > 0) {
	console.log('remote streams', event.streams);
	// handleRemoteStream(event.streams[0]);
	// const remoteStream = new MediaStream(PeerConnection.getReceivers().map(receiver => receiver.track));
	const remoteStream = event.streams[0];
	handleRemoteStream(remoteStream);
	// }
}

function handleICEGatheringStateChangeEvent(event) {
	console.log("*** ICE gathering state changed to: " + PeerConnection.iceGatheringState);
}

// Handle |iceconnectionstatechange| events. This will detect
// when the ICE connection is closed, failed, or disconnected.
//
// This is called when the state of the ICE agent changes.
function handleICEConnectionStateChangeEvent(event) {
	console.log("*** ICE connection state changed to " + PeerConnection.iceConnectionState);

	switch (PeerConnection.iceConnectionState) {
		case "closed":
		case "failed":
		case "disconnected":
			console.log('*** ICE candidate call failed');
			// closeVideoCall();
			break;
	}
}

// Set up a |signalingstatechange| event handler. This will detect when
// the signaling connection is closed.
//
// NOTE: This will actually move to the new RTCPeerConnectionState enum
// returned in the property RTCPeerConnection.connectionState when
// browsers catch up with the latest version of the specification!
function handleSignalingStateChangeEvent(event) {
	console.log("*** WebRTC signaling state changed to: " + PeerConnection.signalingState);
	switch (PeerConnection.signalingState) {
		case "closed":
			/** @fixme Add ipcEvent to tell socket to end connections and clean up. */
			// closeVideoCall();
			console.log('*** ICE candidate call closed');
			break;
	}
}

// Handles |icecandidate| events by forwarding the specified
// ICE candidate (created by our local ICE agent) to the other
// peer through the signaling server.
function onCreateNewICECandidateEvent(event) {
	if (PeerConnection.localDescription && PeerConnection.remoteDescription && event.candidate) {
		console.log("*** Outgoing ICE candidate: " + event.candidate.candidate);
		ipcRenderer.send('ICE_CANDIDATE', { candidate: event.candidate.toJSON() });
	}
}

ipcRenderer.on('NEW_ICE_CANDIDATE', handleNewICECandidateMsg);
async function handleNewICECandidateMsg(event, request) {
	try {
		console.log('candidate', request.candidate);
		if (!PeerConnection.remoteDescription || !PeerConnection.localDescription) return;

		const candidate = new RTCIceCandidate(request.candidate);

		console.log("*** Remote description for current PeerConnection: ", PeerConnection.remoteDescription);
		console.log("*** Adding received ICE candidate: ", candidate);
		await PeerConnection.addIceCandidate(candidate);
	} catch (err) {
		console.error('error adding ice candidate', err);
	}
}

/** @note handle video streams */
function handleLocalStream(stream) {
	const localVideo = document.getElementById('localVideo');
	localVideo.autoplay = true;
	localVideo.srcObject = stream;
	localVideo.onloadedmetadata = (e) => localVideo.play();
}

function handleRemoteStream(stream) {
	const remoteVideo = document.getElementById('remoteVideo');
	remoteVideo.setAttribute('autoplay', true);
	// inboundStream = new MediaStream();
	remoteVideo.srcObject = stream;
	remoteVideo.onloadedmetadata = (e) => { console.log('remote_video_event', e); remoteVideo.play() };
}



async function handleNegotiationNeededEvent() {
	console.log("Negotiation needed");

	try {
		const offer = await PeerConnection.createOffer();

		// If the connection hasn't yet achieved the "stable" state,
		// return to the caller. Another negotiationneeded event
		// will be fired when the state stabilizes.

		if (PeerConnection.signalingState != "stable") {
			console.log("The connection isn't stable yet; postponing...")
			return;
		}

		// Establish the offer as the local peer's current
		// description.

		console.log("Setting local description to the offer");
		await PeerConnection.setLocalDescription(offer);

		// Send the offer to the remote peer.

		console.log("Sending the offer to the remote peer");
		ipcRenderer.send('NEGOTIATION', { sdp: JSON.stringify(PeerConnection.localDescription) });

	} catch (err) {
		console.error("The following error occurred while handling the negotiationneeded event:", err);
	};
}