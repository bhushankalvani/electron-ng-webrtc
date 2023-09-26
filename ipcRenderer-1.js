const { ipcRenderer, desktopCapturer } = require('electron')

console.log('ipcRenderer loaded');


/** @debug effects on resources */
// contextBridge.exposeInMainWorld("ipcRenderer",ipcRenderer)

// WebRTC default TURN server from many examples.
const RTCConfig = {
	iceServers: [{
		'urls': 'stun:stun.l.google.com:19302',
		// username: 'webrtc',
		// credential: 'turnserver'
	}]
};

let PeerConnection;

/** @note create request */
ipcRenderer.on('REQUEST_SCREENCAST', RequestScreencast);

async function RequestScreencast() {
	console.log('method::REQUEST_SCREENCAST, ipcRenderer');
	createPeerConnection();

	const offer = await PeerConnection.createOffer();
	if (PeerConnection.signalingState != "stable") {
		return;
	}

	await PeerConnection.setLocalDescription(offer);

	ipcRenderer.send('NEW_SCREENCAST_REQ', { sdp: JSON.stringify(PeerConnection.localDescription) });
}

ipcRenderer.on('REQUEST_RECEIVED', AcceptRTCRequest);

// async function AcceptRTCRequest(event, message, sourceId, ScreenSize) {
	async function AcceptRTCRequest(event, message) {
	console.log('method::REQUEST_RECEIVED, ipcRenderer');
	if(!PeerConnection) {
		createPeerConnection();
	}


	if (PeerConnection.signalingState != "stable") {
	
		// Set the local and remove descriptions for rollback; don't proceed
		// until both return.
		await Promise.all([
			PeerConnection.setLocalDescription({type: "rollback"}),
			PeerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(message.sdp)))
		]);
		return;
	  } else {
		await PeerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(message.sdp)));
	}

	
	try {
		const answer = await PeerConnection.createAnswer();
		await PeerConnection.setLocalDescription(answer);

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
		handleLocalStream(streams[0]);

		/** @note send data using sockets */
		ipcRenderer.send('ACCEPT_INVITE', { sdp: JSON.stringify(answer) });
	} catch(error) {
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
    PeerConnection.onicecandidate = handleICECandidateEvent;
    PeerConnection.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
    PeerConnection.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
    PeerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;
    PeerConnection.ontrack = handleTrackEvent;
    PeerConnection.onnegotiationneeded = handleNegotiationNeededEvent;
}

function handleTrackEvent(event) {
	console.log("Track event");
	console.log('event tracks', event.track);
	console.log('local stream', event.streams);
	if (event.streams && event.streams[0]) {
		console.log('local streams');
		handleLocalStream(event.streams[0]);
	} 
	if(event.track) {
		console.log('remote streams');
		// const inboundStream = new MediaStream(PeerConnection.getReceivers().map(rec => rec.track));
		const inboundStream = new MediaStream();
		inboundStream.addTrack(event.track);
		handleRemoteStream(inboundStream);
	}
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
  
	switch(PeerConnection.iceConnectionState) {
	  case "closed":
	  case "failed":
	  case "disconnected":
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
	switch(PeerConnection.signalingState) {
		case "closed":
			/** @fixme Add ipcEvent to tell socket to end connections and clean up. */
			// closeVideoCall();
		break;
	}
}

// Handles |icecandidate| events by forwarding the specified
// ICE candidate (created by our local ICE agent) to the other
// peer through the signaling server.
function handleICECandidateEvent(event) {
	if (event.candidate) {
		console.log("*** Outgoing ICE candidate: " + event.candidate.candidate);
		ipcRenderer.send('ICE_CANDIDATE', {candidate: JSON.stringify(event.candidate)});
	}
}

ipcRenderer.on('NEW_ICE_CANDIDATE', handleNewICECandidateMsg);
async function handleNewICECandidateMsg(event, request) {
	try {
	console.log('candidate', request.candidate);
	const candidate = new RTCIceCandidate(JSON.parse(request.candidate));

	console.log("*** Adding received ICE candidate: ", candidate);
	await PeerConnection.addIceCandidate(candidate);
	} catch(err) {
	console.error('error adding ice candidate', err);
	}
}


/** @note handle video streams */
function handleLocalStream (stream) {
	const localVideo = document.getElementById('localVideo'); 
	localVideo.srcObject = stream;
	localVideo.onloadedmetadata = (e) => localVideo.play();
	// localVideo.play();
}

function handleRemoteStream(stream) {
	const remoteVideo = document.getElementById('remoteVideo'); 
	// inboundStream = new MediaStream();
	remoteVideo.srcObject = stream;
	remoteVideo.onloadedmetadata = (e) => {console.log('remote_video_event', e); remoteVideo.play()};
	// remoteVideo.play();
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

	} catch(err) {
	  console.error("The following error occurred while handling the negotiationneeded event:", err);
	};
  }