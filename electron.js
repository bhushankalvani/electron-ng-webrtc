const {app, BrowserWindow, screen, desktopCapturer, ipcMain} = require('electron');  
const url = require('url');
const path = require('path');

let AppWindow;
let ScreenSize = { width: 0, height: 0};

// Socket.io
const { io } = require("socket.io-client");
const socket = io('http://localhost:3000',
	{
		// path: '/io'
		transports: ['polling', 'websocket'],
	});

const id = 2; /** @note Static user id to request and respond to screencast requests */


function onReady () {
	console.log('electron app ready');

	const primaryDisplay = screen.getPrimaryDisplay();
	ScreenSize = primaryDisplay.workAreaSize;
	console.log(path.join(__dirname,'dist/index.html'));

	AppWindow = new BrowserWindow({
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

	setupSocketConnections();
}

function setupSocketConnections() {
	socket.on('connect', SocketConnect);
	
	socket.on('request-screencast', ScreencastRequest);
	socket.on('disconnect', SocketDisconnect);
	socket.on('screencast-accepted', ScreencastReqAccepted);

	socket.connect();
}

/**
 * @note Request for screencast for this user from a peer.
 * @param {peerId} - Receives the peer Id requesting a call.
 */
async function ScreencastRequest(peerReq) {
	console.log('screencast request received', peerReq, id);
	AppWindow.webContents.send('REQUEST_RECEIVED', peerReq);
}

async function ScreencastReqAccepted(peerAnswer) {
	/** @fixme do something with peerAnswer to finish connection. */
	/** @fixme @note handle creating new peerConnection for Admin and check if stream received or not. */
	const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
	for (const source of sources) {
		console.log('source', source.name);
		if (source.name === 'Electron' || source.name === 'Entire screen' || source.name === 'Entire Screen') {
			AppWindow.webContents.send('RECORD_SCREEN', source.id, ScreenSize);
			return;
		}
	}
}

function SocketDisconnect() {
	console.log('disconnect fired');
	socket.emit('disconnect', 1);
	socket.disconnect();
}


ipcMain.on('NEW_SCREENCAST_REQ', (event, request) => {
	request.by = id;
	request.for = 1;
	if(id === 2){
		socket.emit('request-screencast-cl', request);
	}
});

ipcMain.on('ACCEPT_INVITE', (event, acceptedInvite) => {
	acceptedInvite['by'] = 1;
	acceptedInvite['for'] = id;
	socket.emit('accepted-invite', acceptedInvite)
});

function SocketConnect() {
	console.log('socket connected');
	socket.emit('register-user', { id }, (res) => {
		console.log('registration response: ', res, ` for id: ${id}`);
		/** @note requesting a screencast for default user with userId 1. */
		if(id === 2) {
			console.log(`user id ${id} requesting screencast for 1`);
			AppWindow.webContents.send('REQUEST_SCREENCAST');
		}
	});
	
}


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