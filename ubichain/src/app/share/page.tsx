"use client";
import { useEffect, useRef, useState, useMemo } from 'react';
import AuthService from '@/lib/auth';
import { getWebTorrentClient } from '@/lib/torrent';
import createTorrent from 'create-torrent';
import { getContracts } from '@/lib/web3';
import { useImageUpload } from '@/hooks/use-image-upload';
import { ImagePlus, Upload, FileText, Loader2 } from 'lucide-react';
import { v4 as uuidv4 } from "uuid";
import { supabase } from '@/lib/supabase/client';
import { Buffer } from 'buffer';
import { useToast } from '@/components/ui/toast-1';
import Folder from '@/components/Folder';
import { WalletConnect } from '@/components/ui/wallet-connect';
import { useWallet } from '@/hooks/use-wallet';
import { registerFileOnChain } from '@/lib/blockchain';

// Helper function to format bytes to human-readable size (KB, MB, GB, TB)
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes < 1024 * 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB`;
}

// Helper to upload .torrent file to Supabase Storage and return public URL (with user session)
async function uploadTorrentToSupabaseStorage(file: File, userId: string) {
  // Ensure user is logged in and session is available
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("No active user session for upload");
  // Use the singleton supabase client (which maintains the session)
  const fileExt = ".torrent";
  const fileName = `${userId}/${uuidv4()}${fileExt}`;
  const { data, error } = await supabase.storage
    .from("torrents")
    .upload(fileName, file, { upsert: false });
  if (error) throw error;
  // Get public URL
  const { data: publicUrlData } = supabase.storage.from("torrents").getPublicUrl(fileName);
  return publicUrlData.publicUrl;
}

// Replace with actual deployed addresses and ABIs
const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || '';
const TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_ADDRESS || '';
import registry from '@/abi/FileRegistry.json';
import token from '@/abi/IncentiveToken.json';

export default function SharePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [magnet, setMagnet] = useState('');
  const [torrentFileUrl, setTorrentFileUrl] = useState<string | null>(null);
  const { previewUrl, fileName, fileInputRef, handleThumbnailClick, handleFileChange, handleRemove } = useImageUpload({
    onUpload: () => {},
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dropPreview, setDropPreview] = useState<string | null>(null);
  
  // Seeding state (moved from profile page)
  const DEFAULT_TRACKERS = ['wss://tracker.openwebtorrent.com', 'wss://tracker.btorrent.xyz', 'wss://tracker.fastcast.nz'];
  const [seedingFiles, setSeedingFiles] = useState<File[]>([]); // .torrent files
  const [seedingTorrents, setSeedingTorrents] = useState<any[]>([]);
  const [seedingStatus, setSeedingStatus] = useState<string>("");
  const [duplicateMessage, setDuplicateMessage] = useState<string>("");
  const [peerStats, setPeerStats] = useState<Record<string, { peers: number; downloadSpeed: number; uploadSpeed: number; seeders: number; downloaders: number }>>({});
  const [statsUpdateCounter, setStatsUpdateCounter] = useState(0); // Force re-renders
  const { showToast } = useToast();
  const wallet = useWallet();
  const [isRegistering, setIsRegistering] = useState(false);
  
  // Real-time peer stats polling for all seeding torrents
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    const cleanupFunctions: (() => void)[] = [];
    
    const updateAllPeerStats = () => {
      const client = (window as any).__webtorrentClient;
      if (!client) {
        console.log('⚠️ No WebTorrent client available for peer stats update');
        return;
      }
      
      const torrents = client.torrents || [];
      const newPeerStats: Record<string, { peers: number; downloadSpeed: number; uploadSpeed: number; seeders: number; downloaders: number }> = {};
      
      // Helper to check if peer has pieces
      const peerHasPieces = (w: any) => {
        if (!w || !w.peerPieces) return false;
        if (Array.isArray(w.peerPieces)) return w.peerPieces.length > 0;
        if (typeof w.peerPieces === 'object') {
          if (w.peerPieces.length !== undefined) return w.peerPieces.length > 0;
          if (Object.keys(w.peerPieces).length > 0) return true;
          try {
            if (typeof w.peerPieces.count === 'function') return w.peerPieces.count() > 0;
            if (typeof w.peerPieces.toString === 'function') {
              return w.peerPieces.toString().includes('1');
            }
          } catch (e) {}
        }
        if (typeof w.peerPieces === 'number') return w.peerPieces > 0;
        return false;
      };
      
      torrents.forEach((t: any) => {
        if (t && !t.destroyed) {
          // Consistent infoHash extraction
          const tHash = t.infoHash?.toString?.('hex') || 
                        (typeof t.infoHash === 'string' ? t.infoHash : '') ||
                        (t.infoHashBuffer ? Buffer.from(t.infoHashBuffer).toString('hex') : '');
          
          if (!tHash) return;
          
          const wires = t.wires || [];
          const seeders = wires.filter(peerHasPieces).length;
          const downloaders = wires.filter((w: any) => !peerHasPieces(w) || (w.uploaded && w.uploaded > 0)).length;
          const peers = t.numPeers || wires.length || 0;
          
          newPeerStats[tHash] = {
            peers,
            downloadSpeed: t.downloadSpeed || 0,
            uploadSpeed: t.uploadSpeed || 0,
            seeders,
            downloaders
          };
          
          // Log updates for debugging - always log to see what's happening
          console.log(`📊 Peer stats update for ${tHash.substring(0, 8)}:`, {
            peers,
            seeders,
            downloaders,
            uploadSpeed: `${((t.uploadSpeed || 0) / 1024).toFixed(2)} KB/s`,
            wiresLength: wires.length,
            numPeers: t.numPeers,
            wiresArray: wires.map((w: any) => ({
              peerId: w.peerId?.toString?.('hex')?.substring(0, 8) || 'unknown',
              hasPieces: peerHasPieces(w),
              uploaded: w.uploaded || 0,
              downloaded: w.downloaded || 0
            }))
          });
        }
      });
      
      // Check if stats actually changed
      let statsChanged = false;
      if (Object.keys(peerStats).length !== Object.keys(newPeerStats).length) {
        statsChanged = true;
      } else {
        for (const [hash, newStat] of Object.entries(newPeerStats)) {
          const oldStat = peerStats[hash];
          if (!oldStat || 
              oldStat.peers !== newStat.peers ||
              oldStat.seeders !== newStat.seeders ||
              oldStat.downloaders !== newStat.downloaders) {
            statsChanged = true;
            break;
          }
        }
      }
      
      // Always update state to trigger re-render (React will handle deduplication)
      setPeerStats(newPeerStats);
      
      // Force re-render by updating counter (always increment to ensure UI updates)
      setStatsUpdateCounter(prev => prev + 1);
      
      // Log if there are any peers or if stats changed
      const totalPeers = Object.values(newPeerStats).reduce((sum, s) => sum + s.peers, 0);
      const totalSeeders = Object.values(newPeerStats).reduce((sum, s) => sum + s.seeders, 0);
      const totalDownloaders = Object.values(newPeerStats).reduce((sum, s) => sum + s.downloaders, 0);
      
      if (totalPeers > 0 || totalSeeders > 0 || totalDownloaders > 0 || statsChanged) {
        console.log(`📊 Total peer stats: ${totalPeers} peers, ${totalSeeders} seeders, ${totalDownloaders} downloaders (changed: ${statsChanged})`);
      }
      
      // Log detailed wire information for debugging
      torrents.forEach((t: any) => {
        if (t && !t.destroyed) {
          const wires = t.wires || [];
          if (wires.length > 0) {
            const tHash = t.infoHash?.toString?.('hex') || 
                          (typeof t.infoHash === 'string' ? t.infoHash : '') ||
                          (t.infoHashBuffer ? Buffer.from(t.infoHashBuffer).toString('hex') : '');
            console.log(`🔍 DETAILED WIRES for ${tHash?.substring(0, 8) || 'unknown'}:`, {
              wiresCount: wires.length,
              numPeers: t.numPeers,
              wires: wires.map((w: any, idx: number) => ({
                index: idx,
                peerId: w.peerId?.toString?.('hex')?.substring(0, 16) || 'unknown',
                peerPieces: w.peerPieces ? (Array.isArray(w.peerPieces) ? w.peerPieces.length : 'object') : 'none',
                uploaded: w.uploaded || 0,
                downloaded: w.downloaded || 0,
                amChoking: w.amChoking,
                peerChoking: w.peerChoking,
                amInterested: w.amInterested,
                peerInterested: w.peerInterested,
                remoteAddress: w.remoteAddress || 'unknown',
                remotePort: w.remotePort || 'unknown'
              }))
            });
          }
        }
      });
    };
    
    const attachListenersToTorrents = () => {
      const client = (window as any).__webtorrentClient;
      if (!client) return;
      
      const torrents = client.torrents || [];
      console.log(`🔌 Attaching peer stats listeners to ${torrents.length} torrent(s)`);
      
      torrents.forEach((t: any) => {
        if (t && !t.destroyed && typeof t.on === 'function') {
          // Check if listeners already attached (avoid duplicates)
          if ((t as any).__peerStatsListenersAttached) return;
          
          const onPeer = (peerId: any) => {
            console.log('👤 Peer discovered - updating peer stats', {
              torrentHash: (t.infoHash?.toString?.('hex') || t.infoHash || 'unknown').substring(0, 8),
              peerId: peerId?.toString?.('hex')?.substring(0, 16) || 'unknown',
              currentWires: (t.wires || []).length
            });
            updateAllPeerStats();
          };
          const onWire = (wire: any) => {
            const wires = t.wires || [];
            console.log('🔌 Wire event - updating peer stats', {
              torrentHash: (t.infoHash?.toString?.('hex') || t.infoHash || 'unknown').substring(0, 8),
              peerId: wire?.peerId?.toString?.('hex')?.substring(0, 16) || 'unknown',
              totalWires: wires.length,
              wireDetails: {
                uploaded: wire?.uploaded || 0,
                downloaded: wire?.downloaded || 0,
                peerPieces: wire?.peerPieces ? 'has pieces' : 'no pieces'
              }
            });
            updateAllPeerStats();
          };
          const onNoPeers = () => {
            console.log('⚠️ NoPeers event - updating peer stats');
            updateAllPeerStats();
          };
          const onDownload = () => updateAllPeerStats();
          const onUpload = () => {
            console.log('⬆️ Upload event - data being uploaded to peer!');
            updateAllPeerStats();
          };
          
          t.on('peer', onPeer);
          t.on('wire', onWire);
          t.on('noPeers', onNoPeers);
          t.on('download', onDownload);
          t.on('upload', onUpload);
          
          (t as any).__peerStatsListenersAttached = true;
          (t as any).__peerStatsCleanup = () => {
            try {
              t.removeListener('peer', onPeer);
              t.removeListener('wire', onWire);
              t.removeListener('noPeers', onNoPeers);
              t.removeListener('download', onDownload);
              t.removeListener('upload', onUpload);
              (t as any).__peerStatsListenersAttached = false;
            } catch (e) {
              console.error('Error removing peer stats listeners:', e);
            }
          };
          
          cleanupFunctions.push((t as any).__peerStatsCleanup);
        }
      });
    };
    
    // Initial setup
    const initialize = () => {
      updateAllPeerStats();
      attachListenersToTorrents();
      
      // Set up polling interval for real-time updates (every 1 second)
      interval = setInterval(() => {
        updateAllPeerStats();
        // Re-attach listeners in case new torrents were added
        attachListenersToTorrents();
      }, 1000);
    };
    
    // Wait a bit for client to be ready
    const client = (window as any).__webtorrentClient;
    if (client) {
      initialize();
    } else {
      // Wait for client to be available
      const checkClient = setInterval(() => {
        const c = (window as any).__webtorrentClient;
        if (c) {
          clearInterval(checkClient);
          initialize();
        }
      }, 100);
      
      cleanupFunctions.push(() => clearInterval(checkClient));
    }
    
    // Also listen for new torrents being added to client
    if (client && typeof client.on === 'function') {
      const onTorrentAdd = () => {
        console.log('➕ New torrent added to client - attaching listeners');
        setTimeout(() => {
          attachListenersToTorrents();
          updateAllPeerStats();
        }, 100);
      };
      
      client.on('torrent', onTorrentAdd);
      cleanupFunctions.push(() => {
        try {
          client.removeListener('torrent', onTorrentAdd);
        } catch (e) {
          console.error('Error removing torrent listener:', e);
        }
      });
    }
    
    return () => {
      console.log('🧹 Cleaning up peer stats polling');
      if (interval) clearInterval(interval);
      cleanupFunctions.forEach(cleanup => {
        try {
          cleanup();
        } catch (e) {
          console.error('Error in cleanup:', e);
        }
      });
    };
  }, [seedingTorrents.length]); // Re-run when number of seeding torrents changes
  
  useEffect(() => {
    if (!previewUrl) return;
    setDropPreview(previewUrl);
  }, [previewUrl]);
  
  // Restore seeding torrents from localStorage and active client torrents on mount
  useEffect(() => {
    const restoreSeedingTorrents = async () => {
      try {
        const client = await getWebTorrentClient();
        
        // First, check for active torrents in the client (from previous navigation)
        // This handles page navigation where the client persists but React state doesn't
        const activeTorrents = client.torrents || [];
        console.log(`Found ${activeTorrents.length} active torrent(s) in WebTorrent client`);
        
        const activeTorrentsToAdd: any[] = [];
        for (const torrent of activeTorrents) {
          if (torrent.destroyed) continue;
          
          const infoHash = torrent.infoHash?.toString?.('hex') || torrent.infoHash;
          if (!infoHash) continue;
          
          // No need to check stopped list - if it was stopped, it was already removed from localStorage
          
          // Add torrent to the list to restore
          console.log(`Found active torrent in client: ${infoHash}, adding to state`);
          activeTorrentsToAdd.push(torrent);
        }
        
        // Set up listeners for all active torrents
        for (const torrent of activeTorrentsToAdd) {
          if (typeof torrent.on === 'function' && !torrent.destroyed) {
            const updatePeerStats = () => {
              const client = (window as any).__webtorrentClient;
              if (client) {
                const torrents = client.torrents || [];
                const newPeerStats: Record<string, { peers: number; downloadSpeed: number; uploadSpeed: number; seeders: number; downloaders: number }> = {};
                
                const peerHasPieces = (w: any) => {
                  if (!w || !w.peerPieces) return false;
                  if (Array.isArray(w.peerPieces)) return w.peerPieces.length > 0;
                  if (typeof w.peerPieces === 'object') {
                    if (w.peerPieces.length !== undefined) return w.peerPieces.length > 0;
                    if (Object.keys(w.peerPieces).length > 0) return true;
                    try {
                      if (typeof w.peerPieces.count === 'function') return w.peerPieces.count() > 0;
                      if (typeof w.peerPieces.toString === 'function') {
                        return w.peerPieces.toString().includes('1');
                      }
                    } catch (e) {}
                  }
                  if (typeof w.peerPieces === 'number') return w.peerPieces > 0;
                  return false;
                };
                
                torrents.forEach((t: any) => {
                  if (t && !t.destroyed) {
                    const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                    const wires = t.wires || [];
                    const seeders = wires.filter(peerHasPieces).length;
                    const downloaders = wires.filter((w: any) => !peerHasPieces(w) || (w.uploaded && w.uploaded > 0)).length;
                    newPeerStats[tHash] = {
                      peers: t.numPeers || wires.length || 0,
                      downloadSpeed: t.downloadSpeed || 0,
                      uploadSpeed: t.uploadSpeed || 0,
                      seeders,
                      downloaders
                    };
                  }
                });
                setPeerStats(newPeerStats);
                setStatsUpdateCounter(prev => prev + 1);
              }
            };
            
            // Remove existing listeners to avoid duplicates, then re-add
            torrent.removeAllListeners?.();
            
            torrent.on('wire', () => updatePeerStats());
            torrent.on('noPeers', () => updatePeerStats());
            torrent.on('download', () => updatePeerStats());
            torrent.on('upload', () => updatePeerStats());
            
            const interval = setInterval(() => updatePeerStats(), 500);
            torrent.on('destroy', () => {
              clearInterval(interval);
              updatePeerStats();
            });
            
            updatePeerStats();
          }
        }
        
        // Add active torrents to state
        if (activeTorrentsToAdd.length > 0) {
          setSeedingTorrents(prev => {
            const existing = [...prev];
            for (const torrent of activeTorrentsToAdd) {
              const infoHash = torrent.infoHash?.toString?.('hex') || torrent.infoHash;
              const exists = existing.find(t => {
                const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                return tHash && tHash.toLowerCase() === infoHash.toLowerCase();
              });
              if (!exists) {
                existing.push(torrent);
              }
            }
            return existing;
          });
          console.log(`Restored ${activeTorrentsToAdd.length} active torrent(s) from WebTorrent client`);
        }
        
        // Load session state (like uTorrent loads session.dat)
        const sessionListKey = 'webtorrent_session_list';
        const sessionList: any[] = JSON.parse(localStorage.getItem(sessionListKey) || '[]');
        console.log(`📋 Found ${sessionList.length} torrent(s) in session state (uTorrent-style)`);
        
        // Also get magnet links for backward compatibility
        const saved = localStorage.getItem('webtorrent_seeding_magnets');
        const magnets: string[] = saved ? JSON.parse(saved) : [];
        console.log(`Found ${magnets.length} magnet link(s) in localStorage to restore`);
        
        if (sessionList.length > 0 || magnets.length > 0) {
          console.log('🔄 Starting restoration from session state (uTorrent-style)...');
          let restorationCount = 0;
          
          // Track which infoHashes have been processed to avoid duplicates
          const processedInfoHashes = new Set<string>();
          
          // First, restore from session list (more complete data)
          for (const sessionEntry of sessionList) {
            const sessionInfoHash = sessionEntry.infoHash?.toLowerCase();
            if (!sessionInfoHash) continue;
            
            // No need to check stopped list - if it was stopped, it was already removed from localStorage
            
            // Check if already active in client
            const existing = client.get(sessionInfoHash);
            const isValid = existing && !existing.destroyed && typeof existing.on === 'function';
            
            if (isValid) {
              console.log(`✅ Torrent ${sessionInfoHash} already active in client`);
              setSeedingTorrents((prev) => {
                if (prev.find(t => {
                  const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                  return tHash && tHash.toLowerCase() === sessionInfoHash;
                })) return prev;
                return [...prev, existing];
              });
              restorationCount++;
              processedInfoHashes.add(sessionInfoHash); // Mark as processed
              continue;
            }
            
            // Check seeding type
            if (sessionEntry.seedingType === 'direct_file_seed') {
              // Direct file seed: files are lost on reload (browser limitation)
              // Show user a message that they need to re-upload files
              console.warn(`⚠️ Torrent ${sessionInfoHash} was seeded from uploaded files. Files are lost on reload.`);
              console.warn(`   User needs to re-upload files to continue seeding this torrent.`);
              
              // Still try to restore from magnet (might work if others are seeding)
              if (sessionEntry.magnetURI) {
                console.log(`   Attempting to restore from magnet (will download first if peers available)...`);
                // Fall through to magnet restoration below
              }
            } else if (sessionEntry.seedingType === 'torrent_file_seed') {
              // .torrent file seed: try to restore from saved .torrent file data first
              const torrentFileKey = `webtorrent_torrent_file_${sessionInfoHash}`;
              const savedTorrentData = localStorage.getItem(torrentFileKey);
              
              // First, check if torrent already exists in client
              let existingTorrent = client.get(sessionInfoHash);
              
              // Check if existing torrent is valid
              const isValidExisting = existingTorrent && 
                !existingTorrent.destroyed && 
                typeof existingTorrent.on === 'function';
              
              // If not found or invalid, check client.torrents array
              if (!isValidExisting) {
                const allTorrents = client.torrents || [];
                const foundInArray = allTorrents.find((t: any) => {
                  const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                  return tHash && tHash.toLowerCase() === sessionInfoHash.toLowerCase();
                });
                
                if (foundInArray && !foundInArray.destroyed && typeof foundInArray.on === 'function') {
                  existingTorrent = foundInArray;
                  console.log(`✅ Found valid existing torrent ${sessionInfoHash} in client, using it instead of restoring`);
                }
              } else {
                console.log(`✅ Found valid existing torrent ${sessionInfoHash} in client, using it instead of restoring`);
              }
              
              // If we have a valid existing torrent, use it
              if (existingTorrent && !existingTorrent.destroyed && typeof existingTorrent.on === 'function') {
                console.log(`✅ Using existing torrent ${sessionInfoHash} from client`);
                
                // Add to state if not already there
                setSeedingTorrents((prev) => {
                  const exists = prev.find(t => {
                    const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                    return tHash && tHash.toLowerCase() === sessionInfoHash.toLowerCase();
                  });
                  if (exists) return prev;
                  return [...prev, existingTorrent];
                });
                
                // Set up event listeners
                const updatePeerStats = () => {
                  const client = (window as any).__webtorrentClient;
                  if (client) {
                    const torrents = client.torrents || [];
                    const newPeerStats: Record<string, { peers: number; downloadSpeed: number; uploadSpeed: number; seeders: number; downloaders: number }> = {};
                    
                    const peerHasPieces = (w: any) => {
                      if (!w || !w.peerPieces) return false;
                      if (Array.isArray(w.peerPieces)) return w.peerPieces.length > 0;
                      if (typeof w.peerPieces === 'object') {
                        if (w.peerPieces.length !== undefined) return w.peerPieces.length > 0;
                        if (Object.keys(w.peerPieces).length > 0) return true;
                        try {
                          if (typeof w.peerPieces.count === 'function') return w.peerPieces.count() > 0;
                          if (typeof w.peerPieces.toString === 'function') {
                            return w.peerPieces.toString().includes('1');
                          }
                        } catch (e) {}
                      }
                      if (typeof w.peerPieces === 'number') return w.peerPieces > 0;
                      return false;
                    };
                    
                    torrents.forEach((t: any) => {
                      if (t && !t.destroyed) {
                        const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                        const wires = t.wires || [];
                        const seeders = wires.filter(peerHasPieces).length;
                        const downloaders = wires.filter((w: any) => !peerHasPieces(w) || (w.uploaded && w.uploaded > 0)).length;
                        newPeerStats[tHash] = {
                          peers: t.numPeers || wires.length || 0,
                          downloadSpeed: t.downloadSpeed || 0,
                          uploadSpeed: t.uploadSpeed || 0,
                          seeders,
                          downloaders
                        };
                      }
                    });
                    setPeerStats(newPeerStats);
                    setStatsUpdateCounter(prev => prev + 1);
                  }
                };
                
                existingTorrent.on('wire', () => updatePeerStats());
                existingTorrent.on('noPeers', () => updatePeerStats());
                
                const interval = setInterval(() => updatePeerStats(), 5000);
                existingTorrent.on('destroy', () => clearInterval(interval));
                
                updatePeerStats();
                restorationCount++;
                processedInfoHashes.add(sessionInfoHash); // Mark as processed
                continue; // Skip to next torrent
              }
              
              // Only restore from saved data if torrent doesn't exist in client
              if (savedTorrentData) {
                try {
                  // Convert base64 back to buffer
                  const torrentBuffer = Buffer.from(savedTorrentData, 'base64');
                  console.log(`📁 Restoring ${sessionInfoHash} from saved .torrent file data...`);
                  
                  // Check one more time if torrent was added while we were processing
                  const checkAgain = client.get(sessionInfoHash);
                  if (checkAgain && !checkAgain.destroyed && typeof checkAgain.on === 'function') {
                    console.log(`✅ Torrent ${sessionInfoHash} was added to client while processing, using it`);
                    setSeedingTorrents((prev) => {
                      const exists = prev.find(t => {
                        const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                        return tHash && tHash.toLowerCase() === sessionInfoHash.toLowerCase();
                      });
                      if (exists) return prev;
                      return [...prev, checkAgain];
                    });
                    restorationCount++;
                    continue;
                  }
                  
                  // Add torrent using the saved .torrent file buffer
                  client.add(torrentBuffer, { announce: DEFAULT_TRACKERS }, (restoredTorrent: any) => {
                    const restoredHash = restoredTorrent.infoHash?.toString?.('hex') || restoredTorrent.infoHash;
                    console.log(`✅ Restored .torrent file ${restoredHash} from saved data`);
                    
                    // Add to state
                    setSeedingTorrents((prev) => {
                      const exists = prev.find(t => {
                        const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                        return tHash && tHash.toLowerCase() === restoredHash.toLowerCase();
                      });
                      if (exists) return prev;
                      return [...prev, restoredTorrent];
                    });
                    
                    // Set up event listeners
                    const updatePeerStats = () => {
                      const client = (window as any).__webtorrentClient;
                      if (client) {
                        const torrents = client.torrents || [];
                        const newPeerStats: Record<string, { peers: number; downloadSpeed: number; uploadSpeed: number; seeders: number; downloaders: number }> = {};
                        
                        const peerHasPieces = (w: any) => {
                          if (!w || !w.peerPieces) return false;
                          if (Array.isArray(w.peerPieces)) return w.peerPieces.length > 0;
                          if (typeof w.peerPieces === 'object') {
                            if (w.peerPieces.length !== undefined) return w.peerPieces.length > 0;
                            if (Object.keys(w.peerPieces).length > 0) return true;
                            try {
                              if (typeof w.peerPieces.count === 'function') return w.peerPieces.count() > 0;
                              if (typeof w.peerPieces.toString === 'function') {
                                return w.peerPieces.toString().includes('1');
                              }
                            } catch (e) {}
                          }
                          if (typeof w.peerPieces === 'number') return w.peerPieces > 0;
                          return false;
                        };
                        
                        torrents.forEach((t: any) => {
                          if (t && !t.destroyed) {
                            const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                            const wires = t.wires || [];
                            const seeders = wires.filter(peerHasPieces).length;
                            const downloaders = wires.filter((w: any) => !peerHasPieces(w) || (w.uploaded && w.uploaded > 0)).length;
                            newPeerStats[tHash] = {
                              peers: t.numPeers || wires.length || 0,
                              downloadSpeed: t.downloadSpeed || 0,
                              uploadSpeed: t.uploadSpeed || 0,
                              seeders,
                              downloaders
                            };
                          }
                        });
                        setPeerStats(newPeerStats);
                        setStatsUpdateCounter(prev => prev + 1);
                      }
                    };
                    
                    restoredTorrent.on('wire', () => updatePeerStats());
                    restoredTorrent.on('noPeers', () => updatePeerStats());
                    
                    const interval = setInterval(() => updatePeerStats(), 5000);
                    restoredTorrent.on('destroy', () => clearInterval(interval));
                    
                    updatePeerStats();
                    restorationCount++;
                    processedInfoHashes.add(sessionInfoHash); // Mark as processed
                  }).on('error', (err: any) => {
                    // Check if error is "duplicate torrent" - this means it was already added
                    if (err?.message?.includes('duplicate torrent') || err?.message?.includes('Cannot add duplicate')) {
                      console.log(`⚠️ Torrent ${sessionInfoHash} is already in client (duplicate), using existing one`);
                      // Try to get the existing torrent
                      const existing = client.get(sessionInfoHash);
                      if (existing && !existing.destroyed && typeof existing.on === 'function') {
                        setSeedingTorrents((prev) => {
                          const exists = prev.find(t => {
                            const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                            return tHash && tHash.toLowerCase() === sessionInfoHash.toLowerCase();
                          });
                          if (exists) return prev;
                          return [...prev, existing];
                        });
                        restorationCount++;
                        // Mark as processed so we don't try magnet restoration
                        processedInfoHashes.add(sessionInfoHash);
                      } else {
                        // Try to find in client.torrents array
                        const allTorrents = client.torrents || [];
                        const found = allTorrents.find((t: any) => {
                          const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                          return tHash && tHash.toLowerCase() === sessionInfoHash.toLowerCase();
                        });
                        if (found && !found.destroyed && typeof found.on === 'function') {
                          setSeedingTorrents((prev) => {
                            const exists = prev.find(t => {
                              const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                              return tHash && tHash.toLowerCase() === sessionInfoHash.toLowerCase();
                            });
                            if (exists) return prev;
                            return [...prev, found];
                          });
                          restorationCount++;
                          processedInfoHashes.add(sessionInfoHash);
                        }
                      }
                    } else {
                      console.error(`❌ Failed to restore .torrent file ${sessionInfoHash}:`, err);
                      // Only fall back to magnet if error is NOT duplicate
                      // If it's a duplicate, we already handled it above
                      if (sessionEntry.magnetURI && !err?.message?.includes('duplicate')) {
                        console.log(`   Falling back to magnet restoration...`);
                      } else {
                        // Mark as processed even on error (to avoid infinite loops)
                        processedInfoHashes.add(sessionInfoHash);
                      }
                    }
                  });
                  
                  continue; // Skip magnet restoration, already handled
                } catch (restoreErr) {
                  console.error(`Error restoring .torrent file ${sessionInfoHash}:`, restoreErr);
                  // Fall back to magnet restoration
                  if (sessionEntry.magnetURI) {
                    console.log(`   Falling back to magnet restoration...`);
                  }
                }
              } else {
                // No saved .torrent file data, restore from magnet
                if (sessionEntry.magnetURI) {
                  console.log(`   No saved .torrent file data, restoring ${sessionInfoHash} from magnet...`);
                  // Fall through to magnet restoration below
                }
              }
            } else {
              // Magnet seed: can restore directly
              if (sessionEntry.magnetURI) {
                console.log(`   Restoring ${sessionInfoHash} from magnet (${sessionEntry.seedingType})...`);
                // Fall through to magnet restoration below
              }
            }
          }
          
          // Then restore from magnet links (for backward compatibility)
          // Process magnets that weren't already restored from session list
          // (processedInfoHashes was already created above)
          // Also add session list infoHashes to processed set
          for (const sessionEntry of sessionList) {
            const sessionInfoHash = sessionEntry.infoHash?.toLowerCase();
            if (sessionInfoHash) {
              processedInfoHashes.add(sessionInfoHash);
            }
          }
          
          for (const magnet of magnets) {
            if (!magnet.trim()) continue;
            const match = magnet.match(/btih:([a-f0-9]+)/i);
            if (match) {
              const infoHash = match[1].toLowerCase();
              
              // Skip if already processed from session list
              if (processedInfoHashes.has(infoHash)) {
                console.log(`⏭️ Skipping magnet ${infoHash} - already processed from session list`);
                continue;
              }
              
              // If torrent was stopped, it's already removed from localStorage, so it won't be here
              // But check if it still exists in client (cleanup)
              const existingInClient = client.get(infoHash);
              if (existingInClient && !existingInClient.destroyed) {
                // This shouldn't happen if cleanup worked, but just in case
                const allTorrents = client.torrents || [];
                const found = allTorrents.find((t: any) => {
                  const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                  return tHash && tHash.toLowerCase() === infoHash.toLowerCase();
                });
                // If it exists in client but not in localStorage, it means it was stopped
                // Check session list to confirm
                const sessionListKey = 'webtorrent_session_list';
                const sessionList: any[] = JSON.parse(localStorage.getItem(sessionListKey) || '[]');
                const inSession = sessionList.some((item: any) => 
                  item.infoHash?.toLowerCase() === infoHash.toLowerCase()
                );
                const inMagnets = magnets.some((mag: string) => {
                  const match = mag.match(/btih:([a-f0-9]+)/i);
                  return match && match[1].toLowerCase() === infoHash.toLowerCase();
                });
                
                if (!inSession && !inMagnets && found) {
                  // Torrent exists in client but not in localStorage - it was stopped, destroy it
                  console.log(`🧹 Cleaning up orphaned torrent in client: ${infoHash} (was stopped but still in client)`);
                  try {
                    if (typeof found.destroy === 'function') {
                      found.destroy();
                    }
                  } catch (e) {
                    console.error('Error destroying orphaned torrent:', e);
                  }
                  restorationCount++;
                  continue;
                }
              }
              
              // Try to get existing torrent from client
              let existing = client.get(infoHash);
              
              // Check if existing torrent is valid (has event emitter methods)
              let isValidTorrent = existing && 
                !existing.destroyed && 
                typeof existing.on === 'function' &&
                typeof existing.off === 'function';
              
              // If not found or invalid, check if it's in client.torrents array (might not be in index)
              if (!existing || existing.destroyed || !isValidTorrent) {
                // If it exists but is invalid, destroy it first
                if (existing && !existing.destroyed && !isValidTorrent) {
                  console.log(`Removing invalid torrent ${infoHash} from client (missing event methods)`);
                  try {
                    if (typeof existing.destroy === 'function') {
                      existing.destroy();
                    }
                  } catch (e) {
                    console.error('Error destroying invalid torrent:', e);
                  }
                  existing = null;
                }
                
                // Check client.torrents array directly
                // Check client.torrents array directly
                const allTorrents = client.torrents || [];
                const foundInArray = allTorrents.find((t: any) => {
                  const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                  return tHash && tHash.toLowerCase() === infoHash.toLowerCase();
                });
                
                const isValidInArray = foundInArray && 
                  !foundInArray.destroyed && 
                  typeof foundInArray.on === 'function' &&
                  typeof foundInArray.off === 'function';
                
                if (isValidInArray) {
                  console.log(`✅ Found valid torrent ${infoHash} in client.torrents array, using it`);
                  existing = foundInArray;
                } else {
                  if (foundInArray) {
                    console.log(`⚠️ Found torrent ${infoHash} in array but it's invalid (destroyed or missing methods), will re-add`);
                    try {
                      if (typeof foundInArray.destroy === 'function' && !foundInArray.destroyed) {
                        foundInArray.destroy();
                      }
                    } catch (e) {
                      console.error('Error destroying invalid torrent from array:', e);
                    }
                  }
                  console.log(`Torrent ${infoHash} not found in client, re-adding from magnet...`);
                  console.log(`Note: For direct file seeds, you may need to manually re-add files in the seeding section below.`);
                  
                  // Try to restore saved metadata
                  const metadataKey = `webtorrent_metadata_${infoHash}`;
                  let savedMetadata: any = null;
                  try {
                    const metadataStr = localStorage.getItem(metadataKey);
                    if (metadataStr) {
                      savedMetadata = JSON.parse(metadataStr);
                      console.log(`Found saved metadata for ${infoHash}:`, savedMetadata);
                    }
                  } catch (e) {
                    console.warn('Failed to load saved metadata:', e);
                  }
                  
                  try {
                    // Final check before adding - torrent might have been added during processing
                    const finalCheck = client.get(infoHash);
                    if (finalCheck && !finalCheck.destroyed && typeof finalCheck.on === 'function') {
                      console.log(`✅ Torrent ${infoHash} already exists in client, using existing instead of adding from magnet`);
                      setSeedingTorrents((prev) => {
                        const exists = prev.find(t => {
                          const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                          return tHash && tHash.toLowerCase() === infoHash.toLowerCase();
                        });
                        if (exists) return prev;
                        return [...prev, finalCheck];
                      });
                      restorationCount++;
                      continue;
                    }
                    
                    console.log(`Attempting to restore torrent ${infoHash} from magnet: ${magnet.substring(0, 50)}...`);
                    
                    client.add(magnet, { announce: DEFAULT_TRACKERS }, (torrent: any) => {
                      const restoredInfoHash = torrent.infoHash?.toString?.('hex') || torrent.infoHash;
                      console.log(`✅ Successfully restored torrent from magnet: ${restoredInfoHash}`);
                      
                      // Always add to state immediately, even if files aren't loaded yet
                      // This allows UI to show the torrent is being restored
                      setSeedingTorrents((prev) => {
                        const exists = prev.find(t => {
                          const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                          return tHash && tHash.toLowerCase() === restoredInfoHash.toLowerCase();
                        });
                        if (exists) {
                          console.log(`Torrent ${restoredInfoHash} already in state, skipping duplicate add`);
                          return prev;
                        }
                        return [...prev, torrent];
                      });
                      
                      // Set up listeners immediately
                      const updatePeerStats = () => {
                        const client = (window as any).__webtorrentClient;
                        if (client) {
                          const torrents = client.torrents || [];
                          const newPeerStats: Record<string, { peers: number; downloadSpeed: number; uploadSpeed: number; seeders: number; downloaders: number }> = {};
                          
                          const peerHasPieces = (w: any) => {
                            if (!w || !w.peerPieces) return false;
                            if (Array.isArray(w.peerPieces)) return w.peerPieces.length > 0;
                            if (typeof w.peerPieces === 'object') {
                              if (w.peerPieces.length !== undefined) return w.peerPieces.length > 0;
                              if (Object.keys(w.peerPieces).length > 0) return true;
                              try {
                                if (typeof w.peerPieces.count === 'function') return w.peerPieces.count() > 0;
                                if (typeof w.peerPieces.toString === 'function') {
                                  return w.peerPieces.toString().includes('1');
                                }
                              } catch (e) {}
                            }
                            if (typeof w.peerPieces === 'number') return w.peerPieces > 0;
                            return false;
                          };
                          
                          torrents.forEach((t: any) => {
                            if (t && !t.destroyed) {
                              const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                              const wires = t.wires || [];
                              const seeders = wires.filter(peerHasPieces).length;
                              const downloaders = wires.filter((w: any) => !peerHasPieces(w) || (w.uploaded && w.uploaded > 0)).length;
                              newPeerStats[tHash] = {
                                peers: t.numPeers || wires.length || 0,
                                downloadSpeed: t.downloadSpeed || 0,
                                uploadSpeed: t.uploadSpeed || 0,
                                seeders,
                                downloaders
                              };
                            }
                          });
                          setPeerStats(newPeerStats);
                          setStatsUpdateCounter(prev => prev + 1);
                        }
                      };
                      
                      if (typeof torrent.on === 'function') {
                        torrent.on('wire', () => {
                          console.log(`Peer connected to restored torrent ${restoredInfoHash}`);
                          updatePeerStats();
                        });
                        torrent.on('noPeers', () => {
                          console.log(`No peers for restored torrent ${restoredInfoHash} - this is normal if no one is seeding`);
                          updatePeerStats();
                        });
                        torrent.on('download', () => updatePeerStats());
                        torrent.on('upload', () => {
                          console.log(`Uploading data for restored torrent ${restoredInfoHash} - seeding is working!`);
                          updatePeerStats();
                        });
                        torrent.on('metadata', () => {
                          console.log(`Metadata received for restored torrent ${restoredInfoHash}, files:`, torrent.files?.length || 0);
                          updatePeerStats();
                          // Update state again once metadata is available
                          setSeedingTorrents((prev) => {
                            return prev.map(t => {
                              const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                              return tHash === restoredInfoHash ? torrent : t;
                            });
                          });
                        });
                        
                        const interval = setInterval(() => updatePeerStats(), 500);
                        torrent.on('destroy', () => {
                          clearInterval(interval);
                          updatePeerStats();
                        });
                        
                        // Initial stats update
                        updatePeerStats();
                      }
                      
                      // Log torrent status
                      torrent.on('ready', () => {
                        console.log(`Restored torrent ${restoredInfoHash} is ready`, {
                          name: torrent.name || 'Unknown',
                          length: torrent.length || 0,
                          filesCount: torrent.files?.length || 0,
                          done: torrent.done,
                          numPeers: torrent.numPeers || 0
                        });
                        updatePeerStats();
                        
                        // If torrent is done (fully downloaded), it means we can seed it
                        if (torrent.done) {
                          console.log(`✅ Restored torrent ${restoredInfoHash} is complete and ready to seed!`);
                        }
                      });
                      
                      // Log if torrent gets data from peers (someone else is seeding it)
                      torrent.on('download', (bytes: number) => {
                        if (bytes > 0) {
                          console.log(`📥 Restored torrent ${restoredInfoHash} downloading from peers (${bytes} bytes)`);
                        }
                      });
                      
                      torrent.on('error', (err: any) => {
                        // Handle duplicate torrent errors gracefully
                        if (err?.message?.includes('duplicate torrent') || err?.message?.includes('Cannot add duplicate')) {
                          console.log(`⚠️ Torrent ${restoredInfoHash} is already in client (duplicate detected in error handler), using existing one`);
                          const existing = client.get(infoHash);
                          if (existing && !existing.destroyed && typeof existing.on === 'function') {
                            setSeedingTorrents((prev) => {
                              const exists = prev.find(t => {
                                const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                                return tHash && tHash.toLowerCase() === infoHash.toLowerCase();
                              });
                              if (exists) return prev;
                              return [...prev, existing];
                            });
                            restorationCount++;
                          }
                        } else {
                          console.error(`❌ Error with restored torrent ${restoredInfoHash}:`, err);
                        }
                      });
                      
                      // Initial update
                      updatePeerStats();
                    }).on('error', (err: any) => {
                      // Handle duplicate torrent errors gracefully
                      if (err?.message?.includes('duplicate torrent') || err?.message?.includes('Cannot add duplicate')) {
                        console.log(`⚠️ Torrent ${infoHash} is already in client (duplicate), using existing one`);
                        const existing = client.get(infoHash);
                        if (existing && !existing.destroyed && typeof existing.on === 'function') {
                          setSeedingTorrents((prev) => {
                            const exists = prev.find(t => {
                              const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                              return tHash && tHash.toLowerCase() === infoHash.toLowerCase();
                            });
                            if (exists) return prev;
                            return [...prev, existing];
                          });
                          restorationCount++;
                        }
                      } else {
                        console.error(`❌ Failed to restore torrent from magnet ${infoHash}:`, err);
                        console.error('Error details:', {
                          message: err.message,
                          stack: err.stack,
                          magnet: magnet.substring(0, 100)
                        });
                      }
                    });
                  } catch (err) {
                    console.error(`Error re-adding torrent ${infoHash}:`, err);
                    console.error('Restoration error details:', err);
                  }
                  restorationCount++;
                }
                continue;
              }
              
              // At this point, existing should be set (either from client.get or from array)
              // Re-check validity now that existing might have been updated
              isValidTorrent = existing && 
                !existing.destroyed && 
                typeof existing.on === 'function' &&
                typeof existing.off === 'function';
              
              // Verify that existing is a valid torrent object with event emitter methods
              if (isValidTorrent) {
                console.log(`✅ Found valid existing torrent ${infoHash} in client, restoring to state`);
                
                // Wait for torrent to be ready if not already
                const addToState = () => {
                  // Try to get saved metadata as fallback
                  const metadataKey = `webtorrent_metadata_${infoHash}`;
                  let savedMetadata: any = null;
                  try {
                    const metadataStr = localStorage.getItem(metadataKey);
                    if (metadataStr) {
                      savedMetadata = JSON.parse(metadataStr);
                    }
                  } catch (e) {
                    // Ignore
                  }
                  
                  // Verify torrent has valid length
                  let torrentLength = existing.length || 0;
                  if (isNaN(torrentLength) || torrentLength === 0) {
                    // Try calculating from files
                    if (existing.files && existing.files.length > 0) {
                      torrentLength = existing.files.reduce((sum: number, f: any) => sum + (f.length || 0), 0);
                      console.log(`Calculated length from files: ${torrentLength} bytes`);
                    } else if (savedMetadata && savedMetadata.totalSize) {
                      torrentLength = savedMetadata.totalSize;
                      console.log(`Using saved metadata size: ${torrentLength} bytes`);
                    }
                  }
                  
                  // Only add if we have valid data or saved metadata
                  if (torrentLength > 0 || savedMetadata || (existing.files && existing.files.length > 0)) {
                    console.log(`Adding existing torrent ${infoHash} to state, length: ${torrentLength}`);
                    setSeedingTorrents((prev) => {
                      if (prev.find(t => {
                        const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                        return tHash === infoHash;
                      })) return prev;
                      return [...prev, existing];
                    });
                  } else {
                    console.warn(`Torrent ${infoHash} has no valid data, waiting for metadata...`);
                    // Wait a bit for metadata
                    setTimeout(() => {
                      if (existing && !existing.destroyed) {
                        const finalLength = existing.length || (existing.files ? existing.files.reduce((sum: number, f: any) => sum + (f.length || 0), 0) : 0);
                        if (finalLength > 0 || (existing.files && existing.files.length > 0)) {
                          console.log(`Torrent ${infoHash} now has data, adding to state`);
                          setSeedingTorrents((prev) => {
                            if (prev.find(t => {
                              const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                              return tHash === infoHash;
                            })) return prev;
                            return [...prev, existing];
                          });
                        }
                      }
                    }, 3000);
                  }
                };
                
                // If torrent is ready, add immediately; otherwise wait
                if (existing.ready) {
                  addToState();
                } else {
                  existing.once('ready', () => {
                    console.log(`Existing torrent ${infoHash} became ready`);
                    addToState();
                  });
                  // Also listen for metadata event
                  existing.once('metadata', () => {
                    console.log(`Metadata received for existing torrent ${infoHash}`);
                    addToState();
                  });
                }
                
                // Reattach listeners
                const updatePeerStats = () => {
                  const client = (window as any).__webtorrentClient;
                  if (client) {
                    const torrents = client.torrents || [];
                    const newPeerStats: Record<string, { peers: number; downloadSpeed: number; uploadSpeed: number; seeders: number; downloaders: number }> = {};
                    
                    const peerHasPieces = (w: any) => {
                      if (!w || !w.peerPieces) return false;
                      if (Array.isArray(w.peerPieces)) return w.peerPieces.length > 0;
                      if (typeof w.peerPieces === 'object') {
                        if (w.peerPieces.length !== undefined) return w.peerPieces.length > 0;
                        if (Object.keys(w.peerPieces).length > 0) return true;
                        try {
                          if (typeof w.peerPieces.count === 'function') return w.peerPieces.count() > 0;
                          if (typeof w.peerPieces.toString === 'function') {
                            return w.peerPieces.toString().includes('1');
                          }
                        } catch (e) {}
                      }
                      if (typeof w.peerPieces === 'number') return w.peerPieces > 0;
                      return false;
                    };
                    
                    torrents.forEach((t: any) => {
                      if (t && !t.destroyed) {
                        const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                        const wires = t.wires || [];
                        const seeders = wires.filter(peerHasPieces).length;
                        const downloaders = wires.filter((w: any) => !peerHasPieces(w) || (w.uploaded && w.uploaded > 0)).length;
                        newPeerStats[tHash] = {
                          peers: t.numPeers || wires.length || 0,
                          downloadSpeed: t.downloadSpeed || 0,
                          uploadSpeed: t.uploadSpeed || 0,
                          seeders,
                          downloaders
                        };
                      }
                    });
                    setPeerStats(newPeerStats);
                    setStatsUpdateCounter(prev => prev + 1);
                  }
                };
                
                // Only attach listeners if the torrent has the on method
                if (typeof existing.on === 'function') {
                  existing.on('wire', () => updatePeerStats());
                  existing.on('noPeers', () => updatePeerStats());
                  existing.on('download', () => updatePeerStats());
                  existing.on('upload', () => updatePeerStats());
                  
                  const interval = setInterval(() => updatePeerStats(), 500);
                  
                  if (typeof existing.on === 'function') {
                    existing.on('destroy', () => clearInterval(interval));
                  }
                  
                  updatePeerStats();
                }
              } else {
                // Torrent exists but doesn't have valid event methods or is destroyed
                // Destroy it and re-add from magnet (fall through to re-add logic)
                console.warn(`⚠️ Torrent ${infoHash} exists but is invalid (destroyed or missing event methods). Destroying and re-adding from magnet.`);
                
                // Try to destroy invalid torrent
                if (existing && typeof existing.destroy === 'function' && !existing.destroyed) {
                  try {
                    existing.destroy();
                    console.log(`✅ Destroyed invalid torrent ${infoHash}`);
                  } catch (e) {
                    console.error('Error destroying invalid torrent:', e);
                  }
                }
                
                // Clear existing so we fall through to the re-add logic
                existing = null;
                
                // Fall through to re-add from magnet (the else block below will handle it)
                // Don't continue here - we want to execute the re-add logic
              }
              
              // If existing is still null or invalid at this point, re-add from magnet
              if (!existing || existing.destroyed || !isValidTorrent) {
                console.log(`Torrent ${infoHash} not found in client or invalid, re-adding from magnet...`);
                
                // Try to restore saved metadata
                const metadataKey = `webtorrent_metadata_${infoHash}`;
                let savedMetadata: any = null;
                try {
                  const metadataStr = localStorage.getItem(metadataKey);
                  if (metadataStr) {
                    savedMetadata = JSON.parse(metadataStr);
                    console.log(`Found saved metadata for ${infoHash}:`, savedMetadata);
                  }
                } catch (e) {
                  console.warn('Failed to load saved metadata:', e);
                }
                
                try {
                  console.log(`Attempting to restore torrent ${infoHash} from magnet: ${magnet.substring(0, 50)}...`);
                  
                  let callbackFired = false;
                  let torrentAdded = false;
                  
                  // Add timeout to detect if callback never fires and check client.torrents as fallback
                  const restoreTimeout = setTimeout(() => {
                    if (!callbackFired) {
                      console.warn(`⚠️ Restoration callback for ${infoHash} hasn't fired after 5 seconds. Checking if torrent was added anyway...`);
                      // Check if torrent was added to client even if callback didn't fire
                      const allTorrents = client.torrents || [];
                      const found = allTorrents.find((t: any) => {
                        const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                        return tHash && tHash.toLowerCase() === infoHash.toLowerCase();
                      });
                      
                      if (found && !found.destroyed) {
                        console.log(`✅ Found torrent ${infoHash} in client even though callback didn't fire. Adding to state.`);
                        setSeedingTorrents((prev) => {
                          const exists = prev.find(t => {
                            const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                            return tHash === infoHash.toLowerCase();
                          });
                          if (exists) return prev;
                          return [...prev, found];
                        });
                        restorationCount++;
                        torrentAdded = true;
                      } else {
                        console.warn(`⚠️ Torrent ${infoHash} not found in client after 5 seconds. It may be waiting for tracker connection or peers.`);
                      }
                    }
                  }, 5000);
                  
                  client.add(magnet, { announce: DEFAULT_TRACKERS }, (torrent: any) => {
                    callbackFired = true;
                    clearTimeout(restoreTimeout);
                    const restoredInfoHash = torrent.infoHash?.toString?.('hex') || torrent.infoHash;
                    console.log(`✅ Successfully restored torrent: ${restoredInfoHash}`);
                    console.log('Torrent details:', {
                      name: torrent.name || 'Unknown',
                      length: torrent.length || 0,
                      filesCount: torrent.files?.length || 0,
                      ready: torrent.ready,
                      done: torrent.done
                    });
                    
                    // Always add to state immediately, even if files aren't loaded yet
                    setSeedingTorrents((prev) => {
                      const exists = prev.find(t => {
                        const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                        return tHash === restoredInfoHash;
                      });
                      if (exists) {
                        console.log(`Torrent ${restoredInfoHash} already in state, skipping duplicate add`);
                        return prev;
                      }
                      console.log(`Adding torrent ${restoredInfoHash} to seeding state`);
                      return [...prev, torrent];
                    });
                    
                    restorationCount++;
                    
                    // Set up listeners immediately
                    const updatePeerStats = () => {
                      const client = (window as any).__webtorrentClient;
                      if (client) {
                        const torrents = client.torrents || [];
                        const newPeerStats: Record<string, { peers: number; downloadSpeed: number; uploadSpeed: number; seeders: number; downloaders: number }> = {};
                        
                        const peerHasPieces = (w: any) => {
                          if (!w || !w.peerPieces) return false;
                          if (Array.isArray(w.peerPieces)) return w.peerPieces.length > 0;
                          if (typeof w.peerPieces === 'object') {
                            if (w.peerPieces.length !== undefined) return w.peerPieces.length > 0;
                            if (Object.keys(w.peerPieces).length > 0) return true;
                            try {
                              if (typeof w.peerPieces.count === 'function') return w.peerPieces.count() > 0;
                              if (typeof w.peerPieces.toString === 'function') {
                                return w.peerPieces.toString().includes('1');
                              }
                            } catch (e) {}
                          }
                          if (typeof w.peerPieces === 'number') return w.peerPieces > 0;
                          return false;
                        };
                        
                        torrents.forEach((t: any) => {
                          if (t && !t.destroyed) {
                            const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                            const wires = t.wires || [];
                            const seeders = wires.filter(peerHasPieces).length;
                            const downloaders = wires.filter((w: any) => !peerHasPieces(w) || (w.uploaded && w.uploaded > 0)).length;
                            newPeerStats[tHash] = {
                              peers: t.numPeers || wires.length || 0,
                              downloadSpeed: t.downloadSpeed || 0,
                              uploadSpeed: t.uploadSpeed || 0,
                              seeders,
                              downloaders
                            };
                          }
                        });
                        setPeerStats(newPeerStats);
                        setStatsUpdateCounter(prev => prev + 1);
                      }
                    };
                    
                    if (typeof torrent.on === 'function') {
                      torrent.on('wire', () => {
                        console.log(`Peer connected to restored torrent ${restoredInfoHash}`);
                        updatePeerStats();
                      });
                      torrent.on('noPeers', () => {
                        console.log(`No peers for restored torrent ${restoredInfoHash} - this is normal if no one is seeding`);
                        updatePeerStats();
                      });
                      torrent.on('download', () => updatePeerStats());
                      torrent.on('upload', () => {
                        console.log(`Uploading data for restored torrent ${restoredInfoHash} - seeding is working!`);
                        updatePeerStats();
                      });
                      torrent.on('metadata', () => {
                        console.log(`Metadata received for restored torrent ${restoredInfoHash}, files:`, torrent.files?.length || 0);
                        updatePeerStats();
                        setSeedingTorrents((prev) => {
                          return prev.map(t => {
                            const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                            return tHash === restoredInfoHash ? torrent : t;
                          });
                        });
                      });
                      
                      const interval = setInterval(() => updatePeerStats(), 500);
                      torrent.on('destroy', () => {
                        clearInterval(interval);
                        updatePeerStats();
                      });
                      
                      torrent.on('ready', () => {
                        console.log(`Restored torrent ${restoredInfoHash} is ready`, {
                          name: torrent.name || 'Unknown',
                          length: torrent.length || 0,
                          filesCount: torrent.files?.length || 0,
                          done: torrent.done,
                          numPeers: torrent.numPeers || 0
                        });
                        updatePeerStats();
                        if (torrent.done) {
                          console.log(`✅ Restored torrent ${restoredInfoHash} is complete and ready to seed!`);
                        }
                      });
                      
                      torrent.on('download', (bytes: number) => {
                        if (bytes > 0) {
                          console.log(`📥 Restored torrent ${restoredInfoHash} downloading from peers (${bytes} bytes)`);
                        }
                      });
                      
                      torrent.on('error', (err: any) => {
                        console.error(`❌ Error with restored torrent ${restoredInfoHash}:`, err);
                      });
                      
                      updatePeerStats();
                    }
                  }).on('error', (err: any) => {
                    clearTimeout(restoreTimeout);
                    console.error(`❌ Failed to restore torrent from magnet ${infoHash}:`, err);
                    console.error('Error details:', {
                      message: err.message,
                      stack: err.stack,
                      magnet: magnet.substring(0, 100)
                    });
                    restorationCount++;
                  });
                  
                  // Note: restorationCount will be incremented in the callback or error handler
                  // Don't increment here because the callback is async
                } catch (err) {
                  console.error(`Error re-adding torrent ${infoHash}:`, err);
                  restorationCount++;
                }
              }
            }
          }
          
          console.log(`✅ Completed restoration attempt for ${restorationCount} torrent(s) from localStorage`);
        } else {
          console.log('No magnet links found in localStorage - nothing to restore on reload');
        }
      } catch (e) {
        console.error('❌ Failed to restore seeding torrents:', e);
        console.error('Error stack:', e instanceof Error ? e.stack : 'No stack trace');
      }
    };
    
    console.log('🔄 Starting seeding torrent restoration on page mount...');
    restoreSeedingTorrents();
  }, []);

  const handleCreate = async () => {
    if (files.length === 0) return;
    setStatus('Creating torrent...');
    // Get current userId from Supabase
    const { user, error } = await AuthService.getCurrentUser();
    if (!user || error) {
      setStatus('You must be signed in to share a file.');
      showToast('You must be signed in to share a file', 'warning');
      return;
    }
    const userId = user.id;
    if (!userId) {
      setStatus('Could not determine user ID.');
      showToast('Could not determine user ID', 'error');
      return;
    }
    // Generate .torrent file using create-torrent
    // create-torrent can handle single file, array of files, or FileList
    const DEFAULT_TRACKERS = [
      'wss://tracker.openwebtorrent.com',
      'wss://tracker.btorrent.xyz',
      'wss://tracker.fastcast.nz'
    ];
    // Use first file's name or folder name for torrent name
    const torrentName = files.length === 1 
      ? files[0].name 
      : (name.trim() || files[0]?.webkitRelativePath?.split('/')[0] || 'folder');
    
    // create-torrent accepts single file or array of files
    const filesToTorrent = files.length === 1 ? files[0] : Array.from(files);
    
    // Log file information before creating torrent
    console.log('=== TORRENT CREATION START ===');
    console.log('Files to create torrent from:', files.length);
    console.log('File details:', files.map((f, i) => ({
      index: i + 1,
      name: f.name,
      size: f.size,
      sizeMB: `${(f.size / 1024 / 1024).toFixed(2)} MB`,
      type: f.type,
      lastModified: new Date(f.lastModified).toISOString(),
      webkitRelativePath: f.webkitRelativePath || 'N/A'
    })));
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    console.log(`Total size: ${totalSize} bytes (${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
    
    // Warn user if files are suspiciously small (but don't show toast - just log)
    if (totalSize < 1024 && files.length > 0) {
      console.warn('⚠️ WARNING: Total file size is very small (< 1 KB). This might indicate empty files or a selection issue.');
      // Still proceed with creation
    }
    
    createTorrent(filesToTorrent, { 
      announceList: [DEFAULT_TRACKERS],
      name: torrentName
    }, async (err: any, torrentBuf: Buffer) => {
      if (err || !torrentBuf) {
        setStatus('Failed to create .torrent file');
        showToast('Failed to create .torrent file', 'error');
        setTorrentFileUrl(null);
        return;
      }
      // Ensure the Blob is the .torrent file, not the original file
      const uint8 = Uint8Array.from(torrentBuf as any);
      const torrentBlob = new Blob([uint8], { type: 'application/x-bittorrent' });
      const torrentFileSaveName = files.length === 1 
        ? `${files[0].name}.torrent` 
        : `${torrentName}.torrent`;
      const torrentFileObj = new File([torrentBlob], torrentFileSaveName, { type: "application/x-bittorrent" });
      
      // Upload .torrent file to Supabase Storage
      let publicTorrentUrl: string | null = null;
      try {
        publicTorrentUrl = await uploadTorrentToSupabaseStorage(torrentFileObj, userId);
      } catch (e) {
        console.error("Failed to upload .torrent to Supabase Storage", e);
        alert("Failed to upload .torrent file. Please try again.");
        return;
      }
      setTorrentFileUrl(publicTorrentUrl);
      
      // Generate magnet link from torrent file (without seeding)
      // Parse the torrent buffer to extract infoHash
      let parsed: any;
      try {
        // @ts-ignore
        const parseTorrentModule = await import('parse-torrent');
        // parse-torrent exports a default function
        const parseTorrent = parseTorrentModule.default || parseTorrentModule;
        
        // Ensure torrentBuf is a proper Buffer
        // create-torrent returns a Buffer, but let's make sure it's in the right format
        let torrentBuffer: Buffer;
        if (Buffer.isBuffer(torrentBuf)) {
          torrentBuffer = torrentBuf;
        } else {
          // Convert using Buffer.from which handles various types
          torrentBuffer = Buffer.from(torrentBuf as any);
        }
        
        parsed = parseTorrent(torrentBuffer);
        
        // Check if parseTorrent returns a Promise
        if (parsed && typeof parsed.then === 'function') {
          parsed = await parsed;
        }
        
        const originalTotalSize = files.reduce((sum, f) => sum + f.size, 0);
        const parsedTotalSize = parsed.length || (parsed.files ? parsed.files.reduce((sum: number, f: any) => sum + (f.length || 0), 0) : 0);
        
        console.log('Parsed torrent metadata:', {
          infoHash: parsed.infoHash ? (Buffer.isBuffer(parsed.infoHash) ? parsed.infoHash.toString('hex') : parsed.infoHash) : 'N/A',
          name: parsed.name,
          length: parsed.length || 0,
          lengthMB: parsed.length ? `${(parsed.length / 1024 / 1024).toFixed(2)} MB` : '0 MB',
          files: parsed.files ? parsed.files.map((f: any) => ({
            name: f.name || f.path || 'Unknown',
            length: f.length || 0,
            lengthMB: f.length ? `${(f.length / 1024 / 1024).toFixed(2)} MB` : '0 MB',
            path: f.path || 'N/A'
          })) : [],
          filesCount: parsed.files?.length || 0,
          originalTotalSize: originalTotalSize,
          parsedTotalSize: parsedTotalSize,
          sizeMatch: originalTotalSize === parsedTotalSize ? '✅ Match' : '⚠️ Mismatch'
        });
        
        if (Math.abs(originalTotalSize - parsedTotalSize) > 100) {
          console.warn('⚠️ SIZE MISMATCH WARNING:', {
            original: `${originalTotalSize} bytes`,
            parsed: `${parsedTotalSize} bytes`,
            difference: `${Math.abs(originalTotalSize - parsedTotalSize)} bytes`
          });
          setStatus(`Warning: File size mismatch detected. Original: ${(originalTotalSize / 1024).toFixed(2)} KB, Torrent: ${(parsedTotalSize / 1024).toFixed(2)} KB`);
          showToast('File size mismatch detected', 'warning');
        }
        console.log('Full parsed torrent object:', parsed);
      } catch (parseErr) {
        console.error('Error parsing torrent:', parseErr);
        setStatus('Failed to parse torrent file');
        showToast('Failed to parse torrent file', 'error');
        return;
      }
      
      // Build magnet URI manually since we have the info
      let infoHash: string;
      if (parsed && parsed.infoHash) {
        if (Buffer.isBuffer(parsed.infoHash)) {
          infoHash = parsed.infoHash.toString('hex');
        } else if (typeof parsed.infoHash === 'string') {
          infoHash = parsed.infoHash;
        } else {
          infoHash = parsed.infoHash.toString('hex');
        }
      } else {
        console.error('Parsed torrent missing infoHash:', parsed);
        setStatus('Failed to parse torrent infoHash');
        showToast('Failed to parse torrent infoHash', 'error');
        return;
      }
      const torrentFileName = (parsed.name || torrentName);
      const trackers = DEFAULT_TRACKERS.map(t => `tr=${encodeURIComponent(t)}`).join('&');
      const magnetURI = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(torrentFileName)}&${trackers}`;
      
      setMagnet(magnetURI);
      const fileCountText = files.length === 1 ? 'file' : `${files.length} files`;
      
      // Register file on blockchain if wallet is connected
      if (wallet.isConnected && wallet.address) {
        try {
          setIsRegistering(true);
          setStatus('Registering file on blockchain...');
          const fileNameToRegister = name && name.trim() ? name : (files.length === 1 
            ? (files[0].name ? files[0].name.replace(/\.[^/.]+$/, '') : 'file')
            : torrentName);
          
          // Use infoHash as contentHash
          const contentHash = infoHash;
          
          const registrationResult = await registerFileOnChain(
            fileNameToRegister,
            magnetURI,
            contentHash
          );
          
          console.log('✅ File registered on blockchain:', registrationResult);
          setStatus(`File registered on-chain! TX: ${registrationResult.txHash.substring(0, 10)}...`);
          showToast('File successfully registered on blockchain', 'success');
        } catch (error: any) {
          // Handle contract not configured error gracefully
          if (error.message?.includes('contract address not configured') || 
              error.message?.includes('NEXT_PUBLIC_REGISTRY_ADDRESS')) {
            console.info('Blockchain contracts not configured - torrent created successfully without on-chain registration');
            showToast('Torrent created! Blockchain registration skipped (contracts not configured). See BLOCKCHAIN_SETUP.md to enable.', 'info');
            setStatus('Torrent created (blockchain registration skipped - contracts not configured)');
          } else if (error.message?.includes('Wrong network') || error.message?.includes('switch to Sepolia')) {
            console.warn('Wrong network detected - user needs to switch to Sepolia');
            setStatus('Please switch to Sepolia testnet in MetaMask to register on blockchain');
            showToast('Wrong network! Please switch to Sepolia testnet (Chain ID: 11155111) in MetaMask to register files on blockchain.', 'warning');
            // Try to switch network automatically
            try {
              if (typeof window !== 'undefined' && (window as any).ethereum) {
                await (window as any).ethereum.request({
                  method: 'wallet_switchEthereumChain',
                  params: [{ chainId: '0xaa36a7' }], // Sepolia chain ID in hex
                });
                showToast('Switched to Sepolia! Please try registering again.', 'success');
              }
            } catch (switchError: any) {
              // If Sepolia network is not added, try to add it
              if (switchError.code === 4902) {
                try {
                  await (window as any).ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                      chainId: '0xaa36a7',
                      chainName: 'Sepolia',
                      nativeCurrency: {
                        name: 'ETH',
                        symbol: 'ETH',
                        decimals: 18
                      },
                      rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
                      blockExplorerUrls: ['https://sepolia.etherscan.io']
                    }]
                  });
                  showToast('Sepolia network added! Please try registering again.', 'success');
                } catch (addError) {
                  console.error('Failed to add Sepolia network:', addError);
                }
              } else if (switchError.code === 4001) {
                showToast('Network switch cancelled. Please switch to Sepolia manually in MetaMask.', 'warning');
              }
            }
          } else if (error.message?.includes('already registered')) {
            setStatus('File already registered on-chain');
            showToast('File already registered on blockchain', 'info');
          } else if (error.message?.includes('user rejected') || error.code === 4001) {
            setStatus('Blockchain registration cancelled');
            showToast('Blockchain registration cancelled', 'warning');
          } else {
            console.error('Failed to register file on blockchain:', error);
            setStatus('Failed to register on blockchain (torrent still created)');
            showToast('Failed to register on blockchain (torrent still works)', 'warning');
          }
        } finally {
          setIsRegistering(false);
        }
      } else {
        console.log('Wallet not connected - skipping blockchain registration');
      }
      
      // Save to MongoDB via API
      try {
        const res = await fetch('/api/torrents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name && name.trim() ? name : (files.length === 1 
              ? (files[0].name ? files[0].name.replace(/\.[^/.]+$/, '') : 'file')
              : torrentName),
            magnetURI: magnetURI,
            torrentFileUrl: publicTorrentUrl,
            userId,
          }),
        });
        if (!res.ok) {
          setStatus('Torrent created, but failed to save to database.');
          showToast('Torrent created, but failed to save to database', 'warning');
        }
      } catch (e) {
        setStatus('Torrent created, but error saving to database.');
        showToast('Torrent created, but error saving to database', 'warning');
      }
      
        // Automatically start seeding the files
        try {
          const client = await getWebTorrentClient();
          console.log('=== AUTOMATIC SEEDING START ===');
          console.log(`Starting to seed ${files.length} file(s):`, files.map(f => f.name));
          
          // Check if a torrent with this infoHash already exists
          // (might be from a previous upload or restoration)
          // CRITICAL: If WebTorrent finds an existing torrent with the same infoHash,
          // it will return that instance instead of creating a new one with our files.
          // If that existing torrent has no files (was restored from magnet), we need to destroy it first.
          const existingTorrentInfoHash = infoHash.toLowerCase();
          let existingTorrent = null;
          try {
            existingTorrent = client.get(existingTorrentInfoHash);
            if (existingTorrent && !existingTorrent.destroyed) {
              console.log(`⚠️ Found existing torrent with same infoHash: ${existingTorrentInfoHash}`);
              console.log('Existing torrent state:', {
                name: existingTorrent.name,
                length: existingTorrent.length,
                filesCount: existingTorrent.files?.length || 0,
                ready: existingTorrent.ready,
                done: existingTorrent.done
              });
              
              // ALWAYS destroy existing torrent if it has no files (was restored from magnet)
              // OR if it has fewer files than what we're trying to seed
              const existingFilesCount = existingTorrent.files?.length || 0;
              if (existingFilesCount === 0 || existingFilesCount < files.length) {
                console.log(`🗑️ Existing torrent has ${existingFilesCount} files (we're seeding ${files.length}), removing it to re-seed with actual files...`);
                try {
                  // First, verify the torrent actually exists in the client
                  // Check both client.get() and client.torrents array
                  const verifyExists = client.get(existingTorrentInfoHash);
                  const verifyInArray = client.torrents?.find((t: any) => {
                    const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                    return tHash && tHash.toLowerCase() === existingTorrentInfoHash.toLowerCase();
                  });
                  
                  if ((!verifyExists || verifyExists.destroyed) && !verifyInArray) {
                    console.log('ℹ️ Torrent already removed or not in client, proceeding to seed...');
                    existingTorrent = null;
                  } else {
                    // Use client.remove() as the primary method (most reliable)
                    // Wrap in try-catch and also handle promise rejections
                    if (client.remove && typeof client.remove === 'function') {
                      try {
                        // client.remove() might throw synchronously or return a promise that rejects
                        const removeResult = client.remove(existingTorrentInfoHash);
                        
                        // If it returns a promise, catch its rejection
                        if (removeResult && typeof removeResult.catch === 'function') {
                          removeResult.catch((err: any) => {
                            // Silently ignore "No torrent with id" errors - torrent is already gone
                            if (err?.message?.includes('No torrent with id') || 
                                err?.message?.includes('not found')) {
                              console.log('ℹ️ Torrent already removed from client (async not found), proceeding...');
                            } else {
                              console.warn('⚠️ Async error removing torrent:', err?.message || err);
                            }
                          });
                          console.log('✅ Removed existing torrent from client using client.remove(infoHash)');
                        } else {
                          // Synchronous removal
                          console.log('✅ Removed existing torrent from client using client.remove(infoHash)');
                        }
                      } catch (removeByHashErr: any) {
                        // Check if error is because torrent doesn't exist (that's OK)
                        if (removeByHashErr?.message?.includes('No torrent with id') || 
                            removeByHashErr?.message?.includes('not found')) {
                          console.log('ℹ️ Torrent already removed from client (sync not found), proceeding...');
                        } else {
                          // If that fails for another reason, try removing by torrent object
                          try {
                            const removeResult2 = client.remove(existingTorrent);
                            if (removeResult2 && typeof removeResult2.catch === 'function') {
                              removeResult2.catch((err: any) => {
                                if (err?.message?.includes('No torrent with id') || 
                                    err?.message?.includes('not found')) {
                                  console.log('ℹ️ Torrent already removed from client (async not found), proceeding...');
                                }
                              });
                            }
                            console.log('✅ Removed existing torrent from client using client.remove(torrent)');
                          } catch (removeByObjErr: any) {
                            // Check if error is because torrent doesn't exist
                            if (removeByObjErr?.message?.includes('No torrent with id') || 
                                removeByObjErr?.message?.includes('not found')) {
                              console.log('ℹ️ Torrent already removed from client (sync not found), proceeding...');
                            } else {
                              // Last resort: try torrent.destroy() if available
                              if (typeof existingTorrent.destroy === 'function' && !existingTorrent.destroyed) {
                                try {
                                  existingTorrent.destroy();
                                  console.log('✅ Destroyed existing torrent using torrent.destroy()');
                                } catch (destroyErr) {
                                  console.warn('⚠️ Could not destroy torrent:', destroyErr);
                                  console.warn('⚠️ Proceeding anyway - WebTorrent may handle duplicate automatically');
                                }
                              } else {
                                console.warn('⚠️ Could not remove torrent - no valid removal method found');
                                console.warn('⚠️ Proceeding anyway - WebTorrent may handle duplicate automatically');
                              }
                            }
                          }
                        }
                      }
                      // Wait a moment for removal to complete
                      await new Promise(resolve => setTimeout(resolve, 200));
                    } else {
                      // Client doesn't have remove method, try torrent.destroy()
                      if (typeof existingTorrent.destroy === 'function' && !existingTorrent.destroyed) {
                        try {
                          existingTorrent.destroy();
                          await new Promise(resolve => setTimeout(resolve, 200));
                          console.log('✅ Destroyed existing torrent using torrent.destroy()');
                        } catch (destroyErr) {
                          console.warn('⚠️ Could not destroy torrent, proceeding anyway');
                        }
                      } else {
                        console.warn('⚠️ No removal method available - proceeding anyway');
                      }
                    }
                    existingTorrent = null;
                  }
                } catch (e: any) {
                  // If error says torrent doesn't exist, that's fine - it's already gone
                  if (e?.message?.includes('No torrent with id') || 
                      e?.message?.includes('not found')) {
                    console.log('ℹ️ Torrent already removed from client, proceeding to seed...');
                  } else {
                    console.error('Error removing existing torrent:', e);
                    console.warn('⚠️ Proceeding anyway - WebTorrent may handle duplicate automatically');
                  }
                  existingTorrent = null;
                }
              } else if (existingFilesCount === files.length) {
                console.log(`✅ Existing torrent has ${existingFilesCount} files (matches our file count), will use it`);
                // If it has the correct number of files, we'll use it in the callback
              }
            } else {
              console.log('No existing torrent found with this infoHash, will create new one');
            }
          } catch (e) {
            console.log('Error checking for existing torrent:', e);
          }
          
          // Seed the files (single file or array of files)
          // For folders, ensure we pass all files with their paths preserved
          const filesForSeeding = files.length === 1 
            ? files[0] 
            : Array.from(files); // Array preserves webkitRelativePath for folder structure
          
          console.log('Files being seeded:', {
            count: files.length,
            isArray: Array.isArray(filesForSeeding),
            files: Array.isArray(filesForSeeding) 
              ? filesForSeeding.map((f: File) => ({
                  name: f.name,
                  path: (f as any).webkitRelativePath || f.name,
                  size: f.size
                }))
              : [{ name: (filesForSeeding as File).name, size: (filesForSeeding as File).size }]
          });
          
          client.seed(filesForSeeding, { 
            announce: DEFAULT_TRACKERS,
            name: torrentName // Explicitly set the torrent name
          } as any, (torrent: any) => {
          const torrentInfoHash = torrent.infoHash?.toString?.('hex') || torrent.infoHash;
          console.log('=== AUTOMATIC SEEDING STARTED ===');
          console.log('InfoHash:', torrentInfoHash);
          console.log('Torrent name:', torrent.name || 'Unknown');
          console.log('Requested torrent name:', torrentName);
          console.log('Torrent length property:', torrent.length || 'Not set');
          console.log('Files in torrent:', torrent.files?.length || 0);
          console.log('Original file count:', files.length);
          console.log('Torrent ready:', torrent.ready);
          console.log('Torrent done:', torrent.done);
          
          // If torrent has no files yet, wait for them to populate
          // This can happen if WebTorrent returned an existing torrent instance
          if (!torrent.files || torrent.files.length === 0) {
            console.warn('⚠️ WARNING: Torrent has no files array yet! Waiting for files to populate...');
            console.warn('This might happen if WebTorrent returned an existing torrent instance.');
            console.warn('Files should populate shortly via metadata/ready events.');
            
            // Don't show files details yet - will show after metadata event
          } else {
            console.log('Torrent files details:', torrent.files.map((f: any, idx: number) => ({
              index: idx + 1,
              name: f.name || 'Unknown',
              path: f.path || f.name || 'Unknown',
              length: f.length || 0,
              lengthKB: f.length ? `${(f.length / 1024).toFixed(2)} KB` : '0 KB'
            })));
            
            // Calculate total size from files for logging
            const totalSizeFromFiles = torrent.files.reduce((sum: number, f: any) => sum + (f.length || 0), 0);
            console.log('Total size from files:', `${(totalSizeFromFiles / 1024 / 1024).toFixed(2)} MB`);
            
            // Ensure torrent.length is set (sometimes it's 0 initially for seeded files)
            if (!torrent.length || torrent.length === 0) {
              console.log('Torrent length is 0, but files have size. This is normal for client.seed().');
            }
            
            // Verify all files are included
            if (torrent.files.length !== files.length) {
              console.warn(`⚠️ WARNING: File count mismatch! Expected ${files.length} files, but torrent has ${torrent.files.length} files.`);
              console.warn('Expected files:', files.map(f => f.name || (f as any).webkitRelativePath));
              console.warn('Torrent files:', torrent.files.map((f: any) => f.name || f.path));
            } else {
              console.log('✅ All files successfully included in torrent!');
            }
          }
          
          console.log('Seeding immediately after creation!');
          
          // Helper to update torrent in state with latest data
          const updateTorrentInState = () => {
            setSeedingTorrents((prev) => {
              const exists = prev.find(t => {
                const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                return tHash === torrentInfoHash;
              });
              
              if (exists) {
                // Update existing torrent with latest data
                return prev.map(t => {
                  const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
                  return tHash === torrentInfoHash ? torrent : t;
                });
              } else {
                // Add new torrent
                console.log(`Adding torrent ${torrentInfoHash} to seeding state`);
                return [...prev, torrent];
              }
            });
          };
          
          // Add to seeding torrents list immediately
          // For client.seed(), files should be available right away, but sometimes
          // they need a moment to populate
          updateTorrentInState();
          
          // If torrent is already ready, trigger update immediately
          if (torrent.ready) {
            console.log(`✅ Auto-seeded torrent ${torrentInfoHash} is already ready`);
            updateTorrentInState();
          }
          
          setStatus(`Torrent created and seeding started for ${fileCountText}! Download the .torrent file or copy the magnet link.`);
          showToast(`Torrent created and seeding started for ${fileCountText}!`, 'success');
          
          // Listen for 'ready' event to ensure files are available
          torrent.on('ready', () => {
            console.log(`✅ Auto-seeded torrent ${torrentInfoHash} is ready`);
            console.log('Ready torrent details:', {
              name: torrent.name,
              length: torrent.length,
              filesCount: torrent.files?.length || 0,
              filesSizeFromArray: torrent.files ? torrent.files.reduce((sum: number, f: any) => sum + (f.length || 0), 0) : 0,
              done: torrent.done
            });
            updateTorrentInState();
          });
          
          // Listen for metadata event (files array populated)
          // This is critical - when WebTorrent returns an existing torrent, files may populate via metadata
          torrent.on('metadata', () => {
            console.log(`📋 Metadata received for auto-seeded torrent ${torrentInfoHash}`);
            console.log('Metadata files:', torrent.files?.length || 0);
            if (torrent.files && torrent.files.length > 0) {
              const totalSize = torrent.files.reduce((sum: number, f: any) => sum + (f.length || 0), 0);
              console.log('Total size from files array:', `${(totalSize / 1024 / 1024).toFixed(2)} MB`);
              console.log('✅ Files populated! UI should update now.');
            } else {
              console.warn('⚠️ Metadata event fired but torrent.files is still empty!');
              console.warn('This might indicate the torrent was restored from magnet and files are not available.');
            }
            updateTorrentInState();
          });
          
          // Also check files after a short delay (sometimes files array takes a moment)
          setTimeout(() => {
            if (torrent && !torrent.destroyed) {
              const currentFiles = torrent.files?.length || 0;
              const currentLength = torrent.length || 0;
              if (currentFiles > 0 || currentLength > 0) {
                console.log(`⏰ Delayed check: torrent ${torrentInfoHash} now has ${currentFiles} files, length: ${currentLength}`);
                updateTorrentInState();
              }
            }
          }, 1000);
          
          torrent.on('error', (err: any) => {
            console.error("Torrent error:", err.message);
            setSeedingStatus(`Error seeding: ${err.message}`);
            showToast(`Error seeding: ${err.message}`, 'error');
          });
          
          // Update peer stats function - now handled by global useEffect hook
          const updatePeerStats = () => {
            // Trigger the global update by updating seedingTorrents length dependency
            // The global useEffect will handle the actual update
            setSeedingTorrents((prev) => [...prev]);
          };
          
          // Helper to check if peer has pieces
          const peerHasPieces = (w: any) => {
            if (!w.peerPieces) return false;
            if (Array.isArray(w.peerPieces)) return w.peerPieces.length > 0;
            if (typeof w.peerPieces === 'object') {
              if (w.peerPieces.length !== undefined) return w.peerPieces.length > 0;
              if (Object.keys(w.peerPieces).length > 0) return true;
              try {
                if (typeof w.peerPieces.count === 'function') return w.peerPieces.count() > 0;
                if (typeof w.peerPieces.toString === 'function') {
                  return w.peerPieces.toString().includes('1');
                }
              } catch (e) {}
            }
            if (typeof w.peerPieces === 'number') return w.peerPieces > 0;
            return false;
          };
          
          // Add peer connection listeners
          torrent.on('wire', (wire: any) => {
            const wires = torrent.wires || [];
            const weAreUploadingToPeer = wire.uploaded && wire.uploaded > 0;
            const peerHasPiecesValue = peerHasPieces(wire);
            
            console.log('🔌 [SEEDER] Peer connected to auto-seeded torrent!', {
              fileName: files.length === 1 ? files[0].name : `${files.length} files`,
              torrentHash: torrentInfoHash.substring(0, 8),
              peerId: wire.peerId?.toString?.('hex')?.substring(0, 16) || 'Unknown',
              totalPeers: wires.length,
              numPeers: torrent.numPeers || 0,
              peerHasPieces: peerHasPiecesValue,
              peerType: peerHasPiecesValue ? '🟢 Seeder' : '🔴 Downloader',
              weAreSeeder: torrent.done ? '✅ Yes' : '✅ Yes (direct file - always ready)',
              uploadedToPeer: wire.uploaded || 0,
              weAreUploading: weAreUploadingToPeer ? '✅ Yes' : '❌ No',
              amChoking: wire.amChoking,
              peerChoking: wire.peerChoking,
              amInterested: wire.amInterested,
              peerInterested: wire.peerInterested,
              connectionDirection: 'Bidirectional (should be visible to downloader)',
              wireDetails: {
                remoteAddress: wire.remoteAddress || 'Unknown',
                remotePort: wire.remotePort || 'Unknown'
              }
            });
            
            // Force immediate UI update
            updatePeerStats();
            // Also trigger the global update to ensure consistency
            const client = (window as any).__webtorrentClient;
            if (client) {
              const updateAllPeerStats = () => {
                const torrents = client.torrents || [];
                const newPeerStats: Record<string, { peers: number; downloadSpeed: number; uploadSpeed: number; seeders: number; downloaders: number }> = {};
                
                const peerHasPieces = (w: any) => {
                  if (!w || !w.peerPieces) return false;
                  if (Array.isArray(w.peerPieces)) return w.peerPieces.length > 0;
                  if (typeof w.peerPieces === 'object') {
                    if (w.peerPieces.length !== undefined) return w.peerPieces.length > 0;
                    if (Object.keys(w.peerPieces).length > 0) return true;
                    try {
                      if (typeof w.peerPieces.count === 'function') return w.peerPieces.count() > 0;
                      if (typeof w.peerPieces.toString === 'function') {
                        return w.peerPieces.toString().includes('1');
                      }
                    } catch (e) {}
                  }
                  if (typeof w.peerPieces === 'number') return w.peerPieces > 0;
                  return false;
                };
                
                torrents.forEach((t: any) => {
                  if (t && !t.destroyed) {
                    const tHash = t.infoHash?.toString?.('hex') || 
                                  (typeof t.infoHash === 'string' ? t.infoHash : '') ||
                                  (t.infoHashBuffer ? Buffer.from(t.infoHashBuffer).toString('hex') : '');
                    
                    if (!tHash) return;
                    
                    const wires = t.wires || [];
                    const seeders = wires.filter(peerHasPieces).length;
                    const downloaders = wires.filter((w: any) => !peerHasPieces(w) || (w.uploaded && w.uploaded > 0)).length;
                    const peers = t.numPeers || wires.length || 0;
                    
                    newPeerStats[tHash] = {
                      peers,
                      downloadSpeed: t.downloadSpeed || 0,
                      uploadSpeed: t.uploadSpeed || 0,
                      seeders,
                      downloaders
                    };
                  }
                });
                
                setPeerStats(newPeerStats);
                setStatsUpdateCounter(prev => prev + 1);
              };
              updateAllPeerStats();
            }
          });
          
          torrent.on('noPeers', () => {
            console.log('⚠️ No peers event (auto-seeded)');
            updatePeerStats();
          });
          
          // Aggressive wire monitoring - check wires array directly every 500ms
          const wireMonitor = setInterval(() => {
            const wires = torrent.wires || [];
            const currentWiresCount = wires.length;
            
            // Log if wires count changes (peer connected/disconnected)
            if (currentWiresCount !== ((torrent as any).__lastWiresCount || 0)) {
              console.log(`🔍 Wire count changed for ${torrentInfoHash.substring(0, 8)}: ${(torrent as any).__lastWiresCount || 0} → ${currentWiresCount}`, {
                wires: wires.map((w: any) => ({
                  peerId: w.peerId?.toString?.('hex')?.substring(0, 8) || 'unknown',
                  hasPieces: peerHasPieces(w),
                  uploaded: w.uploaded || 0,
                  downloaded: w.downloaded || 0,
                  amChoking: w.amChoking,
                  peerChoking: w.peerChoking
                }))
              });
              (torrent as any).__lastWiresCount = currentWiresCount;
              
              // Force immediate UI update when wire count changes
              updatePeerStats();
              const client = (window as any).__webtorrentClient;
              if (client) {
                const updateAllPeerStats = () => {
                  const torrents = client.torrents || [];
                  const newPeerStats: Record<string, { peers: number; downloadSpeed: number; uploadSpeed: number; seeders: number; downloaders: number }> = {};
                  
                  const peerHasPieces = (w: any) => {
                    if (!w || !w.peerPieces) return false;
                    if (Array.isArray(w.peerPieces)) return w.peerPieces.length > 0;
                    if (typeof w.peerPieces === 'object') {
                      if (w.peerPieces.length !== undefined) return w.peerPieces.length > 0;
                      if (Object.keys(w.peerPieces).length > 0) return true;
                      try {
                        if (typeof w.peerPieces.count === 'function') return w.peerPieces.count() > 0;
                        if (typeof w.peerPieces.toString === 'function') {
                          return w.peerPieces.toString().includes('1');
                        }
                      } catch (e) {}
                    }
                    if (typeof w.peerPieces === 'number') return w.peerPieces > 0;
                    return false;
                  };
                  
                  torrents.forEach((t: any) => {
                    if (t && !t.destroyed) {
                      const tHash = t.infoHash?.toString?.('hex') || 
                                    (typeof t.infoHash === 'string' ? t.infoHash : '') ||
                                    (t.infoHashBuffer ? Buffer.from(t.infoHashBuffer).toString('hex') : '');
                      
                      if (!tHash) return;
                      
                      const wires = t.wires || [];
                      const seeders = wires.filter(peerHasPieces).length;
                      const downloaders = wires.filter((w: any) => !peerHasPieces(w) || (w.uploaded && w.uploaded > 0)).length;
                      const peers = t.numPeers || wires.length || 0;
                      
                      newPeerStats[tHash] = {
                        peers,
                        downloadSpeed: t.downloadSpeed || 0,
                        uploadSpeed: t.uploadSpeed || 0,
                        seeders,
                        downloaders
                      };
                    }
                  });
                  
                  setPeerStats(newPeerStats);
                  setStatsUpdateCounter(prev => prev + 1);
                };
                updateAllPeerStats();
              }
            }
          }, 500); // Check every 500ms
          
          // Store interval for cleanup
          (torrent as any).__wireMonitorInterval = wireMonitor;
          
          // Periodic summary
          const interval = setInterval(() => {
            const wires = torrent.wires || [];
            if (wires.length > 0) {
              const seeders = wires.filter(peerHasPieces).length;
              const downloaders = wires.filter((w: any) => !peerHasPieces(w)).length;
              console.log(`📊 Auto-seeded torrent summary:`, {
                name: torrent.name || torrentInfoHash.substring(0, 16),
                totalPeers: wires.length,
                seeders,
                downloaders,
                totalUploaded: `${torrent.uploaded || 0} bytes`,
                uploadSpeed: `${((torrent.uploadSpeed || 0) / 1024).toFixed(2)} KB/s`
              });
            }
            updatePeerStats();
          }, 5000);
          
          torrent.on('destroy', () => {
            clearInterval(interval);
            console.log(`🗑️ Auto-seeded torrent destroyed: ${torrent.name || torrentInfoHash.substring(0, 16)}`);
          });
          
          updatePeerStats();
          
          // Save session state (uTorrent-style persistence)
          // uTorrent saves: active torrent list, file paths, state, metadata in session.dat
          // We save: magnet links, metadata, seeding type (since we can't save File objects)
          try {
            const magnetURI = torrent.magnetURI;
            if (magnetURI) {
              // Save to magnet list for backward compatibility
              const saved = localStorage.getItem('webtorrent_seeding_magnets');
              const magnets: string[] = saved ? JSON.parse(saved) : [];
              if (!magnets.includes(magnetURI)) {
                magnets.push(magnetURI);
                localStorage.setItem('webtorrent_seeding_magnets', JSON.stringify(magnets));
              }
              
              // Save comprehensive session state (like uTorrent's session.dat)
              const sessionListKey = 'webtorrent_session_list';
              const sessionList: any[] = JSON.parse(localStorage.getItem(sessionListKey) || '[]');
              const existingIndex = sessionList.findIndex((item: any) => item.infoHash === torrentInfoHash);
              const sessionEntry = {
                infoHash: torrentInfoHash,
                name: torrent.name || torrentName,
                magnetURI: magnetURI,
                seedingType: 'direct_file_seed', // vs 'magnet_seed' or 'torrent_file_seed'
                fileCount: files.length,
                totalSize: files.reduce((sum, f) => sum + f.size, 0),
                fileNames: files.map(f => f.name),
                addedAt: Date.now(),
                lastSeen: Date.now()
              };
              if (existingIndex >= 0) {
                sessionList[existingIndex] = { ...sessionList[existingIndex], ...sessionEntry, lastSeen: Date.now() };
              } else {
                sessionList.push(sessionEntry);
              }
              localStorage.setItem(sessionListKey, JSON.stringify(sessionList));
              console.log(`💾 Saved session state (uTorrent-style) for ${torrentInfoHash}`);
            }
          } catch (e) {
            console.error('Failed to save session state:', e);
          }
        }).on('error', (err: any) => {
          console.error('Failed to start auto-seeding:', err);
          setStatus(`Torrent created for ${fileCountText}, but failed to start seeding: ${err.message}. You can manually seed below.`);
          showToast(`Torrent created but failed to start seeding: ${err.message}`, 'warning');
        });
      } catch (seedErr) {
        console.error('Error starting auto-seeding:', seedErr);
        setStatus(`Torrent created for ${fileCountText}, but failed to start seeding. You can manually seed below.`);
        showToast('Torrent created but failed to start seeding', 'warning');
      }
    });
  };

  // Handle seeding a torrent file - moved from profile page
  async function handleSeed() {
    setSeedingStatus("Seeding...");
    setDuplicateMessage(""); // Clear previous duplicate messages
    try {
      const client = await getWebTorrentClient();
      if (seedingFiles.length === 0) {
        setSeedingStatus("No .torrent file provided");
        showToast('No .torrent file provided', 'warning');
        return;
      }
      
      let started = 0;
      let skipped = 0;
      
      // Handle .torrent files
      for (const file of seedingFiles) {
        const arrBuf = await file.arrayBuffer();
        const source = Buffer.from(arrBuf);
        
        // @ts-ignore
        const parseTorrentModule = await import('parse-torrent');
        const parseTorrent = parseTorrentModule.default || parseTorrentModule;
        let parsed: any;
        try {
          parsed = parseTorrent(source);
          // Handle async parseTorrent if it returns a Promise
          if (parsed && typeof parsed.then === 'function') {
            parsed = await parsed;
          }
          
          // Validate .torrent before seeding
          if (!parsed || typeof parsed !== 'object') {
            throw new Error('Invalid .torrent structure - file is not a valid torrent format');
          }
          if (!parsed.info || typeof parsed.info !== 'object') {
            throw new Error('Missing info dictionary - the .torrent file is missing required metadata');
          }
          const hasFilesArray = Array.isArray(parsed.files) && parsed.files.length > 0;
          const hasSingleLength = typeof parsed.length === 'number' && parsed.length >= 0;
          if (!hasFilesArray && !hasSingleLength) {
            throw new Error('No files found in .torrent - the torrent contains no files to share');
          }
          if (parsed.announce && !Array.isArray(parsed.announce)) {
            throw new Error('Invalid announce list - tracker configuration is malformed');
          }
          if (!parsed.infoHash) {
            throw new Error('Missing infoHash - cannot identify this torrent');
          }
          const infoHash = parsed.infoHash.toString('hex');
          const existing = client.get(infoHash);
          // Only skip if torrent exists AND is not destroyed AND is active
          if (existing && !existing.destroyed) {
            // Also check if it's in the client.torrents array (more reliable check)
            const inTorrentsArray = client.torrents?.some((t: any) => {
              const tHash = t.infoHash?.toString?.('hex') || t.infoHash;
              return tHash && tHash.toLowerCase() === infoHash.toLowerCase() && !t.destroyed;
            });
            
            if (inTorrentsArray) {
              skipped++;
              const existingName = existing.name || existing.files?.[0]?.name || file.name;
              const duplicateMsg = `⚠️ "${file.name}" is already being seeded${existingName !== file.name ? ` as "${existingName}"` : ''}`;
              setDuplicateMessage((prev) => prev ? `${prev}\n${duplicateMsg}` : duplicateMsg);
              console.log(`Duplicate detected: ${file.name} (infoHash: ${infoHash}) is already seeding`);
              continue;
            } else {
              // Torrent exists but is destroyed, remove it from client to allow re-adding
              console.log('Found destroyed torrent in client, removing it before re-adding:', infoHash);
              try {
                if (client.remove && typeof client.remove === 'function') {
                  const removeResult = client.remove(infoHash);
                  if (removeResult && typeof removeResult.catch === 'function') {
                    removeResult.catch((err: any) => {
                      // Ignore "not found" errors
                      if (!err?.message?.includes('No torrent with id')) {
                        console.warn('Error removing destroyed torrent:', err);
                      }
                    });
                  }
                }
              } catch (e) {
                // Ignore removal errors
              }
            }
          }
        } catch (e: any) {
          console.error('Could not parse or validate torrent file:', e);
          const errorMsg = e?.message || 'Invalid or corrupted .torrent file';
          setSeedingStatus(`❌ Error with "${file.name}": ${errorMsg}. Please use a valid .torrent file.`);
          showToast(`Error with "${file.name}": ${errorMsg}`, 'error');
          // Show error prominently and stop processing this file
          continue;
        }
        
        // Store source in a const that will be accessible in the callback
        const torrentSource = source;
        
        client.add(torrentSource, { announce: DEFAULT_TRACKERS }, (torrent: any) => {
          const infoHash = torrent.infoHash?.toString?.('hex') || torrent.infoHash;
          console.log('=== SEEDING TORRENT ADDED (from .torrent file) ===');
          
          setSeedingTorrents((prev) => [...prev, torrent]);
          started++;
          setSeedingStatus(`Seeding ${started}/${seedingFiles.length} torrent(s)...`);
          torrent.on('error', (err: any) => {
            const errorMsg = err.message || 'Unknown error';
            console.error("Torrent error:", errorMsg);
            // Show error to user
            if (errorMsg.includes('invalid') || errorMsg.includes('corrupt') || errorMsg.includes('parse') || errorMsg.includes('malformed')) {
              setSeedingStatus(`❌ Error seeding "${file.name}": ${errorMsg}. The .torrent file may be invalid or corrupted.`);
              showToast(`Error seeding "${file.name}": ${errorMsg}`, 'error');
            } else {
              setSeedingStatus(`❌ Error seeding "${file.name}": ${errorMsg}`);
              showToast(`Error seeding "${file.name}": ${errorMsg}`, 'error');
            }
          });
          torrent.on('warning', (warn: any) => {
            const warnMsg = warn.message || 'Unknown warning';
            console.warn("Torrent warning:", warnMsg);
            // Show warning for important issues
            if (warnMsg.includes('invalid') || warnMsg.includes('corrupt') || warnMsg.includes('parse') || warnMsg.includes('malformed')) {
              setSeedingStatus(`⚠️ Warning for "${file.name}": ${warnMsg}. The .torrent file may have issues.`);
              showToast(`Warning for "${file.name}": ${warnMsg}`, 'warning');
            }
          });
          
          // Peer stats are now handled by global useEffect hook
          // Individual torrent events will trigger updates via the global listener
          
          // Save .torrent file to localStorage for restoration
          try {
            const magnetURI = torrent.magnetURI;
            if (magnetURI) {
              // Save to magnet list for backward compatibility
              const saved = localStorage.getItem('webtorrent_seeding_magnets');
              const magnets: string[] = saved ? JSON.parse(saved) : [];
              if (!magnets.includes(magnetURI)) {
                magnets.push(magnetURI);
                localStorage.setItem('webtorrent_seeding_magnets', JSON.stringify(magnets));
              }
              
              // Save comprehensive session state (like uTorrent's session.dat)
              const sessionListKey = 'webtorrent_session_list';
              const sessionList: any[] = JSON.parse(localStorage.getItem(sessionListKey) || '[]');
              const existingIndex = sessionList.findIndex((item: any) => item.infoHash === infoHash);
              
              const sessionEntry = {
                infoHash: infoHash,
                name: torrent.name || file.name.replace('.torrent', ''),
                magnetURI: magnetURI,
                seedingType: 'torrent_file_seed',
                fileCount: torrent.files?.length || 0,
                totalSize: torrent.length || 0,
                fileNames: torrent.files?.map((f: any) => f.name) || [],
                addedAt: Date.now(),
                lastSeen: Date.now()
              };
              
              if (existingIndex >= 0) {
                sessionList[existingIndex] = { ...sessionList[existingIndex], ...sessionEntry, lastSeen: Date.now() };
              } else {
                sessionList.push(sessionEntry);
              }
              localStorage.setItem(sessionListKey, JSON.stringify(sessionList));
              console.log(`💾 Saved .torrent file session state for ${infoHash}`);
            }
            
            // Also save the .torrent file source (buffer) to localStorage for direct restoration
            try {
              const torrentFileKey = `webtorrent_torrent_file_${infoHash}`;
              // Convert buffer to base64 for storage
              const base64Source = Buffer.from(torrentSource).toString('base64');
              // Only save if it's reasonably small (localStorage has ~5-10MB limit)
              if (base64Source.length < 4 * 1024 * 1024) { // 4MB limit
                localStorage.setItem(torrentFileKey, base64Source);
                console.log(`💾 Saved .torrent file data for ${infoHash} (${(base64Source.length / 1024).toFixed(2)} KB)`);
              } else {
                console.warn(`⚠️ .torrent file too large to save to localStorage (${(base64Source.length / 1024 / 1024).toFixed(2)} MB), will restore from magnet only`);
              }
            } catch (saveErr) {
              console.warn('Could not save .torrent file data:', saveErr);
            }
          } catch (e) {
            console.error('Failed to save .torrent file to localStorage:', e);
          }
        });
      }
      
      // Clear duplicate message after a delay if we successfully started some
      if (duplicateMessage) {
        // Keep the message visible
      }
      
      if (started > 0) {
        setSeedingStatus(`Successfully started seeding ${started} torrent(s)${skipped > 0 ? `. Skipped ${skipped} duplicate(s).` : ''}`);
        showToast(`Successfully started seeding ${started} torrent(s)${skipped > 0 ? `. Skipped ${skipped} duplicate(s).` : ''}`, 'success');
      } else if (skipped > 0) {
        setSeedingStatus(`This torrent is a duplicate. ${skipped} torrent(s) already seeding.`);
        showToast(`This torrent is a duplicate. ${skipped} torrent(s) already seeding.`, 'info');
      }
      
      // Clear duplicate messages after 10 seconds
      if (duplicateMessage) {
        setTimeout(() => setDuplicateMessage(""), 10000);
      }
    } catch (err) {
      setSeedingStatus("Failed to seed");
      showToast('Failed to seed', 'error');
      console.error(err);
    }
  }

  // Force re-render when statsUpdateCounter changes
  // This ensures the UI updates when peer stats change
  useEffect(() => {
    // This effect runs whenever statsUpdateCounter changes, forcing a re-render
    // The actual re-render is triggered by the state change itself
  }, [statsUpdateCounter]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-black">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white text-xl font-semibold">Share a file</div>
                <div className="text-sm text-zinc-400">Create a torrent and register on-chain</div>
              </div>
              <WalletConnect />
            </div>
            {!wallet.isConnected && (
              <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                Connect your wallet to register files on the blockchain and earn points
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-zinc-300">File name (optional)</label>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-zinc-200 placeholder:text-zinc-500"
                placeholder="My Document.pdf"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            {files.length === 0 ? (
              <div
                tabIndex={0}
                role="button"
                aria-label="File upload area"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => {
                  e.preventDefault();
                  setIsDragging(false);
                  const droppedFiles = Array.from(e.dataTransfer.files || []);
                  if (droppedFiles.length > 0) {
                    console.log('=== FILES DROPPED ===');
                    console.log('File count:', droppedFiles.length);
                    
                    // Log each file individually for better visibility
                    droppedFiles.forEach((f, i) => {
                      console.log(`File ${i + 1}:`, {
                        name: f.name,
                        size: `${f.size} bytes`,
                        sizeKB: `${(f.size / 1024).toFixed(2)} KB`,
                        sizeMB: `${(f.size / 1024 / 1024).toFixed(2)} MB`,
                        type: f.type || 'Unknown',
                        lastModified: new Date(f.lastModified).toISOString(),
                        webkitRelativePath: f.webkitRelativePath || 'N/A'
                      });
                    });
                    
                    const totalSize = droppedFiles.reduce((sum, f) => sum + f.size, 0);
                    console.log('=== SUMMARY ===');
                    console.log('Total size:', totalSize, 'bytes', `(${(totalSize / 1024).toFixed(2)} KB / ${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
                    console.log('Average file size:', `${(totalSize / droppedFiles.length).toFixed(2)} bytes`);
                    
                    if (totalSize < 1024 && droppedFiles.length > 0) {
                      console.warn('⚠️ WARNING: Total file size is very small (< 1 KB). Files might be empty or not dropped correctly.');
                      console.warn('This usually means:');
                      console.warn('  1. The files are actually empty');
                      console.warn('  2. Folder selection did not work correctly');
                      console.warn('  3. The browser did not load file contents');
                    }
                    
                    const dt = new DataTransfer();
                    droppedFiles.forEach(f => dt.items.add(f));
                    if (fileInputRef.current) {
                      fileInputRef.current.files = dt.files;
                      handleFileChange({ target: { files: dt.files } } as any);
                    }
                    setFiles(droppedFiles);
                    // If single image file, set preview
                    if (droppedFiles.length === 1 && droppedFiles[0].type.startsWith('image/')) {
                      const url = URL.createObjectURL(droppedFiles[0]);
                      setDropPreview(url);
                    } else {
                      setDropPreview(null);
                    }
                  }
                }}
                className={`relative rounded-xl border border-dashed ${isDragging ? 'border-cyan-500/60 bg-cyan-500/5' : 'border-zinc-700 bg-zinc-950/60'} p-8 text-center cursor-pointer hover:bg-zinc-900/60 w-full`}
                style={{ outline: 'none', minHeight: '220px' }}
              >
                {/* Icon/text overlay statically placed at the top inside the upload area */}
                {!dropPreview && (
                  <div className="flex flex-col items-center gap-3 pb-4">
                    <div className="h-12 w-12 grid place-items-center rounded-full bg-zinc-800/60 text-zinc-300 mx-auto">
                      <ImagePlus size={22} />
                    </div>
                    <div className="text-zinc-200 font-medium">Click to select</div>
                    <div className="text-xs text-zinc-500">or drag and drop files or folders here</div>
                  </div>
                )}
                {/* File preview (if present) */}
                {dropPreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={dropPreview} alt="preview" className="max-h-72 rounded-lg object-contain mx-auto" style={{ pointerEvents: 'none', position: 'relative', zIndex: 2 }} />
                )}
                {/* Hidden file input - supports multiple files and directories */}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  tabIndex={-1}
                  multiple
                  // @ts-ignore - webkitdirectory is a valid HTML attribute but not in TypeScript types
                  webkitdirectory=""
                  onChange={e => {
                    handleFileChange(e);
                    const selectedFiles = Array.from(e.target.files || []);
                    console.log('=== FILES SELECTED ===');
                    console.log('File count:', selectedFiles.length);
                    
                    // Log each file individually for better visibility
                    selectedFiles.forEach((f, i) => {
                      console.log(`File ${i + 1}:`, {
                        name: f.name,
                        size: `${f.size} bytes`,
                        sizeKB: `${(f.size / 1024).toFixed(2)} KB`,
                        sizeMB: `${(f.size / 1024 / 1024).toFixed(2)} MB`,
                        type: f.type || 'Unknown',
                        lastModified: new Date(f.lastModified).toISOString(),
                        webkitRelativePath: f.webkitRelativePath || 'N/A'
                      });
                    });
                    
                    const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
                    console.log('=== SUMMARY ===');
                    console.log('Total size:', totalSize, 'bytes', `(${(totalSize / 1024).toFixed(2)} KB / ${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
                    console.log('Average file size:', `${(totalSize / selectedFiles.length).toFixed(2)} bytes`);
                    
                    if (totalSize < 1024 && selectedFiles.length > 0) {
                      console.warn('⚠️ WARNING: Total file size is very small (< 1 KB). Files might be empty or not selected correctly.');
                      console.warn('This usually means:');
                      console.warn('  1. The files are actually empty');
                      console.warn('  2. Folder selection did not work correctly');
                      console.warn('  3. The browser did not load file contents');
                    }
                    
                    setFiles(selectedFiles);
                    // If single image file, set preview
                    if (selectedFiles.length === 1 && selectedFiles[0].type.startsWith('image/')) {
                      const url = URL.createObjectURL(selectedFiles[0]);
                      setDropPreview(url);
                    } else {
                      setDropPreview(null);
                    }
                  }}
                />
              </div>
            ) : (
              <div className="relative rounded-xl border border-zinc-700 bg-zinc-950/60 p-8">
                <div className="flex flex-col items-center gap-6">
                  {/* Folder Component */}
                  <Folder
                    color="#06b6d4"
                    size={1.2}
                    items={files.slice(0, 3).map((file, index) => (
                      <div key={index} className="flex flex-col items-center justify-center h-full p-2">
                        <FileText className="text-zinc-700 mb-1" size={24} />
                        <span className="text-[10px] text-zinc-600 text-center px-1 truncate w-full">
                          {file.name.length > 15 ? `${file.name.substring(0, 12)}...` : file.name}
                        </span>
                      </div>
                    ))}
                    className="mx-auto"
                  />
                  
                  {/* File info */}
                  <div className="text-center space-y-2 w-full">
                    <div className="text-zinc-200 font-medium">
                      {files.length === 1 ? (
                        name || files[0].name
                      ) : (
                        `${files.length} file${files.length > 1 ? 's' : ''} selected${name ? ` - ${name}` : ''}`
                      )}
                    </div>
                    {files.length > 1 && (
                      <div className="text-xs text-zinc-400 max-h-32 overflow-y-auto space-y-1">
                        {files.slice(0, 5).map((f, i) => (
                          <div key={i} className="text-xs text-zinc-500 truncate">
                            • {f.webkitRelativePath || f.name} ({formatBytes(f.size)})
                          </div>
                        ))}
                        {files.length > 5 && (
                          <div className="text-xs text-zinc-500">
                            ... and {files.length - 5} more file{files.length - 5 > 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Remove button */}
                  <button
                    onClick={() => { 
                      handleRemove(); 
                      if (dropPreview) { 
                        URL.revokeObjectURL(dropPreview); 
                        setDropPreview(null); 
                      } 
                      setFiles([]);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs text-zinc-200 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-800"
                  >
                    Remove Files
                  </button>
                </div>
              </div>
            )}
            
            {/* Hidden file input - always present for file selection */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              tabIndex={-1}
              multiple
              // @ts-ignore - webkitdirectory is a valid HTML attribute but not in TypeScript types
              webkitdirectory=""
              onChange={e => {
                handleFileChange(e);
                const selectedFiles = Array.from(e.target.files || []);
                console.log('=== FILES SELECTED ===');
                console.log('File count:', selectedFiles.length);
                
                // Log each file individually for better visibility
                selectedFiles.forEach((f, i) => {
                  console.log(`File ${i + 1}:`, {
                    name: f.name,
                    size: `${f.size} bytes`,
                    sizeKB: `${(f.size / 1024).toFixed(2)} KB`,
                    sizeMB: `${(f.size / 1024 / 1024).toFixed(2)} MB`,
                    type: f.type || 'Unknown',
                    lastModified: new Date(f.lastModified).toISOString(),
                    webkitRelativePath: f.webkitRelativePath || 'N/A'
                  });
                });
                
                const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
                console.log('=== SUMMARY ===');
                console.log('Total size:', totalSize, 'bytes', `(${(totalSize / 1024).toFixed(2)} KB / ${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
                console.log('Average file size:', `${(totalSize / selectedFiles.length).toFixed(2)} bytes`);
                
                if (totalSize < 1024 && selectedFiles.length > 0) {
                  console.warn('⚠️ WARNING: Total file size is very small (< 1 KB). Files might be empty or not selected correctly.');
                  console.warn('This usually means:');
                  console.warn('  1. The files are actually empty');
                  console.warn('  2. Folder selection did not work correctly');
                  console.warn('  3. The browser did not load file contents');
                }
                
                setFiles(selectedFiles);
                // If single image file, set preview
                if (selectedFiles.length === 1 && selectedFiles[0].type.startsWith('image/')) {
                  const url = URL.createObjectURL(selectedFiles[0]);
                  setDropPreview(url);
                } else {
                  setDropPreview(null);
                }
              }}
            />

            <div className="pt-2">
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600 px-4 py-2 text-sm font-medium text-white hover:from-cyan-600 hover:to-indigo-700 disabled:opacity-60"
                onClick={handleCreate}
                disabled={files.length === 0 || isRegistering}
              >
                {isRegistering ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Registering on blockchain...
                  </>
                ) : files.length === 0 ? (
                  'Select files or folder to continue'
                ) : files.length === 1 ? (
                  wallet.isConnected ? 'Create & Register' : 'Create Torrent'
                ) : (
                  wallet.isConnected 
                    ? `Create & Register (${files.length} files)`
                    : `Create Torrent (${files.length} files)`
                )}
              </button>
            </div>

            {status && !status.includes('❌') && !status.includes('⚠️') && !status.includes('Failed') && !status.includes('Faulty') && !status.includes('Warning') && !status.includes('created') && (
              <div className="text-sm text-zinc-300">{status}</div>
            )}

            {(magnet || torrentFileUrl) && (
              <div className="space-y-2">
                {magnet && (
                  <>
                    <label className="text-sm text-zinc-300">Magnet URI</label>
                    <textarea
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-zinc-200"
                      rows={3}
                      readOnly
                      value={magnet}
                    />
                    <div>
                      <button
                        className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs text-zinc-200 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-800"
                        onClick={() => navigator.clipboard.writeText(magnet)}
                      >
                        Copy magnet link
                      </button>
                    </div>
                  </>
                )}
                {torrentFileUrl && (
                  <div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs text-zinc-200 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-800"
                      onClick={async () => {
                        try {
                          const res = await fetch(torrentFileUrl);
                          if (!res.ok) throw new Error('Failed to fetch .torrent file');
                          const blob = await res.blob();
                          const url = URL.createObjectURL(blob);
                          const getTorrentFileName = () => {
                            if (name && name.trim()) return name;
                            if (files.length === 1 && files[0]?.name) {
                              return files[0].name.replace(/\.[^/.]+$/, '');
                            }
                            if (files.length > 0) {
                              // Use folder name from webkitRelativePath or first file's directory
                              const folderName = files[0]?.webkitRelativePath?.split('/')[0];
                              return folderName || 'folder';
                            }
                            return 'file';
                          };
                          const fileName = getTorrentFileName() + '.torrent';
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = fileName;
                          document.body.appendChild(a);
                          a.click();
                          setTimeout(() => {
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          }, 100);
                        } catch (err) {
                          alert('Failed to download .torrent file.');
                        }
                      }}
                    >
                      Download .torrent
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Seeding Section - moved from profile page */}
        <div className="mt-8 rounded-2xl border-2 border-emerald-600/50 bg-zinc-900/40 p-6 backdrop-blur">
          <div className="mb-4">
            <div className="text-white text-xl font-semibold">Seed Files</div>
            <div className="text-sm text-zinc-400">Upload files to seed them immediately, or add magnet links/.torrent files</div>
          </div>
          
          {/* Connection health indicator */}
          {seedingTorrents.length > 0 && (() => {
            const totalPeers = Object.values(peerStats).reduce((sum, stats) => sum + stats.peers, 0);
            const hasConnection = totalPeers > 0;
            return (
              <div className={`rounded-xl border p-4 mb-4 ${
                hasConnection 
                  ? 'border-green-500/50 bg-green-500/5' 
                  : 'border-yellow-500/50 bg-yellow-500/5'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${hasConnection ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`}></div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-zinc-100">
                      {hasConnection ? 'Connected to peers' : 'No peers yet'}
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      {hasConnection 
                        ? `${totalPeers} peer${totalPeers === 1 ? '' : 's'} connected - You're helping others download files!`
                        : 'Searching for peers... This may take up to 30 seconds.'
                      }
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
          
          {/* Current seeding stats */}
          {seedingTorrents.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-4 mb-6">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-xs text-zinc-400 mb-1">Active Torrents</div>
                <div className="text-2xl font-bold text-cyan-400">{seedingTorrents.length}</div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-xs text-zinc-400 mb-1">Total Size</div>
                <div className="text-2xl font-bold text-cyan-400">
                  {(() => {
                    // Calculate total size from all seeding torrents
                    let totalBytes = 0;
                    seedingTorrents.forEach((t) => {
                      if (t.files && t.files.length > 0) {
                        totalBytes += t.files.reduce((sum: number, f: any) => sum + (f.length || 0), 0);
                      } else if (t.length && !isNaN(t.length) && t.length > 0) {
                        totalBytes += t.length;
                      }
                    });
                    return formatBytes(totalBytes);
                  })()}
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-xs text-zinc-400 mb-1">Connected Peers</div>
                <div className="text-2xl font-bold text-green-400">
                  {Object.values(peerStats).reduce((sum, stats) => sum + stats.peers, 0)}
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-xs text-zinc-400 mb-1">Connection Status</div>
                <div className="text-2xl font-bold">
                  {Object.values(peerStats).some(stats => stats.peers > 0) ? (
                    <span className="text-green-400 flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full bg-green-400 animate-pulse"></span>
                      Connected
                    </span>
                  ) : (
                    <span className="text-yellow-400 flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full bg-yellow-400"></span>
                      Searching...
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* .torrent file upload (downloads first, then seeds) */}
          <div className="mb-4">
            <label className="block text-sm text-zinc-300 mb-2">
              Torrent Files (.torrent)
              <span className="ml-2 text-xs text-yellow-400">⚠️ Downloads first</span>
            </label>
            <input
              type="file"
              accept=".torrent"
              multiple
              onChange={e => setSeedingFiles(Array.from(e.target.files || []))}
              className="block text-sm text-zinc-200 w-full"
            />
            <p className="text-xs text-zinc-500 mt-1">Upload .torrent metadata files. Files will be downloaded first, then seeded.</p>
            {seedingFiles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {seedingFiles.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-2 rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-200">
                    {f.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Start seeding button */}
          <div className="flex gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600 px-6 py-3 text-sm font-medium text-white hover:from-cyan-600 hover:to-indigo-700 disabled:opacity-60"
              onClick={handleSeed}
              disabled={seedingFiles.length === 0}
            >
              <Upload className="h-4 w-4" />
              Start Seeding
            </button>
            {seedingFiles.length > 0 && (
              <button
                onClick={() => {
                  setSeedingFiles([]);
                  setSeedingStatus("");
                }}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Currently seeding list */}
          {useMemo(() => {
            // Get fresh torrent references from client to ensure we have live data
            // statsUpdateCounter ensures this re-runs on every update
            const client = (window as any).__webtorrentClient;
            const clientTorrents = client?.torrents || [];
            
            // Map seeding torrents to their fresh client counterparts
            const freshTorrents = seedingTorrents.map((storedTorrent) => {
              const storedHash = storedTorrent.infoHash?.toString?.('hex') || 
                                (typeof storedTorrent.infoHash === 'string' ? storedTorrent.infoHash : '') ||
                                (storedTorrent.infoHashBuffer ? Buffer.from(storedTorrent.infoHashBuffer).toString('hex') : '');
              
              // Find fresh torrent from client
              const freshTorrent = clientTorrents.find((ct: any) => {
                const ctHash = ct.infoHash?.toString?.('hex') || 
                              (typeof ct.infoHash === 'string' ? ct.infoHash : '') ||
                              (ct.infoHashBuffer ? Buffer.from(ct.infoHashBuffer).toString('hex') : '');
                return ctHash && storedHash && ctHash.toLowerCase() === storedHash.toLowerCase();
              });
              
              // Use fresh torrent if available, otherwise fall back to stored one
              return freshTorrent || storedTorrent;
            }).filter(t => t && !t.destroyed);
            
            if (freshTorrents.length === 0) return null;
            
            return (
              <div key={`seeding-list-${statsUpdateCounter}`} className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">
                {/* Force React to detect statsUpdateCounter changes */}
                <div style={{ display: 'none' }} data-update-counter={statsUpdateCounter} />
                <h3 className="text-lg font-semibold text-zinc-100 mb-4">Currently Seeding</h3>
                <div className="space-y-2">
                  {freshTorrents.map((t, i) => {
                  // Safely extract infoHash - handle both Buffer and string formats
                  const torrentInfoHash = t.infoHash?.toString?.('hex') || 
                                         (typeof t.infoHash === 'string' ? t.infoHash : '') ||
                                         (t.infoHashBuffer ? Buffer.from(t.infoHashBuffer).toString('hex') : '');
                  
                  // Get stats from peerStats state, but also calculate directly from torrent for real-time accuracy
                  const statsFromState = peerStats[torrentInfoHash] || { peers: 0, downloadSpeed: 0, uploadSpeed: 0, seeders: 0, downloaders: 0 };
                  
                  // Always calculate directly from torrent object (most up-to-date)
                  const wires = t.wires || [];
                  const livePeers = t.numPeers || wires.length || 0;
                  const liveUploadSpeed = t.uploadSpeed || 0;
                  const liveDownloadSpeed = t.downloadSpeed || 0;
                  
                  // Helper to check if peer has pieces
                  const peerHasPieces = (w: any) => {
                    if (!w || !w.peerPieces) return false;
                    if (Array.isArray(w.peerPieces)) return w.peerPieces.length > 0;
                    if (typeof w.peerPieces === 'object') {
                      if (w.peerPieces.length !== undefined) return w.peerPieces.length > 0;
                      if (Object.keys(w.peerPieces).length > 0) return true;
                      try {
                        if (typeof w.peerPieces.count === 'function') return w.peerPieces.count() > 0;
                        if (typeof w.peerPieces.toString === 'function') {
                          return w.peerPieces.toString().includes('1');
                        }
                      } catch (e) {}
                    }
                    if (typeof w.peerPieces === 'number') return w.peerPieces > 0;
                    return false;
                  };
                  
                  const seeders = wires.filter(peerHasPieces).length;
                  const downloaders = wires.filter((w: any) => !peerHasPieces(w) || (w.uploaded && w.uploaded > 0)).length;
                  
                  // Use live values from torrent object (most accurate)
                  // Prefer wires.length over numPeers as it's more accurate for active connections
                  const actualPeers = wires.length > 0 ? wires.length : livePeers;
                  
                  const stats = {
                    peers: actualPeers,
                    downloadSpeed: liveDownloadSpeed,
                    uploadSpeed: liveUploadSpeed,
                    seeders,
                    downloaders
                  };
                  
                  const uploadKBps = (stats.uploadSpeed / 1024).toFixed(1);
                  
                  // Debug log periodically to verify updates
                  if (statsUpdateCounter % 10 === 0) { // Log every 10th update to avoid spam
                    console.log(`📊 Live stats for ${torrentInfoHash.substring(0, 8)} (render #${statsUpdateCounter}):`, {
                      peers: stats.peers,
                      seeders: stats.seeders,
                      downloaders: stats.downloaders,
                      wiresLength: wires.length,
                      uploadSpeed: `${uploadKBps} KB/s`,
                      numPeers: t.numPeers,
                      wiresDetails: wires.map((w: any) => ({
                        peerId: w.peerId?.toString?.('hex')?.substring(0, 8) || 'unknown',
                        hasPieces: peerHasPieces(w),
                        uploaded: w.uploaded || 0,
                        downloaded: w.downloaded || 0
                      }))
                    });
                  }
                  
                  // Check if this is a multi-file torrent
                  const fileCount = t.files?.length || 0;
                  const isMultiFile = fileCount > 1;
                  
                  // Display name - try to get from torrent name, or use infoHash, or show "Loading..."
                  let displayName = '';
                  if (t.name) {
                    displayName = isMultiFile 
                      ? `${t.name} (${fileCount} files)`
                      : t.name;
                  } else if (torrentInfoHash) {
                    // Show first 8 chars of infoHash if no name yet
                    displayName = `Loading... (${torrentInfoHash.substring(0, 8)}...)`;
                  } else {
                    displayName = 'Loading...';
                  }
                  
                  // Use infoHash as key if available, otherwise use index
                  // Include statsUpdateCounter and stats to force re-render when they change
                  const itemKey = `${torrentInfoHash || `torrent-${i}`}-${statsUpdateCounter}-${stats.peers}-${stats.seeders}-${stats.downloaders}`;
                  
                  return (
                    <div key={itemKey} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-100 font-medium truncate">{displayName}</div>
                        {isMultiFile && t.files && (
                          <div className="text-xs text-zinc-500 mt-1 max-h-16 overflow-y-auto">
                            {t.files.slice(0, 3).map((f: any, idx: number) => (
                              <div key={idx} className="truncate">
                                • {f.name || f.path || 'Unknown file'}
                              </div>
                            ))}
                            {fileCount > 3 && (
                              <div className="text-zinc-600">... and {fileCount - 3} more file{fileCount - 3 > 1 ? 's' : ''}</div>
                            )}
                          </div>
                        )}
                        <div className="text-xs text-zinc-400 mt-1">
                          {(() => {
                            // Calculate size from files array first (most reliable)
                            let sizeBytes = 0;
                            if (t.files && t.files.length > 0) {
                              sizeBytes = t.files.reduce((sum: number, f: any) => sum + (f.length || 0), 0);
                            } else if (t.length && !isNaN(t.length) && t.length > 0) {
                              sizeBytes = t.length;
                            }
                            
                            if (sizeBytes > 0) {
                              return formatBytes(sizeBytes);
                            } else {
                              // Show "Loading..." only if torrent has no files and no length
                              return 'Loading...';
                            }
                          })()}
                          {isMultiFile && ` • ${fileCount} file${fileCount > 1 ? 's' : ''}`}
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-xs flex-wrap" key={`stats-${torrentInfoHash}-${statsUpdateCounter}-${stats.peers}-${seeders}-${downloaders}`}>
                          <div className={`inline-flex items-center gap-1 px-2 py-1 rounded ${stats.peers > 0 ? 'bg-green-500/10 text-green-400' : 'bg-zinc-800/50 text-zinc-500'}`}>
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stats.peers > 0 ? '#10b981' : '#71717a' }}></span>
                            {stats.peers} {stats.peers === 1 ? 'peer' : 'peers'}
                          </div>
                          {seeders > 0 && (
                            <div className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 text-emerald-400" title="Peers that have pieces (seeders)">
                              🟢 {seeders} seeder{seeders === 1 ? '' : 's'}
                            </div>
                          )}
                          {downloaders > 0 && (
                            <div className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 text-blue-400" title="Peers downloading from you">
                              🔴 {downloaders} downloader{downloaders === 1 ? '' : 's'}
                            </div>
                          )}
                          {stats.uploadSpeed > 0 && (
                            <div className="inline-flex items-center gap-1 px-2 py-1 rounded bg-cyan-500/10 text-cyan-400">
                              ↑ {uploadKBps} KB/s
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            // Get the client and find the torrent by infoHash (more reliable than stored reference)
                            const client = await getWebTorrentClient();
                            
                            // Safely extract infoHash - handle both Buffer and string formats
                            let infoHash = t.infoHash?.toString?.('hex') || 
                                         (typeof t.infoHash === 'string' ? t.infoHash : '') ||
                                         (t.infoHashBuffer ? Buffer.from(t.infoHashBuffer).toString('hex') : '');
                            
                            // Fallback: Extract infoHash from magnetURI if torrent doesn't have it yet
                            if (!infoHash && t.magnetURI) {
                              const magnetMatch = t.magnetURI.match(/btih:([a-f0-9]+)/i);
                              if (magnetMatch) {
                                infoHash = magnetMatch[1].toLowerCase();
                                console.log(`Extracted infoHash from magnetURI: ${infoHash}`);
                              }
                            }
                            
                            // Last resort: Try to get infoHash from client by checking all torrents
                            if (!infoHash) {
                              // Find this torrent in client by object reference
                              const foundInClient = client.torrents?.find((clientTorrent: any) => clientTorrent === t);
                              if (foundInClient) {
                                const foundHash = foundInClient.infoHash?.toString?.('hex') || 
                                                 (typeof foundInClient.infoHash === 'string' ? foundInClient.infoHash : '') ||
                                                 (foundInClient.infoHashBuffer ? Buffer.from(foundInClient.infoHashBuffer).toString('hex') : '');
                                if (foundHash) {
                                  infoHash = foundHash;
                                  console.log(`Found infoHash from client torrent: ${infoHash}`);
                                }
                              }
                            }
                            
                            if (!infoHash) {
                              console.warn('Cannot extract infoHash, but will attempt to stop torrent by object reference');
                              // We'll still try to destroy the torrent object directly
                            }
                            
                            // Try to get the torrent from the client
                            let torrentToDestroy: any = null;
                            
                            if (infoHash) {
                              torrentToDestroy = client.get(infoHash);
                            }
                            
                            // If not found by infoHash, try to find by object reference in client
                            if (!torrentToDestroy && client.torrents) {
                              torrentToDestroy = client.torrents.find((clientTorrent: any) => clientTorrent === t);
                            }
                            
                            // If still not found, use the stored reference directly
                            if (!torrentToDestroy && t && typeof t.destroy === 'function') {
                              torrentToDestroy = t;
                            }
                            
                            // Destroy the torrent if we have a valid reference
                            if (torrentToDestroy && typeof torrentToDestroy.destroy === 'function') {
                              torrentToDestroy.destroy();
                              console.log(`Stopped seeding torrent: ${infoHash || 'by object reference'}`);
                              
                              // Also remove from client registry to ensure it's completely gone
                              if (infoHash) {
                                try {
                                  if (client.remove && typeof client.remove === 'function') {
                                    const removeResult = client.remove(infoHash);
                                    if (removeResult && typeof removeResult.catch === 'function') {
                                      removeResult.catch((err: any) => {
                                        // Ignore "not found" errors - torrent already removed
                                        if (!err?.message?.includes('No torrent with id')) {
                                          console.warn('Error removing torrent from client:', err);
                                        }
                                      });
                                    }
                                    console.log(`Removed torrent ${infoHash} from client registry`);
                                  }
                                } catch (e: any) {
                                  // Ignore "not found" errors - torrent already removed
                                  if (!e?.message?.includes('No torrent with id')) {
                                    console.warn('Error removing torrent from client:', e);
                                  }
                                }
                              } else {
                                console.warn('Cannot remove from client registry: no infoHash available');
                              }
                              
                              // Verify it's actually destroyed by checking client.torrents (only if we have infoHash)
                              if (infoHash) {
                                setTimeout(() => {
                                  const remainingTorrent = client.get(infoHash);
                                  if (remainingTorrent && !remainingTorrent.destroyed) {
                                    console.warn(`Torrent ${infoHash} still exists after destroy, forcing removal`);
                                    // Force remove from client if still present
                                    try {
                                      if (remainingTorrent.removeAllListeners) {
                                        remainingTorrent.removeAllListeners();
                                      }
                                      if (client.remove && typeof client.remove === 'function') {
                                        const removeResult = client.remove(infoHash);
                                        if (removeResult && typeof removeResult.catch === 'function') {
                                          removeResult.catch((err: any) => {
                                            if (!err?.message?.includes('No torrent with id')) {
                                              console.error('Error removing torrent during cleanup:', err);
                                            }
                                          });
                                        }
                                      }
                                    } catch (e: any) {
                                      if (!e?.message?.includes('No torrent with id')) {
                                        console.error('Error cleaning up torrent:', e);
                                      }
                                    }
                                  }
                                }, 100);
                              }
                            } else {
                              console.warn(`Could not find torrent to destroy for infoHash: ${infoHash || 'empty'}`);
                              // If we have infoHash, try to remove from client registry
                              if (infoHash) {
                                try {
                                  const checkTorrent = client.get(infoHash);
                                  if (checkTorrent && client.remove && typeof client.remove === 'function') {
                                    const removeResult = client.remove(infoHash);
                                    if (removeResult && typeof removeResult.catch === 'function') {
                                      removeResult.catch((err: any) => {
                                        if (!err?.message?.includes('No torrent with id')) {
                                          console.warn('Error removing torrent (fallback):', err);
                                        }
                                      });
                                    }
                                    console.log(`Removed torrent ${infoHash} from client registry (fallback)`);
                                  }
                                } catch (e: any) {
                                  // Ignore "not found" errors
                                  if (!e?.message?.includes('No torrent with id')) {
                                    console.warn('Error in fallback removal:', e);
                                  }
                                }
                              }
                            }
                            
                            // Remove from state
                            setSeedingTorrents(seedingTorrents.filter((_, idx) => idx !== i));
                            
                            // Remove from localStorage completely (cleaner approach)
                            try {
                              // Remove from active seeding magnets list
                              const saved = localStorage.getItem('webtorrent_seeding_magnets');
                              const magnets: string[] = saved ? JSON.parse(saved) : [];
                              const updatedMagnets = magnets.filter(m => {
                                const match = m.match(/btih:([a-f0-9]+)/i);
                                return !match || match[1].toLowerCase() !== infoHash.toLowerCase();
                              });
                              localStorage.setItem('webtorrent_seeding_magnets', JSON.stringify(updatedMagnets));
                              
                              // Remove from session list
                              const sessionListKey = 'webtorrent_session_list';
                              const sessionList: any[] = JSON.parse(localStorage.getItem(sessionListKey) || '[]');
                              const filteredSessionList = sessionList.filter((item: any) => 
                                item.infoHash?.toLowerCase() !== infoHash.toLowerCase()
                              );
                              localStorage.setItem(sessionListKey, JSON.stringify(filteredSessionList));
                              
                              // Remove saved .torrent file data if it exists
                              try {
                                const torrentFileKey = `webtorrent_torrent_file_${infoHash}`;
                                localStorage.removeItem(torrentFileKey);
                                console.log(`Removed saved .torrent file data for ${infoHash}`);
                              } catch (e) {
                                // Ignore cleanup errors
                              }
                              
                              // Remove metadata
                              const metadataKey = `webtorrent_metadata_${infoHash}`;
                              localStorage.removeItem(metadataKey);
                              
                              // Clean up any old stopped torrents list (no longer used, but clean up if exists)
                              try {
                                const oldStoppedList = localStorage.getItem('webtorrent_stopped_torrents');
                                if (oldStoppedList) {
                                  // Remove this torrent from old list if it exists, but we don't need the list anymore
                                  const oldStopped: string[] = JSON.parse(oldStoppedList);
                                  const filtered = oldStopped.filter(s => s.toLowerCase() !== infoHash.toLowerCase());
                                  if (filtered.length === 0) {
                                    localStorage.removeItem('webtorrent_stopped_torrents');
                                  } else {
                                    localStorage.setItem('webtorrent_stopped_torrents', JSON.stringify(filtered));
                                  }
                                }
                              } catch (e) {
                                // Ignore errors cleaning up old stopped list
                              }
                              
                              console.log(`🗑️ Completely removed ${infoHash} from localStorage (magnet, session, metadata)`);
                            } catch (e) {
                              console.error('Failed to remove from localStorage:', e);
                            }
                          } catch (err) {
                            console.error('Error stopping torrent:', err);
                            // Still remove from UI even if destroy failed
                            setSeedingTorrents(seedingTorrents.filter((_, idx) => idx !== i));
                          }
                        }}
                        className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-400 ring-1 ring-inset ring-red-500/30 hover:bg-red-500/15"
                      >
                        Stop
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            );
          }, [seedingTorrents, statsUpdateCounter, peerStats])}
        </div>
      </div>
    </div>
  );
}


