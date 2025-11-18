import { BrowserProvider, Contract, ethers } from 'ethers';
import { getProvider, getContracts } from './web3';
import registryAbi from '@/abi/FileRegistry.json';
import tokenAbi from '@/abi/IncentiveToken.json';

const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || '';
const TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_ADDRESS || '';

export interface FileRegistrationResult {
  fileId: string;
  txHash: string;
  success: boolean;
}

/**
 * Register a file on the blockchain
 */
export async function registerFileOnChain(
  fileName: string,
  magnetURI: string,
  contentHash?: string
): Promise<FileRegistrationResult> {
  if (!REGISTRY_ADDRESS) {
    throw new Error('FileRegistry contract address not configured. Please set NEXT_PUBLIC_REGISTRY_ADDRESS in your environment variables. See BLOCKCHAIN_SETUP.md for instructions.');
  }

  const provider = await getProvider();
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  
  // Verify we're on the correct network (Sepolia = 11155111)
  const network = await provider.getNetwork();
  const sepoliaChainId = BigInt(11155111);
  if (network.chainId !== sepoliaChainId) {
    throw new Error(`Wrong network! Please switch to Sepolia testnet (Chain ID: 11155111). Current network: ${network.name} (Chain ID: ${network.chainId})`);
  }

  const registry = new Contract(REGISTRY_ADDRESS, registryAbi.abi, signer);
  
  // Verify contract exists at this address
  try {
    const code = await provider.getCode(REGISTRY_ADDRESS);
    if (code === '0x' || code === '0x0') {
      throw new Error(`No contract found at address ${REGISTRY_ADDRESS}. Please verify the contract was deployed to Sepolia testnet.`);
    }
  } catch (error: any) {
    if (error.message?.includes('No contract found')) {
      throw error;
    }
    // If getCode fails for other reasons, log but continue
    console.warn('Could not verify contract existence:', error);
  }

  // Convert contentHash to bytes32 if provided
  let contentHashBytes32: string = ethers.ZeroHash;
  if (contentHash) {
    // If contentHash is a hex string, ensure it's 32 bytes
    if (contentHash.startsWith('0x')) {
      contentHashBytes32 = contentHash.length === 66 ? contentHash : ethers.keccak256(ethers.toUtf8Bytes(contentHash));
    } else {
      // Hash the string to get bytes32
      contentHashBytes32 = ethers.keccak256(ethers.toUtf8Bytes(contentHash));
    }
  }

  try {
    // Compute fileId locally (same as contract's computeFileId function)
    // This avoids a contract call and works even if contract has issues
    const fileId = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'string', 'string'],
        [address, fileName, magnetURI]
      )
    );

    // Check if file is already registered
    try {
      const existing = await registry.getFile(fileId);
      if (existing && existing.owner !== ethers.ZeroAddress) {
        throw new Error('File already registered on-chain');
      }
    } catch (e: any) {
      // If getFile throws "not found", that's fine - file is not registered yet
      if (!e.message?.includes('not found')) {
        throw e;
      }
    }

    // Register the file
    console.log('📤 Sending transaction to register file on blockchain...');
    console.log('Contract address:', REGISTRY_ADDRESS);
    console.log('File name:', fileName);
    console.log('Magnet URI:', magnetURI);
    console.log('Content hash:', contentHashBytes32);
    
    const tx = await registry.registerFile(fileName, magnetURI, contentHashBytes32);
    console.log('⏳ Transaction sent! Hash:', tx.hash);
    console.log('⏳ Waiting for transaction confirmation...');
    
    const receipt = await tx.wait();
    console.log('✅ Transaction confirmed! Receipt:', receipt);
    
    // Check if transaction was successful
    if (!receipt || receipt.status !== 1) {
      throw new Error(`Transaction failed or reverted. Receipt status: ${receipt?.status}`);
    }
    
    console.log('✅ Transaction status: SUCCESS');
    console.log('✅ Transaction hash:', receipt.hash);
    console.log('✅ Block number:', receipt.blockNumber);
    console.log('✅ Gas used:', receipt.gasUsed?.toString());

    // Find the FileRegistered event
    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = registry.interface.parseLog(log);
        return parsed?.name === 'FileRegistered';
      } catch {
        return false;
      }
    });

    let registeredFileId = fileId;
    if (event) {
      const parsed = registry.interface.parseLog(event);
      registeredFileId = parsed?.args[0] || fileId;
      console.log('✅ FileRegistered event found! File ID:', registeredFileId);
    } else {
      console.warn('⚠️ FileRegistered event not found in receipt logs');
    }

    return {
      fileId: registeredFileId,
      txHash: receipt.hash,
      success: true,
    };
  } catch (error: any) {
    console.error('Error registering file on-chain:', error);
    throw error;
  }
}

