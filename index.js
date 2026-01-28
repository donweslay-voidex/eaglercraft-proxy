const WebSocket = require('ws');
const net = require('net');

// YOUR CYBRANCEE SERVER
const MC_HOST = '147.135.104.179';
const MC_PORT = 15014; // Your Minecraft Java port

// WebSocket server
const WS_PORT = 8080;
const wss = new WebSocket.Server({ port: WS_PORT });

console.log(`🎮 Eaglercraft Proxy starting...`);
console.log(`📡 Minecraft: ${MC_HOST}:${MC_PORT}`);
console.log(`🌐 WebSocket: ws://[render-url]:${WS_PORT}`);

// Store active connections
const connections = new Map();

wss.on('connection', (ws, req) => {
  const clientId = Date.now() + Math.random().toString(36).substr(2, 5);
  console.log(`🔗 [${clientId}] Eaglercraft connected from: ${req.socket.remoteAddress}`);
  
  // Create TCP connection to Minecraft server
  const tcpSocket = new net.Socket();
  
  tcpSocket.connect(MC_PORT, MC_HOST, () => {
    console.log(`✅ [${clientId}] Connected to Minecraft server`);
    
    // Send handshake packet (simplified)
    const handshake = Buffer.from([
      0x00, // Packet ID for handshake
      0x05, // Protocol version (1.7.2-1.7.5)
      0x09, 0x2f, 0x31, 0x32, 0x37, 0x2e, 0x30, 0x2e, 0x30, 0x2e, 0x31, // "127.0.0.1"
      0x63, 0xdd, // Port 25565
      0x01 // Next state: 1 (login)
    ]);
    tcpSocket.write(handshake);
    
    // Send login start
    const loginStart = Buffer.from([
      0x00, // Packet ID for login start
      0x09, // Username length
      0x45, 0x61, 0x67, 0x6c, 0x65, 0x72, 0x50, 0x6c, 0x61, 0x79, 0x65, 0x72 // "EaglerPlayer"
    ]);
    tcpSocket.write(loginStart);
    
    // Send to Eaglercraft
    ws.send(JSON.stringify({
      type: 'handshake',
      status: 'connected',
      message: 'Connected to Minecraft server!'
    }));
  });
  
  // Forward WebSocket → TCP (Eaglercraft → Minecraft)
  ws.on('message', (data) => {
    try {
      console.log(`📨 [${clientId}] WS → TCP: ${data.length} bytes`);
      
      if (data instanceof Buffer) {
        tcpSocket.write(data);
      } else {
        // Assume it's Eaglercraft JSON
        const json = JSON.parse(data);
        
        if (json.type === 'chat' && json.message) {
          // Convert chat to Minecraft packet
          const chatMsg = json.message;
          const packet = Buffer.alloc(3 + chatMsg.length);
          packet.writeUInt8(0x01, 0); // Chat packet ID
          packet.writeUInt16BE(chatMsg.length, 1);
          packet.write(chatMsg, 3);
          tcpSocket.write(packet);
        } else if (json.type === 'packet' && json.data) {
          // Raw packet data
          const rawData = Buffer.from(json.data, 'base64');
          tcpSocket.write(rawData);
        }
      }
    } catch (error) {
      console.error(`❌ [${clientId}] WS message error:`, error.message);
    }
  });
  
  // Forward TCP → WebSocket (Minecraft → Eaglercraft)
  tcpSocket.on('data', (data) => {
    try {
      console.log(`📨 [${clientId}] TCP → WS: ${data.length} bytes`);
      
      // Convert to base64 for WebSocket
      const base64Data = data.toString('base64');
      ws.send(JSON.stringify({
        type: 'packet',
        data: base64Data,
        length: data.length
      }));
    } catch (error) {
      console.error(`❌ [${clientId}] TCP data error:`, error.message);
    }
  });
  
  // Handle disconnections
  ws.on('close', () => {
    console.log(`❌ [${clientId}] Eaglercraft disconnected`);
    tcpSocket.end();
    connections.delete(clientId);
  });
  
  ws.on('error', (error) => {
    console.error(`❌ [${clientId}] WebSocket error:`, error.message);
    tcpSocket.end();
  });
  
  tcpSocket.on('close', () => {
    console.log(`❌ [${clientId}] Minecraft connection closed`);
    if (ws.readyState === ws.OPEN) {
      ws.close();
    }
    connections.delete(clientId);
  });
  
  tcpSocket.on('error', (error) => {
    console.error(`❌ [${clientId}] TCP error:`, error.message);
    ws.close();
  });
  
  // Store connection
  connections.set(clientId, { ws, tcpSocket });
  
  // Send initial response to Eaglercraft
  ws.send(JSON.stringify({
    type: 'init',
    version: '1.8.x',
    server: `${MC_HOST}:${MC_PORT}`,
    timestamp: Date.now()
  }));
});

// Cleanup
process.on('SIGINT', () => {
  console.log('🛑 Shutting down...');
  connections.forEach((conn, id) => {
    console.log(`Closing connection ${id}`);
    conn.tcpSocket.end();
    if (conn.ws.readyState === conn.ws.OPEN) {
      conn.ws.close();
    }
  });
  wss.close();
  process.exit(0);
});

console.log(`✅ WebSocket proxy running on port ${WS_PORT}`);
console.log(`🔄 Ready for Eaglercraft connections!`);
