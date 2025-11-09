"use client";

import { useState, useEffect } from 'react';
import { useWallet } from '@/hooks/use-wallet';
import { Wallet, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '@/components/ui/toast-1';

export function WalletConnect() {
  const { address, isConnected, isConnecting, connect, disconnect, chainId, hasPendingRequest, forceRetry } = useWallet();
  const { showToast } = useToast();
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when successfully connected
  useEffect(() => {
    if (isConnected) {
      setDismissed(false);
    }
  }, [isConnected]);

  const handleConnect = async () => {
    try {
      await connect();
      showToast('Wallet connected successfully', 'success');
    } catch (error: any) {
      // Check if it's a pending request error - don't log as error, just handle silently
      const isPendingRequest = error.message?.includes('pending connection request') || 
                               error.code === -32002 || 
                               error?.error?.code === -32002;
      
      if (!isPendingRequest) {
        console.error('Failed to connect wallet:', error);
      } else {
        // Log as info instead of error for pending requests
        console.info('Pending connection request detected - showing retry UI');
      }
      
      // Handle specific error cases
      if (error.message?.includes('MetaMask not found')) {
        showToast('MetaMask not found. Please install MetaMask.', 'error');
      } else if (error.message?.includes('Connection rejected') || error.code === 4001 || error?.error?.code === 4001) {
        showToast('Connection rejected', 'warning');
      } else if (isPendingRequest) {
        // Don't show toast here - we'll show the pending request UI instead
        // The error state is already set in the hook, so the UI will show automatically
      } else {
        // Show the actual error message if available, otherwise generic message
        const errorMsg = error.message || error.error?.message || 'Failed to connect wallet';
        showToast(errorMsg, 'error');
      }
    }
  };

  const handleForceRetry = async () => {
    setDismissed(false); // Reset dismissed state when retrying
    try {
      await forceRetry();
      showToast('Wallet connected successfully', 'success');
    } catch (error: any) {
      const isPendingRequest = error.message?.includes('pending connection request') || 
                               error.code === -32002 || 
                               error?.error?.code === -32002;
      
      if (isPendingRequest) {
        console.info('Still pending after retry - user may need to check MetaMask extension');
        showToast('Still pending. Please check MetaMask extension or click the extension icon.', 'warning');
      } else {
        console.error('Failed to retry connection:', error);
        showToast('Failed to reconnect. Please try again.', 'error');
      }
    }
  };

  const handleDisconnect = () => {
    disconnect();
    showToast('Wallet disconnected', 'info');
  };

  const formatAddress = (addr: string) => {
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-2">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <div className="flex flex-col">
          <span className="text-xs text-zinc-400">Connected</span>
          <span className="text-sm font-mono text-zinc-200">{formatAddress(address)}</span>
        </div>
        {chainId && (
          <div className="flex flex-col">
            <span className="text-xs text-zinc-400">Chain</span>
            <span className="text-xs text-zinc-300">{chainId}</span>
          </div>
        )}
        <button
          onClick={handleDisconnect}
          className="ml-2 rounded px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200"
        >
          Disconnect
        </button>
      </div>
    );
  }

  // Show pending request UI if there's a pending request and not dismissed
  if (hasPendingRequest && !isConnected && !dismissed) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
        <div className="flex items-center gap-2">
          <XCircle className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium text-amber-300">Pending Connection Request</span>
        </div>
        <p className="text-xs text-amber-400/80">
          MetaMask has a pending request. Click below to wait for it to timeout, then open MetaMask with a fresh connection request.
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleForceRetry}
            disabled={isConnecting}
            className="flex items-center gap-2 rounded-md bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/30 disabled:opacity-50"
          >
            {isConnecting ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Waiting for old request to timeout, then opening MetaMask...</span>
              </>
            ) : (
              <>
                <Wallet className="h-3 w-3" />
                <span>Clear & Open MetaMask</span>
              </>
            )}
          </button>
          <button
            onClick={() => {
              setDismissed(true);
            }}
            className="rounded-md px-3 py-1.5 text-xs text-amber-400/80 hover:text-amber-300"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={isConnecting}
      className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900/60 disabled:opacity-50"
    >
      {isConnecting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Connecting...</span>
        </>
      ) : (
        <>
          <Wallet className="h-4 w-4" />
          <span>Connect Wallet</span>
        </>
      )}
    </button>
  );
}