/**
 * Get token balance for a user
 */
export async function getTokenBalance(userAddress: string): Promise<string> {
  if (!TOKEN_ADDRESS) {
    // Contract not configured - return 0 instead of throwing error
    console.info('IncentiveToken contract address not configured. Token balance will show as 0.');
    return '0';
  }

  try {
    const provider = await getProvider();
    
    // Verify we're on the correct network (Sepolia = 11155111)
    const network = await provider.getNetwork();
    const sepoliaChainId = BigInt(11155111);
    if (network.chainId !== sepoliaChainId) {
      console.warn(`Wrong network for token balance. Expected Sepolia (11155111), got ${network.chainId}`);
      return '0';
    }
    
    // Verify contract exists at this address
    const code = await provider.getCode(TOKEN_ADDRESS);
    if (code === '0x' || code === '0x0') {
      console.warn(`No contract found at token address ${TOKEN_ADDRESS}. Token balance will show as 0.`);
      return '0';
    }
    
    const token = new Contract(TOKEN_ADDRESS, tokenAbi.abi, provider);
    const balance = await token.balanceOf(userAddress);
    const decimals = await token.decimals();
    return ethers.formatUnits(balance, decimals);
  } catch (error: any) {
    // Log error but don't throw - allows UI to continue working
    console.warn('Error getting token balance:', error.message || error);
    return '0';
  }
}

/**
 * Get token symbol
 */
export async function getTokenSymbol(): Promise<string> {
  if (!TOKEN_ADDRESS) {
    // Contract not configured - return default symbol
    return 'UBIS';
  }

  try {
    const provider = await getProvider();
    
    // Verify we're on the correct network (Sepolia = 11155111)
    const network = await provider.getNetwork();
    const sepoliaChainId = BigInt(11155111);
    if (network.chainId !== sepoliaChainId) {
      console.warn(`Wrong network for token symbol. Expected Sepolia (11155111), got ${network.chainId}`);
      return 'UBIS';
    }
    
    // Verify contract exists at this address
    const code = await provider.getCode(TOKEN_ADDRESS);
    if (code === '0x' || code === '0x0') {
      console.warn(`No contract found at token address ${TOKEN_ADDRESS}. Using default symbol.`);
      return 'UBIS';
    }
    
    const token = new Contract(TOKEN_ADDRESS, tokenAbi.abi, provider);
    return await token.symbol();
  } catch (error: any) {
    // Log error but don't throw - return default symbol
    console.warn('Error getting token symbol:', error.message || error);
    return 'UBIS';
  }
}

/**
 * Check if a file is registered on-chain
 */
export async function isFileRegistered(
  ownerAddress: string,
  fileName: string,
  magnetURI: string
): Promise<boolean> {
  if (!REGISTRY_ADDRESS) {
    return false;
  }

  try {
    const provider = await getProvider();
    const registry = new Contract(REGISTRY_ADDRESS, registryAbi.abi, provider);
    // Compute fileId locally (same as contract's computeFileId function)
    const fileId = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'string', 'string'],
        [ownerAddress, fileName, magnetURI]
      )
    );
    const file = await registry.getFile(fileId);
    return file && file.owner !== ethers.ZeroAddress;
  } catch (error) {
    return false;
  }
}

