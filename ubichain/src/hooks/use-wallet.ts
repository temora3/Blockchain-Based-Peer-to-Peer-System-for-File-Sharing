import { useState, useEffect, useCallback } from 'react';
import { BrowserProvider } from 'ethers';

export interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  chainId: number | null;
  provider: BrowserProvider | null;
  hasPendingRequest: boolean;
}

const MANUALLY_DISCONNECTED_KEY = 'wallet_manually_disconnected';

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    isConnected: false,
    isConnecting: false,
    chainId: null,
    provider: null,
    hasPendingRequest: false,
  });
  
  // Track if user manually disconnected (to prevent auto-reconnection)
  // Persist in localStorage to survive page reloads
  const [manuallyDisconnected, setManuallyDisconnected] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(MANUALLY_DISCONNECTED_KEY) === 'true';
  });
  
  // Update localStorage when manuallyDisconnected changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (manuallyDisconnected) {
        localStorage.setItem(MANUALLY_DISCONNECTED_KEY, 'true');
      } else {
        localStorage.removeItem(MANUALLY_DISCONNECTED_KEY);
      }
    }
  }, [manuallyDisconnected]);

  const checkConnection = useCallback(async () => {
    // Don't auto-reconnect if user manually disconnected
    if (manuallyDisconnected) {
      return;
    }
    
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      return;
    }

    try {
      const provider = new BrowserProvider((window as any).ethereum);
      const accounts = await provider.listAccounts();
      const network = await provider.getNetwork();
      
      if (accounts.length > 0) {
        setState(prev => ({
          ...prev,
          address: accounts[0].address,
          isConnected: true,
          isConnecting: false,
          chainId: Number(network.chainId),
          provider,
        }));
      } else {
        setState(prev => ({
          ...prev,
          address: null,
          isConnected: false,
          isConnecting: false,
          chainId: Number(network.chainId),
          provider: null,
        }));
      }
    } catch (error) {
      console.error('Error checking wallet connection:', error);
      setState(prev => ({
        ...prev,
        address: null,
        isConnected: false,
        isConnecting: false,
        chainId: null,
        provider: null,
      }));
    }
  }, [manuallyDisconnected]);

  const connect = useCallback(async (retryCount = 0): Promise<{ address: string; provider: BrowserProvider }> => {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      throw new Error('MetaMask not found. Please install MetaMask.');
    }

    // Don't set connecting state if we're retrying (to avoid UI flicker)
    if (retryCount === 0) {
      setState(prev => ({ ...prev, isConnecting: true }));
    }

    try {
      const provider = new BrowserProvider((window as any).ethereum);
      
      // Helper to check if error is a pending request error
      const isPendingRequestError = (error: any): boolean => {
        return error?.code === -32002 || 
               error?.error?.code === -32002 ||
               error?.message?.includes('already pending') ||
               error?.error?.message?.includes('already pending');
      };
      
      // If user was previously disconnected, we need to ensure MetaMask shows the popup
      // Even if MetaMask has cached permissions, eth_requestAccounts should still show the popup
      // But to be extra sure, we can try to revoke and re-request permissions
      if (manuallyDisconnected) {
        console.log('🔄 User was disconnected - requesting fresh connection from MetaMask...');
        try {
          // Try to revoke permissions first (this might not work in all MetaMask versions)
          // If it fails, we'll just proceed with eth_requestAccounts which should still show popup
          try {
            await provider.send('wallet_revokePermissions', [{
              eth_accounts: {}
            }]);
            console.log('✅ Permissions revoked - MetaMask will show fresh connection popup');
          } catch (revokeError: any) {
            // Revoke might not be supported or might fail - that's okay
            // eth_requestAccounts should still show the popup
            console.log('ℹ️ Could not revoke permissions (this is normal) - will request fresh connection');
          }
        } catch (e) {
          // Ignore errors - we'll proceed with normal connection flow
        }
      }
      
      // Always call eth_requestAccounts to ensure MetaMask shows the popup
      // This will show the popup even if permissions are cached (in most cases)
      try {
        await provider.send('eth_requestAccounts', []);
      } catch (error: any) {
        // Handle pending request error
        if (isPendingRequestError(error)) {
          if (retryCount < 3) {
            // Wait 1-2 seconds before retrying (exponential backoff)
            const waitTime = 1000 + (retryCount * 500);
            console.log(`Pending request detected, waiting ${waitTime}ms before retry ${retryCount + 1}/3...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return connect(retryCount + 1);
          } else {
            // After 3 retries, mark as having pending request and show helpful message
            setState(prev => ({ ...prev, isConnecting: false, hasPendingRequest: true }));
            throw new Error('MetaMask has a pending connection request. Click "Retry Connection" to reopen MetaMask, or check your MetaMask extension to approve/reject the request.');
          }
        }
        // Re-throw other errors
        throw error;
      }
      
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();

      // Clear manual disconnect flag when user explicitly connects
      setManuallyDisconnected(false);
      
      setState({
        address,
        isConnected: true,
        isConnecting: false,
        chainId: Number(network.chainId),
        provider,
        hasPendingRequest: false, // Clear pending request on successful connection
      });

      return { address, provider };
    } catch (error: any) {
      setState(prev => ({ ...prev, isConnecting: false }));
      
      // Handle user rejection
      if (error?.code === 4001 || error?.error?.code === 4001) {
        throw new Error('Connection rejected by user');
      }
      
      // Handle pending request error with better message
      if (error?.code === -32002 || 
          error?.error?.code === -32002 ||
          error?.message?.includes('already pending') ||
          error?.error?.message?.includes('already pending')) {
        setState(prev => ({ ...prev, hasPendingRequest: true }));
        throw new Error('MetaMask has a pending connection request. Click "Retry Connection" to reopen MetaMask, or check your MetaMask extension to approve/reject the request.');
      }
      
      throw error;
    }
  }, [manuallyDisconnected]);

  const disconnect = useCallback(() => {
    // Mark as manually disconnected to prevent auto-reconnection
    setManuallyDisconnected(true);
    
    setState({
      address: null,
      isConnected: false,
      isConnecting: false,
      chainId: null,
      provider: null,
      hasPendingRequest: false,
    });
    
    console.log('🔌 Wallet manually disconnected - auto-reconnection disabled');
  }, []);

  // Force retry connection - waits for old request to timeout, then creates fresh one
  const forceRetry = useCallback(async (): Promise<{ address: string; provider: BrowserProvider }> => {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      throw new Error('MetaMask not found. Please install MetaMask.');
    }

    setState(prev => ({ ...prev, hasPendingRequest: false, isConnecting: true }));

    try {
      const provider = new BrowserProvider((window as any).ethereum);
      
      console.log('🔄 Waiting for old pending request to timeout, then creating fresh connection...');
      
      // Strategy: Wait for MetaMask's pending request to timeout (typically 5-10 seconds)
      // Then make a completely fresh connection request that will open MetaMask again
      
      // Wait 6 seconds to let the old pending request timeout
      // MetaMask typically times out pending requests after 5-10 seconds
      console.log('⏳ Waiting 6 seconds for old request to timeout...');
      await new Promise(resolve => setTimeout(resolve, 6000));
      
      // First, check if we're already connected (user might have approved in extension while waiting)
      try {
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
          console.log('✅ Already connected!');
          const signer = await provider.getSigner();
          const address = await signer.getAddress();
          const network = await provider.getNetwork();
          
          // Clear manual disconnect flag when user explicitly connects
          setManuallyDisconnected(false);
          
          setState({
            address,
            isConnected: true,
            isConnecting: false,
            chainId: Number(network.chainId),
            provider,
            hasPendingRequest: false,
          });
          
          return { address, provider };
        }
      } catch (e) {
        // Not connected, continue with fresh request
        console.log('Not already connected, making fresh request...');
      }
      
      // Now make a completely fresh connection request
      // The old request should have timed out by now, so this will create a new one
      console.log('🆕 Creating fresh connection request (should open MetaMask popup)...');
      
      try {
        // This should open MetaMask with a fresh popup
        await provider.send('eth_requestAccounts', []);
        
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        const network = await provider.getNetwork();

        console.log('✅ Fresh connection successful!');

        setState({
          address,
          isConnected: true,
          isConnecting: false,
          chainId: Number(network.chainId),
          provider,
          hasPendingRequest: false,
        });

        return { address, provider };
      } catch (error: any) {
        // If we still get a pending request error, the old request hasn't timed out yet
        if (error?.code === -32002 || error?.error?.code === -32002) {
          console.log('⚠️ Old request still pending, waiting 4 more seconds...');
          await new Promise(resolve => setTimeout(resolve, 4000));
          
          // Final attempt - old request should definitely be timed out by now
          console.log('🆕 Final attempt: creating fresh connection request...');
          await provider.send('eth_requestAccounts', []);
          
          const signer = await provider.getSigner();
          const address = await signer.getAddress();
          const network = await provider.getNetwork();

          console.log('✅ Connection successful after extended wait!');

          setState({
            address,
            isConnected: true,
            isConnecting: false,
            chainId: Number(network.chainId),
            provider,
            hasPendingRequest: false,
          });

          return { address, provider };
        }
        throw error;
      }
    } catch (error: any) {
      setState(prev => ({ ...prev, isConnecting: false }));
      
      // Handle user rejection
      if (error?.code === 4001 || error?.error?.code === 4001) {
        throw new Error('Connection rejected by user');
      }
      
      // If still pending after all attempts, mark it
      if (error?.code === -32002 || error?.error?.code === -32002) {
        setState(prev => ({ ...prev, hasPendingRequest: true }));
        throw new Error('MetaMask still has a pending request. The old request may take longer to timeout. Please check your MetaMask extension icon and approve or reject any pending requests there, then try again.');
      }
      
      throw error;
    }
  }, []);

  useEffect(() => {
    // Only check connection on mount if not manually disconnected
    if (!manuallyDisconnected) {
      checkConnection();
    }

    // Listen for account changes
    if ((window as any).ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          // Account disconnected in MetaMask - respect manual disconnect state
          if (!manuallyDisconnected) {
            disconnect();
          }
        } else {
          // Account changed - only reconnect if not manually disconnected
          if (!manuallyDisconnected) {
            checkConnection();
          }
        }
      };

      const handleChainChanged = () => {
        // Chain changed - only update if connected (not manually disconnected)
        if (!manuallyDisconnected) {
          checkConnection();
        }
      };

      (window as any).ethereum.on('accountsChanged', handleAccountsChanged);
      (window as any).ethereum.on('chainChanged', handleChainChanged);

      return () => {
        if ((window as any).ethereum) {
          (window as any).ethereum.removeListener('accountsChanged', handleAccountsChanged);
          (window as any).ethereum.removeListener('chainChanged', handleChainChanged);
        }
      };
    }
  }, [checkConnection, disconnect, manuallyDisconnected]);

  return {
    ...state,
    connect,
    disconnect,
    checkConnection,
    forceRetry,
  };
}

