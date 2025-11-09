#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

console.log('🔐 Setting up HTTPS for local development...\n');

const keyPath = path.join(__dirname, 'localhost-key.pem');
const certPath = path.join(__dirname, 'localhost.pem');

// Check if certificates already exist
if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  console.log('✅ SSL certificates already exist.');
  console.log('   Delete localhost-key.pem and localhost.pem to regenerate.\n');
  process.exit(0);
}

try {
  // Generate private key
  console.log('📝 Generating private key...');
  execSync('openssl genrsa -out localhost-key.pem 2048', { stdio: 'inherit' });

  // Generate certificate
  console.log('📝 Generating certificate...');
  execSync('openssl req -new -x509 -key localhost-key.pem -out localhost.pem -days 365 -subj "/CN=localhost"', { stdio: 'inherit' });

  console.log('\n✅ SSL certificates generated successfully!\n');
  console.log('⚠️  IMPORTANT: You\'ll need to trust this certificate on your devices:');
  console.log('   1. Open https://localhost:3000 in your browser');
  console.log('   2. Click "Advanced" or "Show Details"');
  console.log('   3. Click "Proceed to localhost" or "Accept the risk"\n');
  console.log('   For other devices on your network:');
  console.log('   1. Find your local IP:');
  console.log('      - Mac/Linux: ifconfig | grep "inet "');
  console.log('      - Windows: ipconfig');
  console.log('   2. Access: https://<your-ip>:3000');
  console.log('   3. Accept the security warning (self-signed certificate)\n');
  console.log('🚀 Now run: npm run dev:https\n');
} catch (error) {
  console.error('❌ Error generating certificates:', error.message);
  console.error('\n💡 Make sure OpenSSL is installed:');
  console.error('   - Mac: Already installed');
  console.error('   - Linux: sudo apt-get install openssl (Ubuntu/Debian)');
  console.error('   - Windows: Install from https://slproweb.com/products/Win32OpenSSL.html');
  console.error('   - Or use Git Bash (includes OpenSSL)');
  process.exit(1);
}

