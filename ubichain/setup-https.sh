#!/bin/bash

# Script to generate self-signed SSL certificates for local HTTPS development

echo "🔐 Setting up HTTPS for local development..."

# Check if certificates already exist
if [ -f "localhost-key.pem" ] && [ -f "localhost.pem" ]; then
  echo "✅ SSL certificates already exist."
  read -p "Do you want to regenerate them? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Using existing certificates."
    exit 0
  fi
fi

# Generate private key
echo "📝 Generating private key..."
openssl genrsa -out localhost-key.pem 2048

# Generate certificate
echo "📝 Generating certificate..."
openssl req -new -x509 -key localhost-key.pem -out localhost.pem -days 365 -subj "/CN=localhost"

echo ""
echo "✅ SSL certificates generated successfully!"
echo ""
echo "⚠️  IMPORTANT: You'll need to trust this certificate on your devices:"
echo "   1. Open https://localhost:3000 in your browser"
echo "   2. Click 'Advanced' or 'Show Details'"
echo "   3. Click 'Proceed to localhost' or 'Accept the risk'"
echo ""
echo "   For other devices on your network:"
echo "   1. Find your local IP: ifconfig | grep 'inet ' (Mac/Linux) or ipconfig (Windows)"
echo "   2. Access: https://<your-ip>:3000"
echo "   3. Accept the security warning (self-signed certificate)"
echo ""
echo "🚀 Now run: npm run dev:https"

