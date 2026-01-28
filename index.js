const WebSocket = require('ws');
const net = require('net');

const PORT = process.env.PORT || 10000;
const MC_HOST = '147.135.104.179';
const MC_PORT = 15014;

console.log(`🎮 Eaglercraft Proxy on port ${PORT}`);
console.log(`📡 Target: ${MC_HOST}:${MC_PORT}`);

const wss = new WebSocket.Server({ 
  port: PORT,
  perMessageDeflate: false
});

// Packet analyzer
function analyzePacket(data) {
  const buf = Buffer.from(data);
  
  console.log('\n=== PACKET ANALYSIS ===');
  console.log(`Length: ${buf.length} bytes`);
  console.log(`Hex: ${buf.toString('hex')}`);
  
  if (buf.length > 0) {
    const packetId = buf[0];
    console.log(`Packet ID: 0x${packetId.toString(16)} (${packetId})`);
    
    if (packetId === 0x00 && buf.length >= 3) {
      // Handshake packet
      const protocolVersion = buf.readInt16BE(1);
      console.log(`Protocol Version: ${protocolVersion}`);
      console.log(`Minecraft Version: ${getVersionFromProtocol(protocolVersion)}`);
      
      // Read server address
      let offset = 3;
      const addrLength = buf.readInt16BE(offset);
      offset += 2;
      const serverAddr = buf.toString('utf8', offset, offset + addrLength);
      offset += addrLength;
      const serverPort = buf.readInt16BE(offset);
      offset += 2;
      const nextState = buf.readInt8(offset);
      
      console.log(`Server Address: ${serverAddr}`);
      console.log(`Server Port: ${serverPort}`);
      console.log(`Next State: ${nextState} (1=login, 2=status)`);
      
      // Try to fix protocol version if wrong
      if (protocolVersion < 47) { // Older than 1.8
        console.log(`⚠️ Protocol ${protocolVersion} too old, translating to 47 (1.8)...`);
        const fixedBuf = Buffer.alloc(buf.length);
        buf.copy(fixedBuf);
        fixedBuf.writeInt16BE(47, 1); // Force 1.8 protocol
        return { original: buf, fixed: fixedBuf, needsFix: true };
      }
    }
  }
  
  return { original: buf, fixed: buf, needsFix: false };
}

function getVersionFromProtocol(protocol) {
  const versions = {
    47: '1.8-1.8.9',
    107: '1.9',
    108: '1.9.1',
    109: '1.9.2',
    110: '1.9.4',
    210: '1.10-1.10.2',
    315: '1.11',
    316: '1.11.1-1.11.2',
    335: '1.12',
    338: '1.12.1',
    340: '1.12.2',
    393: '1.13',
    401: '1.13.1',
    404: '1.13.2',
    477: '1.14',
    480: '1.14.1',
    485: '1.14.2',
    490: '1.14.3',
    498: '1.14.4',
    573: '1.15',
    575: '1.15.1',
    578: '1.15.2',
    735: '1.16',
    736: '1.16.1',
    751: '1.16.2',
    753: '1.16.3',
    754: '1.16.4-1.16.5',
    755: '1.17',
    756: '1.17.1',
    757: '1.18-1.18.1',
    758: '1.18.2',
    759: '1.19',
    760: '1.19.1-1.19.2',
    761: '1.19.3',
    762: '1.19.4',
    763: '1.20-1.20.1',
    764: '1.20.2',
    765: '1.20.3-1.20.4',
    766: '1.20.5-1.20.6',
    767: '1.21',
    768: '1.21.1',
    769: '1.21.2',
    770: '1.21.3'
  };
  
  return versions[protocol] || `Unknown (${protocol})`;
}

wss.on('connection', (ws, req) => {
  const clientId = Date.now().toString(36);
  console.log(`\n🔗 [${clientId}] Connected from: ${req.socket.remoteAddress}`);
  
  let mcSocket = null;
  let reconnectAttempts = 0;
  
  function connectToMinecraft() {
    mcSocket = net.createConnection({
      host: MC_HOST,
      port: MC_PORT
    }, () => {
      console.log(`✅ [${clientId}] Connected to Minecraft`);
      reconnectAttempts = 0;
      
      // Send success to Eaglercraft
      ws.send(JSON.stringify({
        type: 'status',
        status: 'minecraft_connected',
        clientId: clientId
      }));
    });
    
    // Forward WebSocket → Minecraft (WITH TRANSLATION)
    ws.on('message', (data) => {
      console.log(`\n📨 [${clientId}] WS→MC: ${data.length} bytes`);
      
      const analysis = analyzePacket(data);
      
      if (analysis.needsFix) {
        console.log(`🔧 [${clientId}] Fixed protocol version`);
        if (mcSocket && mcSocket.writable) {
          mcSocket.write(analysis.fixed);
        }
      } else if (mcSocket && mcSocket.writable) {
        mcSocket.write(data);
      }
    });
    
    // Forward Minecraft → WebSocket
    mcSocket.on('data', (data) => {
      console.log(`📨 [${clientId}] MC→WS: ${data.length} bytes`);
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    });
    
    // Error handling
    mcSocket.on('error', (err) => {
      console.log(`❌ [${clientId}] Minecraft error: ${err.code}`);
      
      if (err.code === 'ECONNREFUSED') {
        console.log(`❌ [${clientId}] Server refused connection`);
        ws.send(JSON.stringify({
          type: 'error',
          code: 'SERVER_OFFLINE',
          message: 'Minecraft server offline'
        }));
      }
    });
    
    mcSocket.on('close', (hadError) => {
      console.log(`❌ [${clientId}] Minecraft disconnected${hadError ? ' (error)' : ''}`);
      
      // Try reconnect
      if (reconnectAttempts < 3 && ws.readyState === ws.OPEN) {
        reconnectAttempts++;
        console.log(`🔄 [${clientId}] Reconnecting attempt ${reconnectAttempts}/3...`);
        setTimeout(connectToMinecraft, 1000);
      }
    });
    
    // Set timeout
    mcSocket.setTimeout(10000, () => {
      console.log(`⏰ [${clientId}] Minecraft connection timeout`);
      mcSocket.destroy();
    });
  }
  
  // Start connection
  connectToMinecraft();
  
  // Cleanup
  ws.on('close', () => {
    console.log(`📴 [${clientId}] Eaglercraft disconnected`);
    if (mcSocket) mcSocket.end();
  });
  
  ws.on('error', (err) => {
    console.log(`❌ [${clientId}] WebSocket error: ${err.message}`);
  });
  
  // Send initial response
  ws.send(JSON.stringify({
    type: 'handshake',
    status: 'proxy_ready',
    clientId: clientId,
    timestamp: Date.now()
  }));
});

console.log(`\n✅ Proxy ready at wss://eaglercraft-proxy-m4kx.onrender.com`);
console.log(`📊 Packet analysis enabled`);
console.log(`🔄 Auto-reconnect enabled\n`);

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  wss.close();
  process.exit(0);
});
