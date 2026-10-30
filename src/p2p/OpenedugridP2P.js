/**
 * OpenEduGrid WebRTC P2P Mesh Engine
 * Developed by THE S.O. GROUP
 * Author: Onovroke Goodnews Ovie
 * 
 * Manages zero-bandwidth peer discovery, RTC DataChannels, and binary/JSON payload mesh relaying.
 */

export class OpenedugridP2P {
  constructor(nodeId, storageEngine) {
    this.nodeId = nodeId || `node_${Math.random().toString(36).substr(2, 9)}`;
    this.storage = storageEngine;
    this.peers = new Map(); // Stores active RTCPeerConnection instances
    this.channels = new Map(); // Stores active RTCDataChannel instances
    this.onPeerConnected = null;
    this.onDataReceived = null;

    // Standard public STUN configuration (Can be swapped with enterprise TURN)
    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
  }

  /**
   * Create an WebRTC Peer Connection Offer (Initiator Node)
   */
  async createOffer(targetPeerId) {
    const pc = new RTCPeerConnection(this.rtcConfig);
    this.peers.set(targetPeerId, pc);

    const dataChannel = pc.createDataChannel('openedugrid-mesh-channel');
    this._setupDataChannel(targetPeerId, dataChannel);

    this._setupICEHandling(targetPeerId, pc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    return {
      senderId: this.nodeId,
      targetPeerId,
      sdp: offer
    };
  }

  /**
   * Receive an Offer and create an Answer (Receiver Node)
   */
  async handleOffer(offerSignal) {
    const { senderId, sdp } = offerSignal;
    const pc = new RTCPeerConnection(this.rtcConfig);
    this.peers.set(senderId, pc);

    this._setupICEHandling(senderId, pc);

    pc.ondatachannel = (event) => {
      this._setupDataChannel(senderId, event.channel);
    };

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    return {
      senderId: this.nodeId,
      targetPeerId: senderId,
      sdp: answer
    };
  }

  /**
   * Handle Answer from Receiver Node
   */
  async handleAnswer(answerSignal) {
    const { senderId, sdp } = answerSignal;
    const pc = this.peers.get(senderId);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log(`[OpenEduGrid P2P] Established WebRTC link with peer: ${senderId}`);
    }
  }

  /**
   * Add ICE Candidate received from Signaling Server / QR Code / Local Broadcast
   */
  async handleICECandidate(candidateSignal) {
    const { senderId, candidate } = candidateSignal;
    const pc = this.peers.get(senderId);
    if (pc && candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  /**
   * Broadcast data packet to ALL connected peers in local mesh
   */
  broadcastMesh(payloadType, content) {
    const packet = JSON.stringify({
      originNode: this.nodeId,
      payloadType, // e.g., 'LECTURE_SLIDE', 'ASSIGNMENT_PACK', 'SYNC_INDEX'
      content,
      timestamp: Date.now()
    });

    let activeCount = 0;
    this.channels.forEach((channel, peerId) => {
      if (channel.readyState === 'open') {
        channel.send(packet);
        activeCount++;
      }
    });

    console.log(`[OpenEduGrid P2P] Broadcasted payload [${payloadType}] to ${activeCount} active peer nodes.`);
  }

  /**
   * Setup Event Listeners on RTC Data Channel
   */
  _setupDataChannel(peerId, channel) {
    this.channels.set(peerId, channel);

    channel.onopen = () => {
      console.log(`[OpenEduGrid P2P DataChannel] Channel OPEN with peer ${peerId}`);
      if (this.onPeerConnected) this.onPeerConnected(peerId);

      // Offer peer our cached index so they can pull missing materials
      this._sendSyncManifest(channel);
    };

    channel.onmessage = async (event) => {
      try {
        const packet = JSON.parse(event.data);
        console.log(`[OpenEduGrid P2P DataReceived] From ${packet.originNode}:`, packet.payloadType);

        // Handle Automatic Storage Sync upon mesh request
        if (packet.payloadType === 'SYNC_MANIFEST_REQUEST') {
          await this._handleManifestRequest(channel, packet.content);
        } else if (packet.payloadType === 'LECTURE_ASSET') {
          // Store peer-provided material locally into IndexedDB
          if (this.storage) {
            await this.storage.cacheAsset(packet.content.key, packet.content.data, 'p2p-replicated');
          }
        }

        if (this.onDataReceived) {
          this.onDataReceived(packet);
        }
      } catch (err) {
        console.error('[OpenEduGrid P2P] Data Parsing Error:', err);
      }
    };

    channel.onclose = () => {
      console.log(`[OpenEduGrid P2P DataChannel] Closed link with peer ${peerId}`);
      this.channels.delete(peerId);
      this.peers.delete(peerId);
    };
  }

  _setupICEHandling(peerId, pc) {
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // Emit ICE Candidate through signaling mechanism
        console.log(`[OpenEduGrid P2P ICE] Generated candidate for ${peerId}`);
      }
    };
  }

  _sendSyncManifest(channel) {
    channel.send(JSON.stringify({
      originNode: this.nodeId,
      payloadType: 'SYNC_MANIFEST_REQUEST',
      content: { reqType: 'INDEX_QUERY' },
      timestamp: Date.now()
    }));
  }

  async _handleManifestRequest(channel, query) {
    // Send list of cached keys to peer so they can request missing assets
    channel.send(JSON.stringify({
      originNode: this.nodeId,
      payloadType: 'SYNC_MANIFEST_RESPONSE',
      content: { message: 'Mesh node ready for asset exchange.' },
      timestamp: Date.now()
    }));
  }
}
