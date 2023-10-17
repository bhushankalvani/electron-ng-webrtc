import { Injectable, OnDestroy, OnInit, EventEmitter } from '@angular/core';
import { Observable, pipe, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { Socket } from 'ngx-socket-io';
import { environment } from 'src/environments/environment';

interface SocketPeerConnection {
  for: string | number,
  by: string | number,
  sdp?: string,
  candidate?: string,
}

@Injectable({
  providedIn: 'root'
})
export class WebRTCSocketService implements OnInit, OnDestroy {
  PeerConnection: RTCPeerConnection;
  IceCandidateQueue = [];
  RTCICEConfig: RTCConfiguration = environment.ICE_CONFIG;

  requestedWPUser: string | number | null = null;
  remoteStream: EventEmitter<MediaStream> = new EventEmitter();

  /** @fixme Set WP user id; got from wherever local storage or API call. */
  userId = "2";

  constructor(
    private socket: Socket,
  ) {
    this.connectRealTime();
  }

  /**
   *  
   * @note Socket setup and registration for Peer Connections.
   *  
   */
  ngOnInit() {
    // this.connectRealTime();
  }

  /**
   *  
   * @note Socket setup and registration for Peer Connections.
   *  
   */

  /** @fixme Set WP user id */
  registerUserToSocket(user_id: string | number) {
    this.socket.emit('register-user', { id: user_id.toString() }, (ack) => {
      console.log('socket user registered');
    });
  }

  async registerSocketListeners() { /** @debug does it need to be async really? */
    console.log('register socket events called');
    this.socket.fromEvent('connect').subscribe((event) => { console.log('*o* socket connected *o*'); this.registerUserToSocket(this.userId) })
	  this.socket.fromEvent('requesting-screencast').subscribe((event: SocketPeerConnection) => this.ScreencastRequest(event));
    this.socket.fromEvent('disconnect').subscribe((event) => this.SocketDisconnect(event));
    this.socket.fromEvent('screencast-accepted').subscribe((answer: SocketPeerConnection) => this.ScreencastReqAccepted(answer));
    this.socket.fromEvent('ice-candidate-received').subscribe((request: SocketPeerConnection) => this.HandleIceCandidateReceiveEvent(request));
    this.socket.fromEvent('negotiation-request').subscribe((message: SocketPeerConnection) => this.NegotiationRequestReceived(message));
    this.socket.fromEvent('disconnect-call').subscribe((message: SocketPeerConnection) => this.CloseScreencast(true));
  }

  async ScreencastRequest(message: SocketPeerConnection) {
    // console.log('method::REQUEST_RECEIVED, ipcRenderer');
	if (!this.PeerConnection) {
		await this.createPeerConnection();
	}

	if (this.PeerConnection.signalingState != "stable") {
		/** 
		 * @note Set the local and remove descriptions for rollback; 
		 * don't proceed until both return.
		 */
		await Promise.all([
			this.PeerConnection.setLocalDescription({ type: "rollback" }),
			this.PeerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(message.sdp)))
		]);
		return;
	} else {
		await this.PeerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(message.sdp)));
	}

	try {
      const streams = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: true,
    })
		
		streams.getTracks().forEach(async (track) => {
			this.PeerConnection.addTrack(track, streams);
		});

		await this.PeerConnection.setLocalDescription(await this.PeerConnection.createAnswer());

		/** @note send data using sockets */
		this.socket.emit('accepted-invite', {
      by: this.userId.toString(),
      for: this.requestedWPUser?.toString(), 
      sdp: JSON.stringify(this.PeerConnection.localDescription)
    });
		
		/** @note After setting the local description, check if there are ICE candidates in the queue. */
		this.sendQueuedICECandidates();
  } catch (error) {
    console.log('stream error', error);
  }
}

  SocketDisconnect(event: any) {
    this.socket.emit('close-connection', this.userId.toString());
    this.disconnectRealTime();
  }

  async ScreencastReqAccepted(peerAnswer: SocketPeerConnection) {
    try {
      if (this.PeerConnection.signalingState != 'stable') {
        const answer = new RTCSessionDescription(JSON.parse(peerAnswer.sdp));
        await this.PeerConnection.setRemoteDescription(answer);
        this.sendQueuedICECandidates();
      }
    } catch (e) {
      console.error('error in screencast', e);
    }
  }

  async HandleIceCandidateReceiveEvent(request: SocketPeerConnection) {
    try {
      if (!this.PeerConnection.remoteDescription || !this.PeerConnection.localDescription) return;
      const candidate = new RTCIceCandidate(JSON.parse(request.candidate));

      // console.log("*o* Adding received ICE candidate: ", candidate);
      await this.PeerConnection.addIceCandidate(candidate);
    } catch (err) {
      console.error('error adding ice candidate', err);
    }
  }

  async NegotiationRequestReceived(message: SocketPeerConnection) {
    if (!this.PeerConnection) {
      await this.createPeerConnection();
    }

    if (this.PeerConnection.signalingState != "stable") {

      /** 
       * @note Set the local and remove descriptions for rollback;
       * don't proceed until both return.
       */
      await Promise.all([
        this.PeerConnection.setLocalDescription({ type: "rollback" }),
        this.PeerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(message.sdp)))
      ]);
      return;
    } else {
      await this.PeerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(message.sdp)));
    }

    await this.PeerConnection.setLocalDescription(await this.PeerConnection.createAnswer());

    /** @note send data using sockets */
    this.socket.emit('accepted-invite', {
      by: this.userId.toString(),
      for: this.requestedWPUser?.toString(),
      sdp: JSON.stringify(this.PeerConnection.localDescription)
    });

    /** @note After setting the local description, check if there are ICE candidates in the queue. */
    this.sendQueuedICECandidates();
  }

  async connectRealTime() {
    console.log('*o* method::connectRealTime() *o*')
    await this.registerSocketListeners();
    await this.socket.connect();
  }

  disconnectRealTime() {
    console.log('*o* method::disconnectRealTime() *o*')
    this.socket.disconnect();
  }

  /**
   *  
   * @note WebRTC methods.
   *  
   */
  async requestScreencast(wpUserId: string | number) {
    try {

      this.requestedWPUser = wpUserId;

      if (!this.PeerConnection) {
        await this.createPeerConnection();
        console.log('creating peer connection', this.PeerConnection);
      }

      const offer = await this.PeerConnection.createOffer();
      if (this.PeerConnection.signalingState != "stable") {
        this.CloseScreencast();
        return;
      }

      await this.PeerConnection.setLocalDescription(offer);

      const streams = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true
      });

      streams.getTracks().forEach(async (track) => {
        this.PeerConnection.addTrack(track, streams);
      });

      this.socket.emit('request-screencast', {
        by: this.userId.toString(),
        for: wpUserId.toString(),
        sdp: JSON.stringify(this.PeerConnection.localDescription)
      }, (ack) => {
        alert('user not online');
      });
    }
    catch (error) {
      console.error('screencast_error', error);
    }
  }

  /** 
   * @note Creating a WebRTC peer connection and registering all required and
   * some extra events for WebRTC peer monitoring.
   */
  async createPeerConnection() {
    // console.log('ICE_CONFIG', this.RTCICEConfig);
    this.PeerConnection = new RTCPeerConnection(this.RTCICEConfig);

    this.PeerConnection.onicecandidate = (event) => this.onCreateNewICECandidateEvent(event);
    this.PeerConnection.oniceconnectionstatechange = (event) => this.handleICEConnectionStateChangeEvent(event);
    this.PeerConnection.onicegatheringstatechange = (event) => this.handleICEGatheringStateChangeEvent(event);
    this.PeerConnection.onsignalingstatechange = (event) => this.handleSignalingStateChangeEvent(event);
    this.PeerConnection.ontrack = (event) => this.handleTrackEvent(event);
    this.PeerConnection.onnegotiationneeded = (event) => this.handleNegotiationNeededEvent(event);
    this.PeerConnection.onconnectionstatechange = (event) => this.handleConnectionStateChangeEvent(event);
  }

  /**
   * @note Handles |icecandidate| events by forwarding the specified
   * ICE Candidate (created by our local ICE agent) to the other
   * peer through the signaling server.
   */
  async onCreateNewICECandidateEvent(event: RTCPeerConnectionIceEvent) { /** @note WebRTC peer connection event */
    /** 
     * @note managing a queue until remote description is set
     * to prevent ICE Candidates from failure.
     */
    if (event.candidate) {
      if (!this.PeerConnection.remoteDescription) {
        this.IceCandidateQueue.push(event.candidate);
      } else {
        this.sendIceCandidateToPeer(event.candidate);
      }
    }
  }

  /** 
   * @note Handle |iceconnectionstatechange| events. This will detect
   * when the ICE connection is closed, failed, or disconnected.
   *
   * This is called when the state of the ICE agent changes.
   */
  handleICEConnectionStateChangeEvent(event: any) {
    // console.log("*o* ICE connection state changed to " + this.PeerConnection.iceConnectionState);
    console.log("*o* ICE connection state changed to " + event);

    switch (this.PeerConnection.iceConnectionState) {
      case "closed":
      case "failed":
      case "disconnected":
        console.log('*o* ICE candidate call failed');
        this.CloseScreencast();
        break;
    }
  }

  /**
   *  @note I used it to monitor and learn about different states during ICE candidacy exchange
   *  and different states a connection goes through on both ends. 
   */
  handleICEGatheringStateChangeEvent(event: any) {
    // console.log("*o* ICE gathering state changed to: " + this.PeerConnection.iceGatheringState);
    console.log("*o* ICE gathering state changed to: ", event);
  }

  /**
   * @note Set up a |signalingstatechange| event handler. This will detect when
   * the signaling connection is closed.
   * 
   * This will actually move to the new RTCPeerConnectionState enum
   * returned in the property RTCPeerConnection.connectionState when
   * browsers catch up with the latest version of the specification!
   */
  handleSignalingStateChangeEvent(event: any) {
    console.log("*o* WebRTC signaling state changed to: ", event);
    switch (event) {
      case "closed":
        this.CloseScreencast();
        console.log('*o* ICE candidate call closed');
        break;
    }
  }

  /** 
   * @note Handle different tracks added by remote peer.
   * I use it to transfer remote stream to my video element in angular index.html
   */
  async handleTrackEvent(event: any) {
    console.log('remote streams', event.streams);
    this.remoteStream.emit(event.streams[0]);
  }

  /**
   * @note Handle PeerConnection negotiation event.
   * Used to finalise protocols for peer connections for sending data.
   */
  async handleNegotiationNeededEvent(event: any) {
    // console.log("Negotiation needed");

    try {
      if (!this.requestedWPUser) return;

      const offer = await this.PeerConnection.createOffer();

      /** 
       * @note If the connection hasn't yet achieved the "stable" state,
       * return to the caller. Another negotiationneeded event
       * will be fired when the state stabilizes.
       */

      if (this.PeerConnection.signalingState != "stable") {
        console.log("The connection isn't stable yet; postponing...")
        return;
      }

      /** @note Establish the offer as the local peer's current description. */
      // console.log("Setting local description to the offer");
      await this.PeerConnection.setLocalDescription(offer);

      /** @note Send the offer to the remote peer. */
      // console.log("Sending the offer to the remote peer");
      /** @fixme add ids 'for' and 'by' */
      this.socket.emit('negotiation', {
        by: this.userId.toString(),
        for: this.requestedWPUser.toString(),
        sdp: JSON.stringify(this.PeerConnection.localDescription)
      });

    } catch (err) {
      console.error("The following error occurred while handling the negotiationneeded event:", err);
    };
  }

  /**
   * @note Can check current and different connection states
   * for a peer connection (here PeerConnection).
   */
  async handleConnectionStateChangeEvent(event: any) {
    if (this.PeerConnection.connectionState === 'connected') {
      // Peers connected!
      console.info('Peers connected');
    }
  }

  /**
   * @note Sends all the ICE Candidates from the queue
   * when remote description is set. 
   */
  sendQueuedICECandidates() {
    if (this.PeerConnection.remoteDescription) {
      while (this.IceCandidateQueue.length > 0) {
        const candidate = this.IceCandidateQueue.shift();
        this.sendIceCandidateToPeer(candidate);
      }
    }
  }

  /**
   * @note Sends individual candidates over socket to the connected Peer.
   */
  sendIceCandidateToPeer(candidate: RTCIceCandidate) { /** @note Type any since it's webrtc peer candidate. Will set up interface type later. */
    this.socket.emit('new-ice-candidate', {
      by: this.userId.toString(),
      for: this.requestedWPUser?.toString(),
      candidate: JSON.stringify(candidate)
    });
  }

  /**
   * @note Safely unload peer connection and stop it's streams.
   * Use it to hangup calls normally or in errored states.
   */
  async CloseScreencast(peerRequest: boolean = false) {
    console.log('screencast_closed');
    if (this.PeerConnection) {
      
      /** @note flag to determine whether the peer's socket call has triggered the conn close or not. */
      if(!peerRequest) {
        this.socket.emit('disconnect-call', {for: this.requestedWPUser, by: this.userId});
      }
      this.requestedWPUser = null;

      /** 
       * @note Disconnect all our event listeners; we don't want stray events
       * to interfere with the hangup while it's ongoing.
       */
      this.PeerConnection.ontrack = null;
      this.PeerConnection.onicecandidate = null;
      this.PeerConnection.oniceconnectionstatechange = null;
      this.PeerConnection.onsignalingstatechange = null;
      this.PeerConnection.onicegatheringstatechange = null;
      this.PeerConnection.onnegotiationneeded = null;

      /** @note Stop all transceivers on the connection */
      this.PeerConnection.getTransceivers().forEach((transceiver: any) => {
        transceiver.stop();
      });

      this.remoteStream.unsubscribe();

      /** @note Close the peer connection */
      this.PeerConnection.close();
      this.PeerConnection = null;
    }
  }

  ngOnDestroy() {
    console.log('*o* service:Destroyed *o*')
    this.disconnectRealTime();
  }
}