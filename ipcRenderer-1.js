const { ipcRenderer, desktopCapturer } = require('electron')

console.log('ipcRenderer loaded');

/** @note store the ids of self and requesting peer to process requests. */
let ownId, requestedBy;

/** 
 * @note Use your own TURN server config.
 * Link for the provider I used for creating a quick and utilising an existing TURN server capability. 
 * @link https://www.metered.ca/
 */
const ICE_CONFIG = require('./ice-server-config.json');
const RTCICEConfig = ICE_CONFIG;

let PeerConnection;
let IceCandidateQueue = [];

/** 
 * @note create request from one client for the other.
 * This example creates a request from peer id '2' in main.js for peer id '1'
 */
ipcRenderer.on('REQUEST_SCREENCAST', RequestScreencast);

async function RequestScreencast(event, sourceId, ScreenSize) {
	console.log('method::REQUEST_SCREENCAST, ipcRenderer');
	if (!PeerConnection) {
		createPeerConnection();
	}

	const offer = await PeerConnection.createOffer();
	if (PeerConnection.signalingState != "stable") {
		CloseScreencast();
		return;
	}

	await PeerConnection.setLocalDescription(offer);

	ipcRenderer.send('NEW_SCREENCAST_REQ', { sdp: JSON.stringify(PeerConnection.localDescription) });
}

/** 
 * @note Negotiation event between peers to decide the best protocol for the call.
 * and sends all queued ICE Candidates. New connections can also be established
 * in case of old ICE candidate failures.
 */
ipcRenderer.on('NEGOTIATION_REQUEST_RECEIVED', NegotiationEvent);
async function NegotiationEvent(event, message) {
	ownId = message['for'];
	requestedBy = message['by'];
	// console.log('method::NEGOTIATION_REQUEST_RECEIVED, ipcRenderer');
	if (!PeerConnection) {
		createPeerConnection();
	}

	if (PeerConnection.signalingState != "stable") {

		/** 
		 * @note Set the local and remove descriptions for rollback;
		 * don't proceed until both return.
		 */
		await Promise.all([
			PeerConnection.setLocalDescription({ type: "rollback" }),
			PeerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(message.sdp)))
		]);
		return;
	} else {
		await PeerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(message.sdp)));
	}

	await PeerConnection.setLocalDescription(await PeerConnection.createAnswer());

	/** @note send data using sockets */
	ipcRenderer.send('ACCEPT_INVITE', { for: requestedBy, by: ownId, sdp: JSON.stringify(PeerConnection.localDescription) });
	
	/** @note After setting the local description, check if there are ICE candidates in the queue. */
	sendQueuedICECandidates();
}

/** 
 * @note Actual request received from peer using socket server.
 * Accepting call here.
 */
ipcRenderer.on('REQUEST_RECEIVED', AcceptRTCRequest);
async function AcceptRTCRequest(event, message, sourceId, ScreenSize) {
	ownId = message['for'];
	requestedBy = message['by'];
	// console.log('method::REQUEST_RECEIVED, ipcRenderer');
	if (!PeerConnection) {
		createPeerConnection();
	}

	if (PeerConnection.signalingState != "stable") {
		/** 
		 * @note Set the local and remove descriptions for rollback; 
		 * don't proceed until both return.
		 */
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

		
		streams.getTracks().forEach(async (track) => {
			await PeerConnection.addTrack(track, streams);
		});

		// console.log('handle local streams', streams);
		handleLocalStream(streams);

		await PeerConnection.setLocalDescription(await PeerConnection.createAnswer());

		/** @note send data using sockets */
		ipcRenderer.send('ACCEPT_INVITE', { for: requestedBy, by: ownId, sdp: JSON.stringify(PeerConnection.localDescription) });
		
		/** @note After setting the local description, check if there are ICE candidates in the queue. */
		sendQueuedICECandidates();
	} catch (error) {
		console.log('stream error', error);
	}
}


/**
 * @note Method created to handle the successful peer connection answer.
 * 'SHARE_SCREEN' since I use this example to share display source like screen sharing.
 */
