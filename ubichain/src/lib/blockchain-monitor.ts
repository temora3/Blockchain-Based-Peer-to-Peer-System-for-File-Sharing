import { Contract, ethers } from 'ethers';
import registryAbi from '@/abi/FileRegistry.json';

const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || '';

// Use public RPC endpoint for read-only queries (no wallet needed)
const SEPOLIA_RPC = process.env.NEXT_PUBLIC_SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';

function getPublicProvider() {
  return new ethers.JsonRpcProvider(SEPOLIA_RPC);
}

export interface FileRegisteredEvent {
  fileId: string;
  owner: string;
  name: string;
  magnetURI: string;
  contentHash: string;
  blockNumber: number;
  transactionHash: string;
  timestamp: number;
}

export interface TransactionStats {
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  totalGasUsed: bigint;
  averageGasUsed: number;
}

export interface BlockchainStats {
  totalFilesRegistered: number;
  recentEvents: FileRegisteredEvent[];
  transactionStats: TransactionStats;
  dailyRegistrations: Array<{ date: string; count: number }>;
  gasUsageOverTime: Array<{ date: string; gasUsed: number }>;
}

/**
 * Get FileRegistered events from the blockchain
 */
export async function getFileRegisteredEvents(
  fromBlock?: number,
  toBlock?: number
): Promise<FileRegisteredEvent[]> {
  if (!REGISTRY_ADDRESS) {
    console.warn('FileRegistry contract address not configured');
    return [];
  }

  try {
    const provider = getPublicProvider();
    
    // Verify contract exists
    const code = await provider.getCode(REGISTRY_ADDRESS);
    if (code === '0x' || code === '0x0') {
      console.warn(`No contract found at address ${REGISTRY_ADDRESS}`);
      return [];
    }

    const registry = new Contract(REGISTRY_ADDRESS, registryAbi.abi, provider);

    // Get current block number if not specified
    const currentBlock = await provider.getBlockNumber();
    const from = fromBlock || Math.max(0, currentBlock - 50000); // Last ~50k blocks (more history)
    const to = toBlock || currentBlock;

    console.log(`Querying FileRegistered events from block ${from} to ${to}`);

    // Query FileRegistered events
    const filter = registry.filters.FileRegistered();
    const events = await registry.queryFilter(filter, from, to);
    
    console.log(`Found ${events.length} FileRegistered events`);

    const fileEvents: FileRegisteredEvent[] = [];

    for (const event of events) {
      if (event.log && event.args) {
        const block = await provider.getBlock(event.blockNumber);
        fileEvents.push({
          fileId: event.args[0],
          owner: event.args[1],
          name: event.args[2],
          magnetURI: event.args[3],
          contentHash: event.args[4],
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          timestamp: block?.timestamp || 0,
        });
      }
    }

    return fileEvents.sort((a, b) => b.blockNumber - a.blockNumber);
  } catch (error: any) {
    console.error('Error fetching FileRegistered events:', error);
    // Return empty array instead of throwing to allow UI to show "no data" message
    if (error.message?.includes('network') || error.message?.includes('timeout')) {
      console.warn('Network error fetching events, returning empty array');
      return [];
    }
    // For other errors, still return empty array but log the error
    return [];
  }
}

/**
 * Get transaction statistics
 */
