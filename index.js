const WebSocket = require('ws');
const net = require('net');

// Get port from Render (they provide it automatically)
const PORT = process.env.PORT || 8080;

const MC_HOST = '147.135.104.179';
const MC_PORT = 15014;

console.log(`🎮 Starting on port ${PORT}`);
console.log(`📡 Target: ${MC_HOST}:${MC_PORT}`);

// WebSocket server
const wss = new WebSocket.Server({ 
  port: PORT,
  perMessageDeflate: false
});

wss.on('connection', (ws, req) => {
  console.log('🔗 Client connected from:', req.socket.remoteAddress);
  
  // Create TCP connection to your Minecraft server
  const tcpSocket = net.createConnection({
    host: MC_HOST,
    port: MC_PORT
  }, () => {
    console.log('✅ Connected to Minecraft server');
    ws.send(JSON.stringify({ type: 'connected', status: 'success' }));
  });
  
  // Forward WebSocket → TCP
  ws.on('message', (data) => {
    if (tcpSocket.writable) {
      tcpSocket.write(data);
    }
  });
  
  // Forward TCP → WebSocket
  tcpSocket.on('data', (data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  });
  
  // Cleanup
  ws.on('close', () => {
    console.log('❌ WebSocket closed');
    tcpSocket.end();
  });
  
  tcpSocket.on('close', () => {
    console.log('❌ TCP connection closed');
    if (ws.readyState === ws.OPEN) {
      ws.close();
    }
  });
  
  tcpSocket.on('error', (err) => {
    console.log('❌ TCP error:', err.message);
    ws.close();
  });
  
  ws.on('error', (err) => {
    console.log('❌ WebSocket error:', err.message);
    tcpSocket.end();
  });
});

console.log(`✅ WebSocket server running on port ${PORT}`);
console.log(`👉 Eaglercraft should connect to: wss://eaglercraft-proxy-m4kx.onrender.com`);