ipcRenderer.on('SHARE_SCREEN', ShareScreen);
async function ShareScreen(event, peerAnswer) {
	// console.log('method::SHARE_SCREEN, ipcRenderer');
	try {
		if (PeerConnection.signalingState != 'stable') {
			const answer = new RTCSessionDescription(JSON.parse(peerAnswer.sdp));
			await PeerConnection.setRemoteDescription(answer);
			// setPeerConnectionListeners();
			sendQueuedICECandidates();
		}
	} catch (e) {
		console.error('error in screencast', e);
	}
}

/** 
 * @note Creating a WebRTC peer connection and registering all required and
 * some extra events for WebRTC peer monitoring.
 */
function createPeerConnection() {
	PeerConnection = new RTCPeerConnection(RTCICEConfig);

	PeerConnection.onicecandidate = onCreateNewICECandidateEvent;
	PeerConnection.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
	PeerConnection.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
	PeerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;
	PeerConnection.ontrack = handleTrackEvent;
	PeerConnection.onnegotiationneeded = handleNegotiationNeededEvent;
	PeerConnection.onconnectionstatechange = handleConnectionStateChangeEvent;
}

/**
 * @note Can check current and different connection states
 * for a peer connection (here PeerConnection).
 */
async function handleConnectionStateChangeEvent(event) {
	if (PeerConnection.connectionState === 'connected') {
		// Peers connected!
		console.info('Peers connected');
    }
}

/** 
 * @note Handle different tracks added by remote peer.
 * I use it to transfer remote stream to my video element in angular index.html
 */
async function handleTrackEvent(event) {
	// console.log('remote streams', event.streams);
	const remoteStream = event.streams[0];
	handleRemoteStream(remoteStream);
}

/**
 *  @note I used it to monitor and learn about different states during ICE candidacy exchange
 *  and different states a connection goes through on both ends. 
 */
function handleICEGatheringStateChangeEvent(event) {
	console.log("*o* ICE gathering state changed to: " + PeerConnection.iceGatheringState);
}

/** 
 * @note Handle |iceconnectionstatechange| events. This will detect
 * when the ICE connection is closed, failed, or disconnected.
 *
 * This is called when the state of the ICE agent changes.
 */
function handleICEConnectionStateChangeEvent(event) {
	console.log("*o* ICE connection state changed to " + PeerConnection.iceConnectionState);

	switch (PeerConnection.iceConnectionState) {
		case "closed":
		case "failed":
		case "disconnected":
			console.log('*o* ICE candidate call failed');
			CloseScreencast();
			break;
	}
}

/**
 * @note Set up a |signalingstatechange| event handler. This will detect when
 * the signaling connection is closed.
 * 
 * This will actually move to the new RTCPeerConnectionState enum
 * returned in the property RTCPeerConnection.connectionState when
 * browsers catch up with the latest version of the specification!
 */
function handleSignalingStateChangeEvent(event) {
	console.log("*o* WebRTC signaling state changed to: " + PeerConnection.signalingState);
	switch (PeerConnection.signalingState) {
		case "closed":
			CloseScreencast();
			console.log('*o* ICE candidate call closed');
			break;
	}
}

/**
 * @note Handles |icecandidate| events by forwarding the specified
 * ICE Candidate (created by our local ICE agent) to the other
 * peer through the signaling server.
 */ 
function onCreateNewICECandidateEvent(event) {
	/** 
	 * @note managing a queue until remote description is set
	 * to prevent ICE Candidates from failure.
	 */
	if(event.candidate) {
		if (!PeerConnection.remoteDescription) {
			IceCandidateQueue.push(event.candidate);
		} else {
			sendIceCandidateToPeer(event.candidate);
		}
	}
}

/**
 * @note Sends all the ICE Candidates from the queue
 * when remote description is set. 
 */
function sendQueuedICECandidates() {
	if (PeerConnection.remoteDescription) {
		while (IceCandidateQueue.length > 0) {
		  const candidate = IceCandidateQueue.shift();
		  sendIceCandidateToPeer(candidate);
		}
	  }
}

/**
 * @note Sends individual candidates over socket to the connected Peer.
*/
function sendIceCandidateToPeer(candidate) {
	ipcRenderer.send('ICE_CANDIDATE', { by: ownId, for: requestedBy, candidate: JSON.stringify(candidate) });
}

