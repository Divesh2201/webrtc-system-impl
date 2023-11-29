let APP_ID = 'd07159579bc24a2e990898826b4b4b5d';

let token = null;
// id from db, uid generator, random number, etc
let uid = String(Math.floor(Math.random() * 1000));

// agora api
let client;
// channel two users actually join
let channel;

let queryString = window.location.search;
let urlParams = new URLSearchParams(queryString);
let roomId = urlParams.get('room');

if (!roomId) {
    window.location = 'lobby.html';
}

// local camera and audio data
let localStream;
// remote user's camera and audio data
let remoteStream;
// core interface storing all info b/w user and remote peer to establish connection
let peerConnection;

const servers = {
    iceServers: [
        {
            urls: [
                'stun:stun1.l.google.com:19302',
                'stun:stun2.l.google.com:19302',
            ],
        },
    ],
};

let constraints = {
    video: {
        width: { min: 640, ideal: 1920, max: 1920 },
        height: { min: 480, ideal: 1080, max: 1080 },
    },
    audio: true,
};

let init = async () => {
    client = await AgoraRTM.createInstance(APP_ID);
    await client.login({ uid, token });

    // index.html?room=5re943g7d
    channel = client.createChannel(roomId);

    // we are joining the channel
    await channel.join();

    // now we need an eventListener for others to join
    // 'MemberJoined' is an eventListener in the agora docs
    channel.on('MemberJoined', handleUserJoined);
    channel.on('MemberLeft', handleUserLeft);

    client.on('MessageFromPeer', handleMessageFromPeer);
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    // the .srcObject is a property of HTMLMediaElement interface
    // to which the <video> tag belongs
    // here we are setting the <video> element (user-1) to localStream
    document.getElementById('user-1').srcObject = localStream;
};

let handleUserLeft = (MemberId) => {
    document.getElementById('user-2').style.display = 'none';
    document.getElementById('user-1').classList.remove('smallFrame');
};

let handleMessageFromPeer = async (message, MemberID) => {
    message = JSON.parse(message.text);
    if (message.type === 'offer') {
        createAnswer(MemberID, message.offer);
    }

    if (message.type === 'answer') {
        addAnswer(message.answer);
    }

    if (message.type === 'candidate') {
        if (peerConnection) {
            peerConnection.addIceCandidate(message.candidate);
        }
    }
};

let handleUserJoined = async (MemberID) => {
    console.log('A new user Joined the channel ', MemberID);
    createOffer(MemberID);
};

let createPeerConnection = async (MemberID) => {
    peerConnection = new RTCPeerConnection(servers);
    remoteStream = new MediaStream();
    document.getElementById('user-2').srcObject = remoteStream;
    document.getElementById('user-2').style.display = 'block';
    document.getElementById('user-1').classList.add('smallFrame');

    // Now, exchanging this data (localStream and remoteStream)

    // ** We are adding local media data (localStream, which we have) to peerConnection object
    // ** Thus sending our tracks to remote using the peerConnection object (webRTC API)
    localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
    });

    // this is an eventListener
    // ** We are adding remote media data (which we DONT have) from peerConnection to remoteStream
    // ** Thus receiving tracks from remote using the peerConnection object (webRTC API)
    peerConnection.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
            remoteStream.addTrack(track);
        });
    };
    peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
            client.sendMessageToPeer(
                {
                    text: JSON.stringify({
                        type: 'candidate',
                        candidate: event.candidate,
                    }),
                },
                MemberID
            );
        }
    };
};

let createOffer = async (MemberID) => {
    await createPeerConnection(MemberID);
    let offer = await peerConnection.createOffer();

    // this setLocalDescription is going to make a series of requests to the STUN server
    // and start creating ICE candidates
    // TRIGGER: .onicecandidate event listener
    // ** It sends the offer
    await peerConnection.setLocalDescription(offer);
    // ** After this, ICE trickling begins

    client.sendMessageToPeer(
        { text: JSON.stringify({ type: 'offer', offer: offer }) },
        MemberID
    );
};

let createAnswer = async (MemberID, offer) => {
    await createPeerConnection(MemberID);
    await peerConnection.setRemoteDescription(offer);

    let answer = await peerConnection.createAnswer();
    // ** It sends the answer
    await peerConnection.setLocalDescription(answer);

    client.sendMessageToPeer(
        { text: JSON.stringify({ type: 'answer', answer: answer }) },
        MemberID
    );
};

let addAnswer = async (answer) => {
    if (!peerConnection.currentRemoteDescription) {
        peerConnection.setRemoteDescription(answer);
    }
};

let leaveChannel = async () => {
    await channel.leave();
    await channel.logout();
};

let toggleCamera = async () => {
    let videoTrack = localStream
        .getTracks()
        .find((track) => track.kind === 'video');
    if (videoTrack.enabled) {
        videoTrack.enabled = false;
        document.getElementById('camera-btn').style.backgroundColor =
            'rgb(255, 80, 80)';
    } else {
        videoTrack.enabled = true;
        document.getElementById('camera-btn').style.backgroundColor =
            'rgb(179, 102, 249, .9)';
    }
};

let toggleMic = async () => {
    let audioTrack = localStream
        .getTracks()
        .find((track) => track.kind === 'audio');

    if (audioTrack.enabled) {
        audioTrack.enabled = false;
        document.getElementById('mic-btn').style.backgroundColor =
            'rgb(255, 80, 80)';
    } else {
        audioTrack.enabled = true;
        document.getElementById('mic-btn').style.backgroundColor =
            'rgb(179, 102, 249, .9)';
    }
};

window.addEventListener('beforeunload', leaveChannel);

document.getElementById('camera-btn').addEventListener('click', toggleCamera);
document.getElementById('mic-btn').addEventListener('click', toggleMic);

// will set things up
init();
