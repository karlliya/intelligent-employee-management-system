const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const QRCode = require('../backend/node_modules/qrcode');
require('../backend/node_modules/dotenv').config({ path: path.join(__dirname, '..', '.env.demo') });

function localAddress() {
  const interfaces = os.networkInterfaces();
  const addresses = Object.entries(interfaces).flatMap(([name, entries]) =>
    (entries || []).filter((entry) => entry.family === 'IPv4' && !entry.internal)
      .map((entry) => ({ name, address: entry.address }))
  );
  const privateAddress = addresses.find(({ address }) => /^192\.168\./.test(address))
    || addresses.find(({ address }) => /^10\./.test(address))
    || addresses.find(({ address }) => /^172\.(1[6-9]|2\d|3[01])\./.test(address));
  return privateAddress?.address;
}

async function main() {
  const address = localAddress();
  const port = Number(process.env.DEMO_PORT || 3000);
  const baseUrl = process.env.DEMO_URL || process.env.DEMO_PUBLIC_URL || (address ? `http://${address}:${port}/` : '');
  if (!baseUrl) {
    throw new Error('No LAN address found. Set DEMO_URL to the reachable project URL.');
  }
  const loginUrl = new URL('/login', baseUrl);
  if (!['http:', 'https:'].includes(loginUrl.protocol)) throw new Error('Demo URL must use HTTP or HTTPS.');
  const url = loginUrl.toString();

  const outputDir = path.join(__dirname, '..', 'presentation-assets');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputFile = path.join(outputDir, 'project-demo-qr.png');
  await QRCode.toFile(outputFile, url, {
    type: 'png',
    width: 1200,
    margin: 4,
    errorCorrectionLevel: 'H',
    color: { dark: '#111111', light: '#FFFFFF' }
  });
  await QRCode.toFile(path.join(outputDir, 'project-demo-qr-slide.png'), url, {
    type: 'png',
    width: 1200,
    margin: 3,
    errorCorrectionLevel: 'H',
    color: { dark: '#111111', light: '#FFFDF7' }
  });
  fs.writeFileSync(path.join(outputDir, 'project-demo-url.txt'), `${url}\n`, 'utf8');
  console.log(`QR saved: ${outputFile}`);
  console.log(`Demo URL: ${url}`);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    console.log(`Local reachability: HTTP ${response.status}`);
  } catch {
    console.warn('Warning: website did not respond locally. Start frontend and backend before the demo.');
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
