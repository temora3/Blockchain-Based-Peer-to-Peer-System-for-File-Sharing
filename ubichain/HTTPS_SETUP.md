# HTTPS Setup for Local Development

WebTorrent requires Web Crypto API, which only works over HTTPS. This guide shows you how to run your Next.js app with HTTPS locally.

## Quick Start

1. **Generate SSL certificates:**
   ```bash
   npm run setup:https
   ```
   Or manually:
   ```bash
   node setup-https.js
   # or
   bash setup-https.sh
   ```

2. **Start the HTTPS server:**
   ```bash
   npm run dev:https
   ```

3. **Access your app:**
   - On your computer: `https://localhost:3000`
   - On other devices: `https://<your-local-ip>:3000`

## Finding Your Local IP

**Mac/Linux:**
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

**Windows:**
```bash
ipconfig
```
Look for "IPv4 Address" under your active network adapter.

## Accepting the Self-Signed Certificate

When you first visit the HTTPS site, your browser will show a security warning because the certificate is self-signed. This is normal for local development.

1. Click "Advanced" or "Show Details"
2. Click "Proceed to localhost" or "Accept the risk and continue"

**On mobile devices:**
- You may need to tap "Advanced" → "Proceed anyway" or similar
- Some browsers may require you to add an exception

## Alternative: Using ngrok (Easiest)

If you prefer not to set up local HTTPS:

1. Install ngrok: https://ngrok.com/download
2. Run your normal dev server: `npm run dev`
3. In another terminal: `ngrok http 3000`
4. Use the HTTPS URL ngrok provides on all devices

## Troubleshooting

**"SSL certificates not found" error:**
- Run `npm run setup:https` first

**"OpenSSL not found" error:**
- **Mac:** OpenSSL is pre-installed
- **Linux:** `sudo apt-get install openssl` (Ubuntu/Debian)
- **Windows:** Install from https://slproweb.com/products/Win32OpenSSL.html or use Git Bash

**Can't connect from other device:**
- Make sure both devices are on the same network
- Check your firewall isn't blocking port 3000
- Use your local IP address, not `localhost`

**Certificate errors on mobile:**
- Some mobile browsers are stricter. Try:
  - Chrome: Tap the warning → "Advanced" → "Proceed"
  - Safari: May require adding certificate to device settings

