const { app, BrowserWindow, screen, desktopCapturer, ipcMain } = require('electron');
const url = require('url');
const path = require('path');

let AppWindow;
let ScreenSize;

// Socket.io
const { io } = require("socket.io-client");
const socket = io(
	'http://localhost:3000',
	{
		transports: ['websocket', 'polling'],
	}
);

/** @fixme Enable UUIDv4 implementation. */
// Get the UUID v4 for each connection.
// function uuidv4() {
//     return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
//     .replace(/[xy]/g, function (c) {
//         const r = Math.random() * 16 | 0, 
//             v = c == 'x' ? r : (r & 0x3 | 0x8);
//         return v.toString(16);
//     });
// }

/** @fixme UUID v4 implementation pending for conditionals below */
// const id = uuidv4();
const id = "1"; /** @note Static user id to request and respond to screencast requests */

function onReady() {
	console.log('device UUID v4', id);
	const primaryDisplay = screen.getPrimaryDisplay();
	ScreenSize = primaryDisplay.workAreaSize;

	AppWindow = new BrowserWindow({
		// titleBarStyle: id === 1 ? 'hidden' : 'default',
		width: ScreenSize.width,
		height: ScreenSize.height,
		devTools: true,
		nodeIntegration: true,
		webPreferences: {
			preload: path.join(app.getAppPath(), 'ipcRenderer-1.js'),
			nodeIntegration: true,
			devTools: true,
		}
	});

	AppWindow.loadURL(
		url.format({
			pathname: path.join(
				__dirname,
				'dist/index.html'),
			protocol: 'file:',
			slashes: true
		})
	);

	AppWindow.setTitle(`Candidate #${id}`)

	setupSocketConnections();
}

function setupSocketConnections() {
	socket.on('connect', SocketConnect);
	socket.on('requesting-screencast', ScreencastRequest);
	socket.on('disconnect', SocketDisconnect);
	socket.on('screencast-accepted', ScreencastReqAccepted);
	socket.on('ice-candidate-received', HandleIceCandidateReceiveEvent);
	socket.on('negotiation-request', NegotiationRequestReceived);
	socket.on('disconnect-call', DisconnectCall);

	socket.connect();
}

async function NegotiationRequestReceived(peerReq) {
	AppWindow.webContents.send('NEGOTIATION_REQUEST_RECEIVED', peerReq);	
}

function SocketConnect() {
	// console.log('socket connected');
	socket.emit('register-user', { id }, async (res) => {
		/** @note requesting a screencast for default user with userId 1. */
		/** @fixme Use UUIDv4 implementation and make it a dynamic implementation. */
		if (id === 2) {
			// console.log(`user id ${id} requesting screencast for 1`);
			const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
			for (const source of sources) {
				if (source.name === 'Entire screen') {
					AppWindow.webContents.send('REQUEST_SCREENCAST', source.id, ScreenSize);
					return;
				}
			}
		}
	});

}

/**
 * @note Request for screencast for this user from a peer.
 * @param {peerId} - Receives the peer Id requesting a call.
 */
async function ScreencastRequest(peerReq) {
	// console.log('screencast request received', peerReq, id);
	const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
	for (const source of sources) {
		if (source.name === 'Entire screen') {
			AppWindow.webContents.send('REQUEST_RECEIVED', peerReq, source.id, ScreenSize);
			return;
		}
	}
}

async function ScreencastReqAccepted(peerAnswer) {
	// console.log('screencast request accepted');
	const sources = await desktopCapturer.getSources({ types: ['screen'] });
	AppWindow.webContents.send('SHARE_SCREEN', peerAnswer);
}

function HandleIceCandidateReceiveEvent(request) {
	AppWindow.webContents.send('NEW_ICE_CANDIDATE', request);
}

async function DisconnectCall(request) {
	AppWindow.webContents.send('DISCONNECT_CALL', request);	
}

function SocketDisconnect() {
	// console.log('disconnect fired');
	socket.emit('disconnect-call', 1);
	socket.disconnect();
}

/** @note Event handlers for requests from ipcRenderer to main thread. */
/** @fixme Use UUIDv4 implementation and make it a dynamic implementation. */
ipcMain.on('NEW_SCREENCAST_REQ', (event, request) => {
	if (id === 2) {
		request['by'] = 2;
		request['for'] = 1;
		socket.emit('request-screencast', request);
	}
});

/** @fixme Use UUIDv4 implementation and make it a dynamic implementation. */
ipcMain.on('NEGOTIATION', (event, request) => {
	socket.emit('negotiation', request);
});

/** @fixme Use UUIDv4 implementation and make it a dynamic implementation. */
ipcMain.on('ACCEPT_INVITE', (event, acceptedInvite) => {
	socket.emit('accepted-invite', acceptedInvite);
});

/** @fixme Use UUIDv4 implementation and make it a dynamic implementation. */
ipcMain.on('ICE_CANDIDATE', (event, request) => {
	socket.emit('new-ice-candidate', request);
});


app.on('ready', onReady);