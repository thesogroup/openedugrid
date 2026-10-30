/**
 * OpenEduGrid WebSocket Signaling Hub
 * Developed by THE S.O. GROUP
 * Facilitates automatic WebRTC peer discovery across campus networks.
 */

const { WebSocketServer } = require('ws');
const PORT = process.env.SIGNAL_PORT || 8080;

const wss = new WebSocketServer({ port: PORT });
const activeNodes = new Map(); // Stores nodeId -> ws connection

console.log(`[OpenEduGrid Signal] Server starting on ws://localhost:${PORT}...`);

wss.on('connection', (ws) => {
  let registeredNodeId = null;

  ws.on('message', (message) => {
    try {
      const packet = JSON.parse(message);

      switch (packet.type) {
        case 'REGISTER_NODE':
          registeredNodeId = packet.nodeId;
          activeNodes.set(registeredNodeId, ws);
          console.log(`[Signal Hub] Registered node: ${registeredNodeId} (Total Nodes: ${activeNodes.size})`);
          
          // Notify newly joined node about existing mesh peers
          const peerList = Array.from(activeNodes.keys()).filter(id => id !== registeredNodeId);
          ws.send(JSON.stringify({ type: 'PEER_LIST', peers: peerList }));
          break;

        case 'RTC_SIGNAL':
          // Relay SDP Offers, Answers, and ICE candidates directly to target node
          const targetWs = activeNodes.get(packet.targetPeerId);
          if (targetWs && targetWs.readyState === 1) {
            targetWs.send(JSON.stringify({
              type: 'RTC_SIGNAL',
              senderId: registeredNodeId,
              signalData: packet.signalData
            }));
          }
          break;
      }
    } catch (err) {
      console.error('[Signal Hub] Message processing error:', err);
    }
  });

  ws.on('close', () => {
    if (registeredNodeId) {
      activeNodes.delete(registeredNodeId);
      console.log(`[Signal Hub] Node disconnected: ${registeredNodeId}`);
    }
  });
});

console.log(`[OpenEduGrid Signal] Active and listening for P2P mesh candidates.`);