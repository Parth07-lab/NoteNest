const os = require('os');
const app = require('./src/app');
const config = require('./src/config');
const { initDb } = require('./src/services/db');

// Ensure data directory and db.json exist before accepting traffic
initDb();

/**
 * Discovers non-internal IPv4 network addresses (e.g. Wi-Fi / Ethernet)
 * so users can connect from other devices on the same local network.
 */
function getNetworkIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ name, address: iface.address });
      }
    }
  }
  return ips;
}

// Bind to 0.0.0.0 so external devices on the same local Wi-Fi can connect
const server = app.listen(config.PORT, '0.0.0.0', () => {
  const networkIps = getNetworkIps();

  console.log(`\n=============================================================`);
  console.log(`📝 NoteNest Server is Running!`);
  console.log(`=============================================================`);
  console.log(`💻 Local access (on this computer):`);
  console.log(`   👉 http://localhost:${config.PORT}`);
  console.log(`   👉 http://127.0.0.1:${config.PORT}`);

  if (networkIps.length > 0) {
    console.log(`\n📱 Multi-Device access (Phone, Tablet, Laptop on same Wi-Fi):`);
    networkIps.forEach(net => {
      console.log(`   👉 http://${net.address}:${config.PORT}  (${net.name})`);
    });
    console.log(`   Tip: Open that URL on your phone's browser to access NoteNest!`);
  }

  console.log(`\n📂 Database file: ${config.DB_PATH}`);
  console.log(`💡 Press Ctrl+C in this terminal window to stop the server.`);
  console.log(`=============================================================\n`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received. Closing HTTP server...');
  server.close(() => {
    console.log('HTTP server closed.');
  });
});