export async function getTransactionStats(
  events: FileRegisteredEvent[]
): Promise<TransactionStats> {
  if (events.length === 0) {
    return {
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      totalGasUsed: BigInt(0),
      averageGasUsed: 0,
    };
  }

  try {
    const provider = getPublicProvider();
    let totalGasUsed = BigInt(0);
    let successfulCount = 0;
    let failedCount = 0;

    // Sample transactions to get gas usage (limit to avoid too many calls)
    const sampleSize = Math.min(events.length, 50);
    const sampledEvents = events.slice(0, sampleSize);

    for (const event of sampledEvents) {
      try {
        const receipt = await provider.getTransactionReceipt(event.transactionHash);
        if (receipt) {
          if (receipt.status === 1) {
            successfulCount++;
            totalGasUsed += receipt.gasUsed;
          } else {
            failedCount++;
          }
        }
      } catch (err) {
        // Transaction might not be found or other error
        failedCount++;
      }
    }

    const averageGasUsed = sampledEvents.length > 0
      ? Number(totalGasUsed) / sampledEvents.length
      : 0;

    // Extrapolate for all events
    const successRate = sampledEvents.length > 0 ? successfulCount / sampledEvents.length : 1;
    const estimatedSuccessful = Math.round(events.length * successRate);
    const estimatedFailed = events.length - estimatedSuccessful;
    const estimatedTotalGas = BigInt(Math.round(Number(totalGasUsed) * (events.length / sampledEvents.length)));

    return {
      totalTransactions: events.length,
      successfulTransactions: estimatedSuccessful,
      failedTransactions: estimatedFailed,
      totalGasUsed: estimatedTotalGas,
      averageGasUsed,
    };
  } catch (error: any) {
    console.error('Error calculating transaction stats:', error);
    return {
      totalTransactions: events.length,
      successfulTransactions: events.length,
      failedTransactions: 0,
      totalGasUsed: BigInt(0),
      averageGasUsed: 0,
    };
  }
}

/**
 * Get comprehensive blockchain statistics
 */
export async function getBlockchainStats(): Promise<BlockchainStats> {
  try {
    if (!REGISTRY_ADDRESS) {
      // Return empty stats if contract not configured
      return {
        totalFilesRegistered: 0,
        recentEvents: [],
        transactionStats: {
          totalTransactions: 0,
          successfulTransactions: 0,
          failedTransactions: 0,
          totalGasUsed: BigInt(0),
          averageGasUsed: 0,
        },
        dailyRegistrations: [],
        gasUsageOverTime: [],
      };
    }

    const events = await getFileRegisteredEvents();
    
    // If no events found, return empty stats
    if (events.length === 0) {
      console.log('No FileRegistered events found on blockchain');
      return {
        totalFilesRegistered: 0,
        recentEvents: [],
        transactionStats: {
          totalTransactions: 0,
          successfulTransactions: 0,
          failedTransactions: 0,
          totalGasUsed: BigInt(0),
          averageGasUsed: 0,
        },
        dailyRegistrations: [],
        gasUsageOverTime: [],
      };
    }

    // Process daily registrations (last 30 days)
    const dailyRegistrations: Record<string, number> = {};
    const gasUsageByDay: Record<string, number[]> = {};

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    for (const event of events) {
      if (event.timestamp * 1000 >= thirtyDaysAgo) {
        const date = new Date(event.timestamp * 1000);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dailyRegistrations[dateStr] = (dailyRegistrations[dateStr] || 0) + 1;

        // Get gas usage for this transaction
        try {
          const provider = getPublicProvider();
          const receipt = await provider.getTransactionReceipt(event.transactionHash);
          if (receipt && receipt.status === 1) {
            if (!gasUsageByDay[dateStr]) {
              gasUsageByDay[dateStr] = [];
            }
            gasUsageByDay[dateStr].push(Number(receipt.gasUsed));
          }
        } catch (err) {
          // Skip if can't get receipt
        }
      }
    }

    // Convert to array format
    const dailyRegistrationsArray = Object.entries(dailyRegistrations)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateA.getTime() - dateB.getTime();
      });

    const gasUsageOverTime = Object.entries(gasUsageByDay)
      .map(([date, gasValues]) => ({
        date,
        gasUsed: Math.round(gasValues.reduce((a, b) => a + b, 0) / gasValues.length),
      }))
      .sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateA.getTime() - dateB.getTime();
      });

    const transactionStats = await getTransactionStats(events);

    return {
      totalFilesRegistered: events.length,
      recentEvents: events.slice(0, 10),
      transactionStats,
      dailyRegistrations: dailyRegistrationsArray,
      gasUsageOverTime,
    };
  } catch (error: any) {
    console.error('Error getting blockchain stats:', error);
    throw error;
  }
}

