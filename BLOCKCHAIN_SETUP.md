# Blockchain Setup Guide

This guide will help you set up and deploy the smart contracts for the UbiChain file sharing system.

## Prerequisites

1. **Node.js** and **npm** installed
2. **MetaMask** browser extension
3. **Hardhat** installed globally or in the project
4. Testnet ETH (for gas fees) - Get from faucets:
   - Sepolia: https://sepoliafaucet.com/
   - Holesky: https://holeskyfaucet.com/
   - Mumbai: https://faucet.polygon.technology/
   - Amoy: https://faucet.polygon.technology/

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure Environment Variables

Create a `.env` file in the project root:

```env
# Private key for deploying contracts (NEVER commit this!)
PRIVATE_KEY=your_private_key_here

# Contract addresses (will be filled after deployment)
NEXT_PUBLIC_REGISTRY_ADDRESS=
NEXT_PUBLIC_TOKEN_ADDRESS=
```

**⚠️ WARNING:** Never commit your `.env` file or private key to version control!

## Step 3: Deploy Contracts

### Option A: Deploy to Local Hardhat Network

1. Start a local Hardhat node:
```bash
npx hardhat node
```

2. In a new terminal, deploy contracts:
```bash
npx hardhat run scripts/deploy.ts --network localhost
```

3. Copy the deployed addresses from the output and add them to your `.env` file.

### Option B: Deploy to Testnet (Sepolia)

1. Make sure you have testnet ETH in your wallet.

2. Deploy to Sepolia:
```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

3. Copy the deployed addresses and add them to your `.env` file:
```env
NEXT_PUBLIC_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_TOKEN_ADDRESS=0x...
```

### Option C: Deploy to Other Testnets

Update `hardhat.config.ts` with the testnet you want to use, then deploy:

```bash
# For Holesky
npx hardhat run scripts/deploy.ts --network holesky

# For Mumbai (Polygon)
npx hardhat run scripts/deploy.ts --network mumbai

# For Amoy (Polygon)
npx hardhat run scripts/deploy.ts --network amoy
```

## Step 4: Update Frontend Environment Variables

Add the contract addresses to your frontend `.env.local` file (in the `ubichain` directory):

```env
NEXT_PUBLIC_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_TOKEN_ADDRESS=0x...
```

## Step 5: Verify Contracts (Optional)

You can verify your contracts on block explorers:

```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

## Smart Contracts

### FileRegistry.sol

Stores file metadata on-chain:
- File name
- Magnet URI
- Content hash
- Owner address
- Registration timestamp

**Functions:**
- `registerFile(name, magnetURI, contentHash)` - Register a new file
- `getFile(fileId)` - Get file metadata by ID
- `computeFileId(owner, name, magnetURI)` - Compute file ID

### IncentiveToken.sol

ERC-20 token for rewarding users:
- Token name: "UbiChain Share"
- Token symbol: "UBIS"
- Owner can mint tokens to reward seeders

**Functions:**
- `mint(to, amount)` - Mint tokens (owner only)
- `balanceOf(address)` - Get token balance
- `transfer(to, amount)` - Transfer tokens

## Usage in Frontend

### Connect Wallet

Users need to connect their MetaMask wallet to:
1. Register files on-chain
2. View token balance
3. Receive token rewards

### Register Files

When a user shares a file:
1. A torrent is created
2. If wallet is connected, the file is automatically registered on-chain
3. The transaction hash is displayed to the user

### Token Rewards

Tokens can be distributed to users based on:
- Seeding activity (uploaded bytes)
- Number of files seeded
- Time spent seeding

## Network Configuration

The following testnets are configured in `hardhat.config.ts`:

- **Sepolia** (Ethereum testnet)
- **Holesky** (Ethereum testnet)
- **Mumbai** (Polygon testnet)
- **Amoy** (Polygon testnet)

## Troubleshooting

### "MetaMask not found"
- Install MetaMask browser extension
- Make sure it's enabled

### "Insufficient funds"
- Get testnet ETH from a faucet
- Check you're on the correct network

### "Contract address not configured"
- Make sure `NEXT_PUBLIC_REGISTRY_ADDRESS` and `NEXT_PUBLIC_TOKEN_ADDRESS` are set in `.env.local`
- Restart your Next.js dev server after adding environment variables

### "Transaction failed"
- Check you have enough gas
- Verify you're on the correct network
- Check contract addresses are correct

## Security Notes

1. **Never commit private keys** to version control
2. **Use testnets** for development
3. **Verify contracts** before mainnet deployment
4. **Test thoroughly** before deploying to production
5. **Use a hardware wallet** for mainnet deployments

## Next Steps

1. Deploy contracts to your chosen testnet
2. Update environment variables
3. Test file registration
4. Implement token reward distribution logic
5. Test end-to-end flow

For questions or issues, check the contract code in `contracts/` directory.

