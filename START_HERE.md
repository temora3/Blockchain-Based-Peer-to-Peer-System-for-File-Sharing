# UbiChain File Sharing System - Quick Start Guide

## 🚀 Starting the System

### 1. Start the Next.js Frontend (Includes everything!)
```bash
cd "/Users/seanratemo/Documents/Projects/IS Project/Blockchain-Based-Peer-to-Peer-System-for-File-Sharing/ubichain"
npm install
npx next dev
```
✅ App runs on `http://localhost:3000`

### 2. (Optional) Deploy Contracts
```bash
cd "/Users/seanratemo/Documents/Projects/IS Project/Blockchain-Based-Peer-to-Peer-System-for-File-Sharing"

# Terminal 1: Start local Ethereum node
npx hardhat node

# Terminal 2: Deploy contracts
npx hardhat run scripts/deploy.ts --network localhost

# Copy the deployed addresses to ubichain/.env.local:
# NEXT_PUBLIC_REGISTRY_ADDRESS=0x...
# NEXT_PUBLIC_TOKEN_ADDRESS=0x...
```

## 📝 Environment Setup

Create `ubichain/.env.local`:
```bash
# Blockchain (after deploying contracts)
NEXT_PUBLIC_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_TOKEN_ADDRESS=0x...
```

## ✨ Features

### ✅ User Registration & Authentication
- Email/password sign up
- OAuth (Google, GitHub)
- 2FA support
- Profile management

### ✅ File Sharing (P2P via WebTorrent)
- Upload files → auto-create torrent + magnet link
- Register files on blockchain (Ethereum/Polygon)
- Download via magnet links
- Auto-seed after download (earn points)
- Multiple file uploads support
- Seeding dashboard with stats

### ✅ Incentive System (Client-Side)
- Automatic points calculated from WebTorrent stats (no server needed!)
- Points = (uploaded bytes / 1024) + (10 points per torrent)
- Updates every 2 seconds automatically
- Points visible in Profile → Overview tab
- Track total uploaded data and seeding time

### ✅ Smart Contracts (Solidity)
- `FileRegistry.sol`: Records file metadata (name, magnet URI, hash, owner)
- `IncentiveToken.sol`: ERC20 rewards system
- Deploy via Hardhat

## 🧪 Testing the System

1. **Start the app** (see above)
2. **Open** `http://localhost:3000`
3. **Sign in/up** (via Supabase auth)
4. **Go to Share page** (`/share`)
5. **Upload a file** → creates torrent + gets magnet link
6. **Go to Profile → Seeding tab**
7. **Paste magnet links** → click "Start Seeding"
8. **Watch points update** in Profile → Overview (every 2 seconds)

## 🔍 How Points Work (Client-Side)

- **No scoring server needed!** Points are calculated directly from WebTorrent client stats
- Formula: `Points = (total uploaded bytes / 1024) + (10 points × number of seeding torrents)`
- Updates automatically every 2 seconds while seeding
- Shows: Active torrents count, total uploaded data, seeding time
- Open browser console to see WebTorrent client activity

## 📂 Project Structure

```
Blockchain-Based-Peer-to-Peer-System-for-File-Sharing/
├── ubichain/                    # Next.js frontend
│   ├── src/app/
│   │   ├── share/page.tsx       # Upload & create torrents
│   │   ├── download/page.tsx     # Download via magnet
│   │   └── profile/page.tsx      # User profile + seeding tab
│   └── src/lib/
│       ├── web3.ts              # Ethers.js integration
│       └── torrent.ts           # WebTorrent client
├── contracts/                   # Solidity contracts
│   ├── FileRegistry.sol
│   └── IncentiveToken.sol
├── scoring-server/              # (OPTIONAL) External tracker for production
│   └── server.js                # bittorrent-tracker + Express (not needed for client-side points)
└── scripts/
    └── deploy.ts                # Hardhat deployment script
```

## 🎯 Key Features Working

- ✅ WebTorrent P2P file transfer (WebRTC)
- ✅ Blockchain file registry (metadata on-chain)
- ✅ Automatic seeding points tracking
- ✅ Multi-torrent seeding support
- ✅ Profile with seeding dashboard
- ✅ Dark mode UI with Tubelight navbar
- ✅ Responsive design

## 🐛 Known Issues & Notes

- Points reset on server restart (in-memory storage)
- WebTorrent requires browser for P2P (WebRTC)
- Hardhat node needed for local blockchain testing
- Scoring server tracks uploads automatically (no manual claiming)
- **Duplicate torrent handling**: If you upload a file on Share page, it automatically seeds. If you try to download the same torrent, it detects the duplicate and uses the existing seeding instance instead.

