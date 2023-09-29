const { app, BrowserWindow, screen, desktopCapturer, ipcMain } = require('electron');
const url = require('url');
const path = require('path');

let AppWindow;
let ScreenSize;

// Socket.io
const { io } = require("socket.io-client");
const socket = io(
	// 'http://localhost:3000',
	'https://p2p-server.raoinfo.tech',
	{
		// path: '/io'
		transports: ['websocket', 'polling'],
	}
);

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
const id = 2; /** @note Static user id to request and respond to screencast requests */
console.log('device UUID v4', id);


function onReady() {
	console.log('electron app ready for id ', id);

	const primaryDisplay = screen.getPrimaryDisplay();
	ScreenSize = primaryDisplay.workAreaSize;
	console.log(path.join(__dirname, 'dist/index.html'));

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
	socket.on('request-screencast', ScreencastRequest);
	socket.on('disconnect', SocketDisconnect);
	socket.on('screencast-accepted', ScreencastReqAccepted);
	socket.on('ice-candidate-received', HandleIceCandidateReceiveEvent);

	socket.connect();
}

function SocketConnect() {
	console.log('socket connected');
	socket.emit('register-user', { id }, async (res) => {
		console.log('registration response: ', res, ` for id: ${id}`);
		/** @note requesting a screencast for default user with userId 1. */
		if (id === 2) {
			console.log(`user id ${id} requesting screencast for 1`);
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
	console.log('screencast request received', peerReq, id);
	const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
	for (const source of sources) {
		if (source.name === 'Entire screen') {
			AppWindow.webContents.send('REQUEST_RECEIVED', peerReq, source.id, ScreenSize);
			return;
		}
	}
	// AppWindow.webContents.send('REQUEST_RECEIVED', peerReq);
}

async function ScreencastReqAccepted(peerAnswer) {
	/** @fixme do something with peerAnswer to finish connection. */
	/** @fixme @note handle creating new peerConnection for Admin and check if stream received or not. */
	console.log('screencast request accepted');
	const sources = await desktopCapturer.getSources({ types: ['screen'] });
	// for (const source of sources) {
	// 	if (source.name === 'Entire screen') {
	// 		AppWindow.webContents.send('SHARE_SCREEN', source.id, ScreenSize, peerAnswer);
	// 		return;
	// 	}
	// }
	AppWindow.webContents.send('SHARE_SCREEN', peerAnswer);
}

function HandleIceCandidateReceiveEvent(request) {
	AppWindow.webContents.send('NEW_ICE_CANDIDATE', request);
}

function SocketDisconnect() {
	console.log('disconnect fired');
	socket.emit('disconnect', 1);
	socket.disconnect();
}

/** @note Event handlers for requests from ipcRenderer to main thread. */

ipcMain.on('NEW_SCREENCAST_REQ', (event, request) => {
	if (id === 2) {
		request['by'] = 2;
		request['for'] = 1;
		socket.emit('request-screencast-cl', request);
	}
});

ipcMain.on('NEGOTIATION', (event, request) => {
	if (id === 2) {
		request['by'] = 2;
		request['for'] = 1;
	} else {
		request['by'] = 1;
		request['for'] = 2;
	}
	socket.emit('request-screencast-cl', request);
});

ipcMain.on('ACCEPT_INVITE', (event, acceptedInvite) => {
	acceptedInvite['by'] = 1;
	acceptedInvite['for'] = 2;
	socket.emit('accepted-invite', acceptedInvite);
});

ipcMain.on('ICE_CANDIDATE', (event, request) => {
	if (id === 1) { // @note: Just for test. Use real user ids for 'by' and 'for' fields when implementing.
		request['by'] = 1;
		request['for'] = 2;
	} else {
		request['by'] = 2;
		request['for'] = 1;
	}
	socket.emit('new-ice-candidate', request);
});

app.on('ready', onReady);

// async function captureConnectionAndDeviceScreen(socket) {
// 	console.log('method::captureConnectionAndDeviceScreen');
// 	const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
// 	for (const source of sources) {
// 		console.log('source', source.name);
// 		if (source.name === 'Electron' || source.name === 'webrtc-electron-ng') {
// 			AppWindow.webContents.send('RECORD_SCREEN', source.id, socket);
// 			return;
// 		}
// 	}
// }