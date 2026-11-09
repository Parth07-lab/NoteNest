const readline = require('readline');
const { execSync, spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const config = require('./src/config');
const { initDb } = require('./src/services/db');

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

function openBrowser(url) {
  const platform = process.platform;
  try {
    if (platform === 'win32') {
      execSync(`start "" "${url}"`);
    } else if (platform === 'darwin') {
      execSync(`open "${url}"`);
    } else {
      execSync(`xdg-open "${url}"`);
    }
  } catch (_) {}
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function showMenu() {
  console.clear();
  console.log(`=============================================================`);
  console.log(`               📝 NoteNest Run Interface                     `);
  console.log(`=============================================================`);
  console.log(` [1] Start Server & Open NoteNest in Browser`);
  console.log(` [2] Show Multi-Device Network URLs (Phone / Other PCs)`);
  console.log(` [3] Run Automated API Tests (npm test)`);
  console.log(` [4] Database Status & Create JSON Backup`);
  console.log(` [5] Exit`);
  console.log(`=============================================================`);
  rl.question('Select an option (1-5): ', handleChoice);
}

function handleChoice(choice) {
  const trimmed = choice.trim();

  switch (trimmed) {
    case '1': {
      console.log('\nStarting NoteNest server...');
      initDb();
      const serverProcess = spawn(process.execPath, ['server.js'], { stdio: 'inherit' });
      setTimeout(() => {
        openBrowser(`http://localhost:${config.PORT}`);
      }, 800);

      process.on('SIGINT', () => {
        serverProcess.kill();
        process.exit();
      });
      break;
    }

    case '2': {
      const networkIps = getNetworkIps();
      console.log(`\n-------------------------------------------------------------`);
      console.log(`📱 MULTI-DEVICE ACCESS GUIDE`);
      console.log(`-------------------------------------------------------------`);
      console.log(`To use NoteNest on your mobile phone, tablet, or another PC:`);
      console.log(`1. Make sure both devices are on the SAME Wi-Fi network.`);
      console.log(`2. Open the browser (Safari, Chrome) on your other device.`);
      console.log(`3. Type any of the following URLs into the address bar:\n`);

      if (networkIps.length === 0) {
        console.log(`   👉 http://localhost:${config.PORT} (No active Wi-Fi IP detected)`);
      } else {
        networkIps.forEach(net => {
          console.log(`   👉 http://${net.address}:${config.PORT}   (via ${net.name})`);
        });
      }

      console.log(`\nYour notes and accounts will stay synced automatically!`);
      console.log(`-------------------------------------------------------------`);
      rl.question('\nPress Enter to return to the menu...', () => showMenu());
      break;
    }

    case '3': {
      console.log('\nRunning test suite (node --test tests/api.test.js)...\n');
      try {
        execSync(`"${process.execPath}" --test tests/api.test.js`, { stdio: 'inherit' });
      } catch (e) {
        console.log('\nSome tests encountered an error.');
      }
      rl.question('\nPress Enter to return to the menu...', () => showMenu());
      break;
    }

    case '4': {
      initDb();
      console.log(`\n-------------------------------------------------------------`);
      console.log(`📂 DATABASE STATUS`);
      console.log(`-------------------------------------------------------------`);
      console.log(`Database Location: ${config.DB_PATH}`);
      try {
        const raw = fs.readFileSync(config.DB_PATH, 'utf-8');
        const data = JSON.parse(raw);
        console.log(`Total Users Registered: ${data.users ? data.users.length : 0}`);
        console.log(`Total Notes in DB:      ${data.notes ? data.notes.length : 0}`);

        const backupPath = path.join(config.DATA_DIR, `db-manual-backup-${Date.now()}.json`);
        fs.copyFileSync(config.DB_PATH, backupPath);
        console.log(`\n✅ Backup snapshot created at:\n   ${backupPath}`);
      } catch (err) {
        console.log(`Could not read database: ${err.message}`);
      }
      console.log(`-------------------------------------------------------------`);
      rl.question('\nPress Enter to return to the menu...', () => showMenu());
      break;
    }

    case '5':
      console.log('\nGoodbye! 📝\n');
      rl.close();
      process.exit(0);
      break;

    default:
      console.log('\nInvalid choice. Please enter 1, 2, 3, 4, or 5.');
      setTimeout(showMenu, 1000);
      break;
  }
}

// Start CLI menu
showMenu();
