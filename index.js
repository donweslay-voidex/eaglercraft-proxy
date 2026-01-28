const WebSocket = require('ws');
const net = require('net');

// Render provides the port automatically
const PORT = process.env.PORT || 10000; // ← USE 10000 NOT 8080

const MC_HOST = '147.135.104.179';
const MC_PORT = 15014;

console.log(`🎮 Starting on Render WebSocket port: ${PORT}`);
console.log(`📡 Target Minecraft: ${MC_HOST}:${MC_PORT}`);

const wss = new WebSocket.Server({ 
  port: PORT,
  perMessageDeflate: false,
  clientTracking: true
});

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`🔗 Eaglercraft connected from: ${clientIp}`);
  
  // Send immediate response
  ws.send(JSON.stringify({
    type: 'handshake',
    status: 'proxy_ready',
    message: 'Eaglercraft proxy connected'
  }));
  
  // THEN try Minecraft connection
  const mcSocket = net.createConnection({
    host: MC_HOST,
    port: MC_PORT
  }, () => {
    console.log(`✅ Connected to Minecraft server`);
    ws.send(JSON.stringify({
      type: 'handshake', 
      status: 'minecraft_connected',
      message: 'Ready to play!'
    }));
  });
  
  // Forward WebSocket ↔ TCP
  ws.on('message', (data) => {
    if (mcSocket.writable) {
      mcSocket.write(data);
      console.log(`📨 WS→MC: ${data.length} bytes`);
    }
  });
  
  mcSocket.on('data', (data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
      console.log(`📨 MC→WS: ${data.length} bytes`);
    }
  });
  
  // Cleanup
  ws.on('close', () => {
    console.log(`❌ Eaglercraft disconnected`);
    mcSocket.end();
  });
  
  mcSocket.on('close', () => {
    console.log(`❌ Minecraft connection closed`);
    if (ws.readyState === ws.OPEN) ws.close();
  });
  
  mcSocket.on('error', (err) => {
    console.log(`❌ Minecraft error: ${err.code}`);
    ws.close();
  });
  
  ws.on('error', (err) => {
    console.log(`❌ WebSocket error: ${err.message}`);
    mcSocket.end();
  });
});

console.log(`✅ Proxy ready!`);
console.log(`👉 Eaglercraft URL: wss://eaglercraft-proxy-m4kx.onrender.com`);
console.log(`👉 Actual port: ${PORT}`);
