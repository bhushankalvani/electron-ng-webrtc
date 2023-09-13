import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';


platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));

// console.log('ipcRenderer loadedevent');

// /** @debug effects on resources */
// // contextBridge.exposeInMainWorld("ipcRenderer",ipcRenderer)

// // WebRTC default TURN server from many examples.
// const RTCConfig = {
// 	iceServers: [{
// 		'urls': 'stun:stun.l.google.com:19302',
// 		// username: 'webrtc',
// 		// credential: 'turnserver'
// 	}]
// };
// // const RTCConfig = {
// // 	iceServers: [{
// // 			urls: "http://localhost:3000",  // A TURN server using socket.io
// // 			// username: "webrtc",
// // 			// credential: "turnserver"
// // 		}
// // 	]
// // };
// let PeerConnection: any;


// /** @note create request */
// ipcRenderer.on('REQUEST_SCREENCAST', RequestScreencast);

// async function RequestScreencast() {
// 	console.log('method::REQUEST_SCREENCAST, ipcRenderer');
// 	createPeerConnection();
// 	const offer = await PeerConnection.createOffer();
// 	if (PeerConnection.signalingState != "stable") {
// 		return;
// 	}

// 	await PeerConnection.setLocalDescription(offer);

// 	ipcRenderer.send('NEW_SCREENCAST_REQ', { sdp: PeerConnection.localDescription });
// }

// ipcRenderer.on('REQUEST_RECEIVED', AcceptRTCRequest);

// async function AcceptRTCRequest(event: any, message: any) {
// 	console.log('method::REQUEST_RECEIVED, ipcRenderer');
// 	createPeerConnection();
// 	await PeerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp));
// 	const answer = await PeerConnection.createAnswer();
// 	console.log('answer', answer);
// 	await PeerConnection.setLocalDescription(answer);
// 	/** @note send data using sockets */
// 	ipcRenderer.send('ACCEPT_INVITE', { answer });
// }


// ipcRenderer.on('RECORD_SCREEN', ShareScreen);

// async function ShareScreen(event: any, sourceId: any) {
// 	console.log('method::RECORD_SCREEN, ipcRenderer');
//     /** @fixme remove creating peer connection and call the global method createPeerConnection() instead. */
// 	/** @fixme remove RTCSignaling and replace with socket call for receiving peer call offer. */
//     // RTCSignalingChannel.addEventListener('message', async message => {
// 		// if (message.offer) {
// 			// PeerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
// 			// const answer = await PeerConnection.createAnswer();
//             // console.log('answer', answer);
// 			// await PeerConnection.setLocalDescription(answer);
// 			// /** @note send data using sockets */
//             // ipcRenderer.send('accept-invite', { answer });
//             try {
// 				const primaryDisplay = screen.getPrimaryDisplay();
// 				const ScreenSize = primaryDisplay.workAreaSize;
// 				const stream = await navigator.mediaDevices.getUserMedia({
// 				  audio: false,
//           video: {
//             width: ScreenSize.width,
//             height: ScreenSize.height
//           }
// 				  // video: {
//           //   mandatory: {
//           //     chromeMediaSource: 'desktop',
//           //     /** @fixme sourceId required */
//           //     chromeMediaSourceId: sourceId,
//           //     minWidth: ScreenSize.width,
//           //     maxWidth: ScreenSize.width,
//           //     minHeight: ScreenSize.height,
//           //     maxHeight: ScreenSize.height,
//           //   }
// 				  // }
// 				});
// 				stream.getTracks().forEach(track => {
// 					PeerConnection.addTrack(track, stream);
// 				});
// 			  } catch (e) {
// 				console.log('error in screencast', e);
// 			  }
// 		// }
// 	// });
// }


// /**
//  * @link https://github.com/mdn/samples-server/blob/master/s/webrtc-from-chat/chatclient.js#L348
//  * @link https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection
//  */
// function createPeerConnection() {
// 	PeerConnection = new RTCPeerConnection(RTCConfig);

//     /** @fixme Pending event handlers */
//     PeerConnection.onicecandidate = handleICECandidateEvent;
//     PeerConnection.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
//     PeerConnection.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
//     PeerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;
//     PeerConnection.ontrack = handleTrackEvent;
//     PeerConnection.onnegotiationneeded = RequestScreencast;
// }

// function handleTrackEvent(event: any) {
// 	console.log("*** Track event");
// 	// document.getElementById("received_video").srcObject = event.streams[0];
// 	// document.getElementById("hangup-button").disabled = false;
// }

// function handleICEGatheringStateChangeEvent(event: any) {
// 	console.log("*** ICE gathering state changed to: " + PeerConnection.iceGatheringState);
// }

// // Handle |iceconnectionstatechange| events. This will detect
// // when the ICE connection is closed, failed, or disconnected.
// //
// // This is called when the state of the ICE agent changes.
// function handleICEConnectionStateChangeEvent(event: any) {
// 	console.log("*** ICE connection state changed to " + PeerConnection.iceConnectionState);
  
// 	switch(PeerConnection.iceConnectionState) {
// 	  case "closed":
// 	  case "failed":
// 	  case "disconnected":
// 		// closeVideoCall();
// 		break;
// 	}
// }

// // Set up a |signalingstatechange| event handler. This will detect when
// // the signaling connection is closed.
// //
// // NOTE: This will actually move to the new RTCPeerConnectionState enum
// // returned in the property RTCPeerConnection.connectionState when
// // browsers catch up with the latest version of the specification!
// function handleSignalingStateChangeEvent(event: any) {
// 	console.log("*** WebRTC signaling state changed to: " + PeerConnection.signalingState);
// 	switch(PeerConnection.signalingState) {
// 		case "closed":
// 			/** @fixme Add ipcEvent to tell socket to end connections and clean up. */
// 			// closeVideoCall();
// 		break;
// 	}
// }

// // Handles |icecandidate| events by forwarding the specified
// // ICE candidate (created by our local ICE agent) to the other
// // peer through the signaling server.

// function handleICECandidateEvent(event: any) {
// 	if (event.candidate) {
// 	  console.log("*** Outgoing ICE candidate: " + event.candidate.candidate);
  
// 	  // sendToServer({
// 		// type: "new-ice-candidate",
// 		// target: targetUsername,
// 		// candidate: event.candidate
// 	  // });
// 	}
// }
