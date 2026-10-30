/**
 * OpenEduGrid WebRTC P2P Mesh Engine with Automated Signaling
 * Developed by THE S.O. GROUP
 * Author: Onovroke Goodnews Ovie
 */

export class OpenedugridP2P {
  constructor(nodeId, storageEngine, signalUrl = 'ws://localhost:8080') {
    this.nodeId = nodeId || `node_${Math.random().toString(36).substr(2, 6)}`;
    this.storage = storageEngine;
    this.signalUrl = signalUrl;
    this.ws = null;
    this.peers = new Map();    // RTCPeerConnection instances
    this.channels = new Map(); // RTCDataChannel instances

    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    this._connectSignalingServer();
  }

  /**
   * Connect to WebSocket Signaling Hub for Automatic Peer Discovery
   */
  _connectSignalingServer() {
    this.ws = new WebSocket(this.signalUrl);

    this.ws.onopen = () => {
      console.log(`[P2P Signal] Connected to hub. Registering node ID: ${this.nodeId}`);
      this.ws.send(JSON.stringify({
        type: 'REGISTER_NODE',
        nodeId: this.nodeId
      }));
    };

    this.ws.onmessage = async (event) => {
      try {
        const packet = JSON.parse(event.data);

        switch (packet.type) {
          case 'PEER_LIST':
            // Automatically initiate P2P offer to all existing peers in room
            for (const targetPeerId of packet.peers) {
              await this._initiatePeerConnection(targetPeerId);
            }
            break;

          case 'RTC_SIGNAL':
            await this._handleIncomingSignal(packet.senderId, packet.signalData);
            break;
        }
      } catch (err) {
        console.error('[P2P Signal] Error processing message:', err);
      }
    };

    this.ws.onerror = (err) => {
      console.warn('[P2P Signal] WebSocket error. Operating in offline local storage mode.');
    };
  }

  /**
   * Initiate WebRTC handshake with target peer
   */
  async _initiatePeerConnection(targetPeerId) {
    if (this.peers.has(targetPeerId)) return;

    const pc = new RTCPeerConnection(this.rtcConfig);
    this.peers.set(targetPeerId, pc);

    const dataChannel = pc.createDataChannel('openedugrid-mesh-channel');
    this._setupDataChannel(targetPeerId, dataChannel);
    this._setupICEHandling(targetPeerId, pc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this._sendSignal(targetPeerId, { type: 'OFFER', sdp: offer });
  }

  /**
   * Handle incoming Offer, Answer, or ICE candidate signals
   */
  async _handleIncomingSignal(senderId, signal) {
    let pc = this.peers.get(senderId);

    if (signal.type === 'OFFER') {
      pc = new RTCPeerConnection(this.rtcConfig);
      this.peers.set(senderId, pc);

      this._setupICEHandling(senderId, pc);

      pc.ondatachannel = (event) => {
        this._setupDataChannel(senderId, event.channel);
      };

      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this._sendSignal(senderId, { type: 'ANSWER', sdp: answer });

    } else if (signal.type === 'ANSWER') {
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      }
    } else if (signal.type === 'ICE') {
      if (pc && signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    }
  }

  _sendSignal(targetPeerId, signalData) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'RTC_SIGNAL',
        targetPeerId,
        signalData
      }));
    }
  }

  _setupICEHandling(peerId, pc) {
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this._sendSignal(peerId, { type: 'ICE', candidate: event.candidate });
      }
    };
  }

  _setupDataChannel(peerId, channel) {
    this.channels.set(peerId, channel);

    channel.onopen = () => {
      console.log(`[P2P Mesh] Connected directly to Peer Node: ${peerId}`);
    };

    channel.onmessage = async (event) => {
      try {
        const packet = JSON.parse(event.data);
        console.log(`[P2P DataReceived] From ${packet.originNode}:`, packet.payloadType);

        if (packet.payloadType === 'LECTURE_ASSET' && this.storage) {
          await this.storage.cacheAsset(packet.content.key, packet.content.data, 'p2p-mesh');
        }
      } catch (err) {
        console.error('[P2P Data] Parsing error:', err);
      }
    };

    channel.onclose = () => {
      this.channels.delete(peerId);
      this.peers.delete(peerId);
    };
  }

  /**
   * Broadcast data packet across all connected P2P mesh nodes
   */
  broadcastMesh(payloadType, content) {
    const packet = JSON.stringify({
      originNode: this.nodeId,
      payloadType,
      content,
      timestamp: Date.now()
    });

    this.channels.forEach((channel) => {
      if (channel.readyState === 'open') {
        channel.send(packet);
      }
    });
  }
}