/**
 * @note Handle received ICE Candidate from Peer over socket.
 */
ipcRenderer.on('NEW_ICE_CANDIDATE', handleReceivedICECandidateMsg);
async function handleReceivedICECandidateMsg(event, request) {
	try {
		ownId = request['for'];
		requestedBy = request['by'];
		if (!PeerConnection.remoteDescription || !PeerConnection.localDescription) return;
		const candidate = new RTCIceCandidate(JSON.parse(request.candidate));

		// console.log("*o* Adding received ICE candidate: ", candidate);
		await PeerConnection.addIceCandidate(candidate);
	} catch (err) {
		console.error('error adding ice candidate', err);
	}
}

/** @note handle video streams */
/** @note handle local streams */
function handleLocalStream(stream) {
	const localVideo = document.getElementById('localVideo');
	localVideo.autoplay = true;
	localVideo.srcObject = stream;
	localVideo.onloadedmetadata = (e) => localVideo.play();
}

/** @note handle remote streams */
function handleRemoteStream(stream) {
	const remoteVideo = document.getElementById('remoteVideo');
	localVideo.autoplay = true;
	remoteVideo.srcObject = stream;
	remoteVideo.onloadedmetadata = (e) => remoteVideo.play();
}

/**
 * @note Handle PeerConnection negotiation event.
 * Used to finalise protocols for peer connections for sending data.
 */
async function handleNegotiationNeededEvent() {
	// console.log("Negotiation needed");

	try {
		const offer = await PeerConnection.createOffer();

		/** 
		 * @note If the connection hasn't yet achieved the "stable" state,
		 * return to the caller. Another negotiationneeded event
		 * will be fired when the state stabilizes.
		 */

		if (PeerConnection.signalingState != "stable") {
			console.log("The connection isn't stable yet; postponing...")
			return;
		}

		/** @note Establish the offer as the local peer's current description. */
		// console.log("Setting local description to the offer");
		await PeerConnection.setLocalDescription(offer);

		/** @note Send the offer to the remote peer. */
		// console.log("Sending the offer to the remote peer");
		ipcRenderer.send('NEGOTIATION', { by:ownId, for: requestedBy, sdp: JSON.stringify(PeerConnection.localDescription) });

	} catch (err) {
		console.error("The following error occurred while handling the negotiationneeded event:", err);
	};
}

/**
 * @note Safely unload peer connection and stop it's streams.
 * Use it to hangup calls normally or in errored states.
 */
ipcRenderer.on('DISCONNECT_CALL', event => CloseScreencast(true));
async function CloseScreencast(peerRequest = false) {
	if (PeerConnection) {
		// console.log("Closing connection and call");
		if(!peerRequest) {
			this.socket.emit('disconnect-call', {for: requestedBy, by: ownId});
		}
		requestedBy = null;
		ownId = null;
		/** 
		 * @note Disconnect all our event listeners; we don't want stray events
		 * to interfere with the hangup while it's ongoing.
		 */
		PeerConnection.ontrack = null;
		PeerConnection.onnicecandidate = null;
		PeerConnection.oniceconnectionstatechange = null;
		PeerConnection.onsignalingstatechange = null;
		PeerConnection.onicegatheringstatechange = null;
		PeerConnection.onnotificationneeded = null;
	
		/** @note Stop all transceivers on the connection */
		PeerConnection.getTransceivers().forEach(transceiver => {
		  transceiver.stop();
		});
	
		/**
		 * @note Stop the webcam preview as well by pausing the <video>
		 * element, then stopping each of the getUserMedia() tracks
		 * on it.
	 	 */
		if (localVideo.srcObject) {
		  localVideo.pause();
		  localVideo.srcObject.getTracks().forEach(track => {
			track.stop();
		  });
		}
	
		/** @note Close the peer connection */
	
		PeerConnection.close();
		PeerConnection = null;
	}
}

/**
 * @references WebRTC examples.
 * @link https://webrtc.org/getting-started/remote-streams
 * @link https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection
 * @link https://github.com/mdn/samples-server/blob/master/s/webrtc-from-chat/chatclient.js
 */