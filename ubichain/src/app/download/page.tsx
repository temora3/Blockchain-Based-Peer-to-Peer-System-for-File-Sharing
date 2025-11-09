"use client";
import { useState, useEffect } from 'react';
import { AnimatedDownload } from '@/components/ui/animated-download';
import { getWebTorrentClient } from '@/lib/torrent';
import { useRef } from 'react';
import { useImageUpload } from '@/hooks/use-image-upload';
import { ImagePlus, FileText } from 'lucide-react';
import { Buffer } from 'buffer';
import JSZip from 'jszip';
import { useToast } from '@/components/ui/toast-1';
import Folder from '@/components/Folder';

// Helper function to format bytes to human-readable size (KB, MB, GB, TB)
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes < 1024 * 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB`;
}

export default function DownloadPage() {
  const [magnet, setMagnet] = useState('');
  const [status, setStatus] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0); // 0-100
  const [isDownloading, setIsDownloading] = useState(false);
  const [files, setFiles] = useState<{ name: string; size: number; url: string; path?: string; blob?: Blob }[]>([]);
  const [peerCount, setPeerCount] = useState<number>(0);
  const [torrentFile, setTorrentFile] = useState<File | null>(null);
  const { previewUrl, fileInputRef, handleFileChange, handleRemove } = useImageUpload({ onUpload: () => {} });
  const [isDragging, setIsDragging] = useState(false);
  const [dropPreview, setDropPreview] = useState<string | null>(null);
  const [downloadSpeed, setDownloadSpeed] = useState<number>(0); // bytes per second
  const [timeRemaining, setTimeRemaining] = useState<number>(0); // seconds
  const [currentTorrent, setCurrentTorrent] = useState<any>(null);
  const [isDownloadComplete, setIsDownloadComplete] = useState<boolean>(false);
  const [fileCount, setFileCount] = useState<number>(0);
  const { showToast } = useToast();

  // Global error handler for unhandled promise rejections (e.g., crypto errors in WebTorrent)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason;
      const errorMsg = error?.message || String(error) || 'Unknown error';
      
      // Check for crypto-related errors
      if (errorMsg.includes('no web crypto') || errorMsg.includes('crypto') || errorMsg.includes('Web Crypto')) {
        console.error('❌ Unhandled crypto error:', errorMsg);
        
        // Check if we're on HTTP (not HTTPS)
        const isHttp = window.location.protocol === 'http:';
        const isSecureContext = window.isSecureContext;
        
        const cryptoErrorMsg = '❌ Web Crypto API Error\n\n' +
                              'WebTorrent requires Web Crypto API to verify torrent metadata, but it\'s not available.\n\n' +
                              (isHttp ? '⚠️ You are using HTTP. Web Crypto API requires HTTPS.\n\n' : '') +
                              (!isSecureContext ? '⚠️ This page is not in a secure context.\n\n' : '') +
                              'Solutions:\n' +
                              '1. Use HTTPS instead of HTTP (required for Web Crypto API)\n' +
                              '2. Use a modern browser (Chrome, Firefox, Edge, Safari)\n' +
                              '3. Ensure the page is served over HTTPS\n' +
                              '4. Check browser console for more details';
        
        setStatus(cryptoErrorMsg);
        showToast('Web Crypto API error - page must be served over HTTPS', 'error');
        setIsDownloading(false);
        setIsDownloadComplete(false);
        
        // Prevent the error from appearing in console as unhandled
        event.preventDefault();
      }
    };
    
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [showToast]);

  // Download handler for both magnet and .torrent file
  const handleDownload = async (inputMagnet?: string, inputTorrentFile?: File) => {
    setFiles([]);
    setStatus('Connecting to peers...');
    setPeerCount(0);
    setDownloadProgress(0);
    setIsDownloading(true);
    setIsDownloadComplete(false);
    const client = await getWebTorrentClient();
    let source: string | Buffer | Blob | undefined = undefined;
    let infoHash: string | null = null;
    
    if (inputMagnet) {
      source = inputMagnet;
      // Extract infoHash from magnet URI
      const match = inputMagnet.match(/btih:([a-f0-9]+)/i);
      if (match) infoHash = match[1];
    } else if (inputTorrentFile) {
      try {
        // WebTorrent can handle .torrent files directly, but it needs crypto support
        // If crypto isn't available, we'll show a helpful error
        if (inputTorrentFile.size === 0) {
          throw new Error('Empty .torrent file');
        }
        
        // Check if Web Crypto API is available (required for parsing .torrent files)
        if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
          const errorMsg = 'Web Crypto API is not available. This is required to parse .torrent files.\n\n' +
                         'Possible solutions:\n' +
                         '1. Use HTTPS instead of HTTP (Web Crypto requires secure context)\n' +
                         '2. Use a modern browser with Web Crypto support\n' +
                         '3. Use a magnet URI instead of a .torrent file';
          setStatus(`❌ ${errorMsg}`);
          showToast('Web Crypto API not available', 'error');
          setIsDownloading(false);
          setIsDownloadComplete(false);
          setFiles([]);
          return;
        }
        
        console.log('Preparing torrent file:', {
          fileName: inputTorrentFile.name,
          fileSize: inputTorrentFile.size,
          fileType: inputTorrentFile.type,
          webCryptoAvailable: !!(window.crypto && window.crypto.subtle)
        });
        
        // Read first few bytes to validate format
        const arrBuf = await inputTorrentFile.arrayBuffer();
        const firstBytes = new Uint8Array(arrBuf.slice(0, 20));
        const firstByte = firstBytes[0];
        
        // Validate that it looks like a bencoded torrent file
        // Bencoded files start with 'd' (dictionary) or 'l' (list)
        if (firstByte !== 0x64 && firstByte !== 0x6c) { // 'd' or 'l' in ASCII
          console.warn('⚠️ Torrent file may not be in bencoded format. First byte:', firstByte, String.fromCharCode(firstByte));
          // Continue anyway - WebTorrent will validate
        }
        
        // Convert to Blob - WebTorrent should accept Blob
        const torrentBlob = new Blob([arrBuf], { type: 'application/x-bittorrent' });
        source = torrentBlob;
        
        console.log('Torrent file prepared (using Blob):', {
          fileName: inputTorrentFile.name,
          fileSize: inputTorrentFile.size,
          blobSize: torrentBlob.size,
          firstBytes: Array.from(firstBytes).map(b => b.toString(16).padStart(2, '0')).join(' '),
          firstChar: String.fromCharCode(firstByte)
        });
        
        // Note: We can't check for existing torrents before WebTorrent parses it
        // because we need the infoHash which WebTorrent extracts. We'll check
        // after the torrent is added in the callback below.
      } catch (err: any) {
        console.error('Error processing torrent file:', err);
        const errorMessage = err?.message || 'Unknown error';
        setStatus(`❌ Failed to process .torrent file: ${errorMessage}. The file may be corrupted or invalid.`);
        showToast(`Failed to process .torrent file: ${errorMessage}`, 'error');
        setIsDownloading(false);
        setIsDownloadComplete(false);
        setFiles([]);
        return;
      }
    }
    
    if (!source) {
      setStatus('No valid source provided.');
      showToast('No valid source provided', 'warning');
      setIsDownloading(false);
      return;
    }
    
    console.log('=== DOWNLOAD PROCESS STARTED ===');
    console.log('Source type:', inputMagnet ? 'Magnet URI' : inputTorrentFile ? '.torrent file' : 'Unknown');
    if (inputMagnet) {
      console.log('Magnet URI:', inputMagnet.substring(0, 100) + '...');
    }
    
    // Add error handler for the torrent being added
    // WebTorrent's add() method can throw synchronously or asynchronously
    let torrentAddError: any = null;
    
    try {
        // Import DEFAULT_TRACKERS for .torrent files
        const { DEFAULT_TRACKERS } = await import('@/lib/torrent');
        
        // Ensure Web Crypto API is available (required by WebTorrent)
        if (typeof window !== 'undefined' && !window.crypto) {
          console.warn('⚠️ Web Crypto API not available - this may cause issues');
        }
        
        // For .torrent files, pass options with trackers
        const addOptions = inputTorrentFile ? { announce: DEFAULT_TRACKERS } : undefined;
        
        // Set up client error handler to catch crypto errors that happen before torrent is created
        const clientErrorHandler = (err: any) => {
          const errorMsg = err.message || 'Unknown error';
          if (errorMsg.includes('no web crypto') || errorMsg.includes('crypto')) {
            console.error('⚠️ WebTorrent client error (crypto):', errorMsg);
            
            // Check if we're on HTTP (not HTTPS)
            const isHttp = typeof window !== 'undefined' && window.location.protocol === 'http:';
            const isSecureContext = typeof window !== 'undefined' && window.isSecureContext;
            
            const cryptoErrorMsg = '❌ Web Crypto API Error\n\n' +
                                  'WebTorrent requires Web Crypto API to verify torrent metadata (even for magnet URIs), but it\'s not available.\n\n' +
                                  (isHttp ? '⚠️ You are using HTTP. Web Crypto API requires HTTPS.\n\n' : '') +
                                  (!isSecureContext ? '⚠️ This page is not in a secure context.\n\n' : '') +
                                  'Solutions:\n' +
                                  '1. Use HTTPS instead of HTTP (required for Web Crypto API)\n' +
                                  '2. Use a modern browser (Chrome, Firefox, Edge, Safari)\n' +
                                  '3. Ensure the page is served over HTTPS\n' +
                                  '4. Check browser console for more details';
            setStatus(cryptoErrorMsg);
            showToast('Web Crypto API error - page must be served over HTTPS', 'error');
            setIsDownloading(false);
            setIsDownloadComplete(false);
            // Remove the error handler after handling
            client.removeListener('error', clientErrorHandler);
          }
        };
        
        // Listen for client errors (these happen before torrent object is created)
        client.on('error', clientErrorHandler);
        
        // Try adding with Blob first, if it fails, we'll catch and try Buffer
        let torrent: any;
        
        try {
          console.log('Attempting to add torrent using Blob...');
          const sourceType = typeof source === 'string' ? 'string' : 
                            (source && typeof source === 'object' && 'constructor' in source && source.constructor === Blob) ? 'Blob' :
                            (source && Buffer.isBuffer(source)) ? 'Buffer' : 'unknown';
          console.log('Source type:', sourceType);
          
          torrent = client.add(source, addOptions, (torrent: any) => {
            // Remove client error handler once torrent is successfully created
            client.removeListener('error', clientErrorHandler);
            
          const infoHash = torrent.infoHash?.toString?.('hex') || torrent.infoHash;
          console.log('=== TORRENT ADDED TO CLIENT ===');
          console.log('InfoHash:', infoHash);
          console.log('Torrent name:', torrent.name || 'Unknown');
          console.log('Torrent length:', torrent.length ? `${(torrent.length / 1024 / 1024).toFixed(2)} MB` : 'Unknown');
        
        // Check if torrent was already in client (WebTorrent reuses existing instances)
        const wasAlreadyInClient = client.torrents.some((t: any) => {
          const tHash = t.infoHash?.toString?.('hex') || 
                        (typeof t.infoHash === 'string' ? t.infoHash : '') ||
                        (t.infoHashBuffer ? Buffer.from(t.infoHashBuffer).toString('hex') : '');
          return t !== torrent && tHash && infoHash && tHash.toLowerCase() === infoHash.toLowerCase();
        });
        
        if (wasAlreadyInClient) {
          console.log('⚠️⚠️⚠️ CRITICAL: This torrent was ALREADY in the client!');
          console.log('   WebTorrent is reusing the existing torrent instance.');
          console.log('   This means NO NETWORK CONNECTION is needed - it will complete immediately.');
          console.log('   This is why you see 0 peers and no wire events.');
          console.log('   💡 SOLUTION: Use a DIFFERENT browser/device to test real peer connections.');
        }
        
        // Check if this torrent is already being seeded in the same client
        const allTorrents = client.torrents || [];
        console.log(`🔍 [DOWNLOADER] Checking for seeders in ${allTorrents.length} torrent(s) in same client...`);
        
        const seedingInstance = allTorrents.find((t: any) => {
          if (t === torrent) return false; // Skip self
          
          // Try multiple hash extraction methods
          const tHash = t.infoHash?.toString?.('hex') || 
                        (typeof t.infoHash === 'string' ? t.infoHash : '') ||
                        (t.infoHashBuffer ? Buffer.from(t.infoHashBuffer).toString('hex') : '');
          
          const matchHash = tHash && infoHash && tHash.toLowerCase() === infoHash.toLowerCase();
          const isSeeder = t.done || (t.uploaded && t.uploaded > 0) || (t.wires && t.wires.length > 0);
          
          if (matchHash) {
            console.log(`  ✅ Found matching hash ${tHash.substring(0, 8)}:`, {
              isSeeder,
              done: t.done,
              uploaded: t.uploaded || 0,
              wires: t.wires?.length || 0,
              progress: ((t.progress || 0) * 100).toFixed(1) + '%'
            });
          }
          
          return matchHash && isSeeder;
        });
        
        console.log('Initial state:', {
          files: torrent.files?.length || 0,
          numPeers: torrent.numPeers || 0,
          progress: Math.round((torrent.progress || 0) * 100) + '%',
          downloaded: torrent.downloaded ? `${(torrent.downloaded / 1024 / 1024).toFixed(2)} MB` : '0 MB',
          uploadSpeed: torrent.uploadSpeed ? `${(torrent.uploadSpeed / 1024).toFixed(2)} KB/s` : '0 KB/s',
          downloadSpeed: torrent.downloadSpeed ? `${(torrent.downloadSpeed / 1024).toFixed(2)} KB/s` : '0 KB/s',
          alreadySeeding: seedingInstance ? 'Yes (in same client)' : 'No'
        });
        
        if (seedingInstance) {
          console.log('✅ [DOWNLOADER] SEEDER FOUND in same client! Download will use local seeder (no network needed).');
          console.log('   This explains why download completed immediately - it\'s using the same client instance.');
          console.log('   To test REAL peer connections, use a DIFFERENT browser/device.');
        } else {
          console.log('⚠️ [DOWNLOADER] NO SEEDER in same client - need network connection.');
          console.log('   Current torrents in client:', allTorrents.map((t: any) => {
            const tHash = t.infoHash?.toString?.('hex') || 
                          (typeof t.infoHash === 'string' ? t.infoHash : '') ||
                          (t.infoHashBuffer ? Buffer.from(t.infoHashBuffer).toString('hex') : '');
            return {
              hash: tHash?.substring(0, 8) || 'unknown',
              done: t.done,
              uploaded: t.uploaded || 0,
              wires: t.wires?.length || 0
            };
          }));
          console.log('   Looking for hash:', infoHash?.substring(0, 8));
          console.log('   💡 To test peer connections:');
          console.log('      1. Upload file on Share page (Browser A)');
          console.log('      2. Download from Download page (Browser B - different browser/device)');
          console.log('      3. Watch for 🔌 [DOWNLOADER] Peer connected! messages');
        }
        
        // Check if download completed immediately (likely from cache or same client)
        if (torrent.progress === 1) {
          const downloadedBytes = torrent.downloaded || 0;
          const totalBytes = torrent.length || 0;
          
          if (downloadedBytes === 0 && totalBytes > 0) {
            console.log('⚠️⚠️⚠️ [DOWNLOADER] CRITICAL: Torrent shows 100% but downloaded=0');
            console.log('   This means it\'s using the SAME CLIENT INSTANCE, NOT downloading from network peers.');
            console.log('   WebTorrent is reusing data from the existing seeder in the same client.');
            console.log('   This is why you see:');
            console.log('     - numPeers: 0 (no network peers needed)');
            console.log('     - No wire events (no network connection)');
            console.log('     - Seeder shows 0 peers (same client, not network)');
            console.log('   💡 TO TEST REAL PEER CONNECTIONS:');
            console.log('      1. Upload file on Share page (Browser A - e.g., Chrome)');
            console.log('      2. Download from Download page (Browser B - e.g., Firefox, or different device)');
            console.log('      3. Then you\'ll see real network peer connections!');
          } else if (wasAlreadyInClient && downloadedBytes > 0) {
            console.log('✅ [DOWNLOADER] Download completed - but this was from same client instance');
            console.log('   Downloaded bytes:', downloadedBytes, 'of', totalBytes);
            console.log('   This is NOT a network peer connection - it\'s using the same WebTorrent client.');
          }
        }
        
        setCurrentTorrent(torrent);
        setStatus('Connecting to peers...');
        setPeerCount(torrent.wires?.length || torrent.numPeers || 0);
        setDownloadProgress(0);
        setDownloadSpeed(0);
        setTimeRemaining(0);
        setFileCount(torrent.files?.length || 0);
        
        let lastProgressLog = 0;
        let lastPeerCount = 0;
        let progressUpdateCount = 0;
        
        // Helper function to update progress and stats
        const updateProgress = (source: string = 'periodic') => {
          progressUpdateCount++;
          
          // Always calculate total length from files if available - this is more accurate than torrent.length
          // torrent.length might be incorrect or represent metadata size only
          let length = 0;
          let lengthSource = 'unknown';
          
          if (torrent.files && torrent.files.length > 0) {
            // Calculate from files array - this is the actual file content size
            const filesLength = torrent.files.reduce((sum: number, f: any) => sum + (f.length || 0), 0);
            if (filesLength > 0) {
              length = filesLength;
              lengthSource = 'calculated from files';
              // Only log once or when significant
              if (progressUpdateCount === 1 || progressUpdateCount % 40 === 0) {
                console.log(`📏 Using total length from files: ${(length / 1024 / 1024).toFixed(2)} MB (from ${torrent.files.length} files)`);
                console.log(`  Individual file sizes (raw bytes and MB):`, torrent.files.map((f: any) => ({
                  name: f.name,
                  path: f.path || 'N/A',
                  lengthBytes: f.length || 0,
                  lengthMB: f.length ? `${(f.length / 1024 / 1024).toFixed(2)} MB` : '0 MB',
                  offset: f.offset || 'N/A'
                })));
                console.log(`  Sum check: ${torrent.files.reduce((sum: number, f: any) => sum + (f.length || 0), 0)} bytes`);
              }
            } else {
              // Fall back to torrent.length if files have no length yet
              length = torrent.length || 0;
              lengthSource = torrent.length ? 'torrent.length (files not ready)' : 'unknown';
            }
          } else {
            // No files available yet, use torrent.length
            length = torrent.length || 0;
            lengthSource = torrent.length ? 'torrent.length (no files)' : 'unknown';
          }
          
          // Use 1 as minimum to avoid division by zero, but track if length is actually unknown
          const effectiveLength = length || 1;
          
          // Get downloaded amount first
          const speed = torrent.downloadSpeed || 0;
          const uploaded = (torrent.uploaded || 0);
          const downloaded = (torrent.downloaded || 0);
          const remaining = effectiveLength > 1 ? (effectiveLength - downloaded) : 0;
          
          // Calculate progress - prefer manual calculation from downloaded/length when we have files
          // torrent.progress might be 0 or incorrect when torrent.length is wrong
          let progress = 0;
          
          if (effectiveLength > 1 && downloaded >= 0) {
            // Always calculate progress manually when we have a valid length
            // This is more reliable than torrent.progress when torrent.length is incorrect
            progress = Math.min(100, Math.round((downloaded / effectiveLength) * 100));
          } else if (torrent.progress !== undefined && torrent.progress !== null && !isNaN(torrent.progress) && torrent.progress > 0) {
            // Fall back to torrent.progress only if manual calculation isn't possible
            progress = Math.round((torrent.progress || 0) * 100);
          }
          
          // Log progress calculation method occasionally, or when progress changes
          if (progressUpdateCount === 1 || 
              (progressUpdateCount % 40 === 0) || 
              (progress > 0 && progress !== lastProgressLog)) {
            // Check piece status
            const pieces = torrent.pieces || [];
            const completedPieces = pieces.filter((p: any) => p && p.length === (p.pieceLength || 0)).length || 
                                   pieces.filter((p: any) => p && p.complete).length ||
                                   torrent.numPieces || 0;
            const totalPieces = torrent.pieces?.length || torrent.numPieces || 0;
            
            // Check if any peers have pieces
            const wires = torrent.wires || [];
            const peersWithPieces = wires.filter((w: any) => w.peerPieces && w.peerPieces.length > 0).length;
            
            console.log('📈 Progress calculation:', {
              torrentProgress: torrent.progress || 0,
              calculatedProgress: effectiveLength > 1 ? `${Math.round((downloaded / effectiveLength) * 100)}%` : 'N/A',
              finalProgress: `${progress}%`,
              downloaded: `${downloaded} bytes`,
              downloadedKB: `${(downloaded / 1024).toFixed(3)} KB`,
              effectiveLength: `${effectiveLength} bytes`,
              effectiveLengthKB: `${(effectiveLength / 1024).toFixed(3)} KB`,
              remaining: `${remaining} bytes`,
              isComplete: (effectiveLength > 1 && downloaded >= effectiveLength * 0.99) || progress >= 100 || torrent.done,
              piecesCompleted: `${completedPieces}/${totalPieces}`,
              peersWithPieces: `${peersWithPieces}/${wires.length}`,
              amInterested: wires.some((w: any) => w.amInterested),
              peerChoking: wires.some((w: any) => !w.peerChoking)
            });
          }
          const numPeers = torrent.wires?.length || torrent.numPeers || 0;
          const numWires = torrent.wires?.length || 0;
          
          // Log length calculation debug info
          if (progressUpdateCount === 1 || (progressUpdateCount % 40 === 0 && length <= 1)) {
            console.log('🔍 Length Debug:', {
              lengthSource: lengthSource,
              torrentLength: torrent.length || 0,
              calculatedLength: length || 0,
              effectiveLength: effectiveLength,
              filesCount: torrent.files?.length || 0,
              filesLengths: torrent.files?.map((f: any) => ({ 
                name: f.name,
                path: f.path || 'N/A',
                lengthBytes: f.length || 0,
                sizeMB: f.length ? `${(f.length / 1024 / 1024).toFixed(2)} MB` : '0 MB',
                offset: f.offset || 'N/A'
              })).slice(0, 5) || [],
              downloaded: downloaded,
              downloadedMB: `${(downloaded / 1024 / 1024).toFixed(2)} MB`,
              progressRaw: torrent.progress || 0,
              progressCalculated: effectiveLength > 1 ? `${Math.round((downloaded / effectiveLength) * 100)}%` : 'N/A'
            });
          }
          
          // Log significant progress changes (every 5% or every 10 seconds)
          const shouldLog = progress !== lastProgressLog || 
                           numPeers !== lastPeerCount || 
                           progressUpdateCount % 20 === 0; // Every 10 seconds (20 * 500ms)
          
          if (shouldLog || source !== 'periodic') {
            console.log(`[${new Date().toLocaleTimeString()}] 📊 Progress Update (${source}):`, {
              progress: `${progress}%`,
              downloaded: `${(downloaded / 1024 / 1024).toFixed(2)} MB`,
              total: `${(effectiveLength / 1024 / 1024).toFixed(2)} MB`,
              totalSource: lengthSource,
              torrentLength: torrent.length ? `${(torrent.length / 1024 / 1024).toFixed(2)} MB` : '0 MB',
              remaining: `${(remaining / 1024 / 1024).toFixed(2)} MB`,
              downloadSpeed: speed ? `${(speed / 1024).toFixed(2)} KB/s` : '0 KB/s',
              uploadSpeed: torrent.uploadSpeed ? `${(torrent.uploadSpeed / 1024).toFixed(2)} KB/s` : '0 KB/s',
              peers: numPeers,
              wires: numWires,
              uploaded: `${(uploaded / 1024 / 1024).toFixed(2)} MB`,
              done: torrent.done ? 'Yes' : 'No',
              progressRaw: torrent.progress || 0
            });
            lastProgressLog = progress;
            lastPeerCount = numPeers;
          }
          
          setDownloadProgress(progress);
          setDownloadSpeed(speed);
          setPeerCount(numPeers);
          
          // Calculate estimated time remaining
          if (speed > 0 && remaining > 0) {
            const estimatedSeconds = Math.ceil(remaining / speed);
            setTimeRemaining(estimatedSeconds);
          } else {
            setTimeRemaining(0);
          }
          
          // Check if peers have pieces (i.e., if anyone is seeding)
          const wires = torrent.wires || [];
          const peersWithPieces = wires.filter((w: any) => w.peerPieces && w.peerPieces.length > 0).length;
          const unchokedPeers = wires.filter((w: any) => !w.peerChoking).length;
          
          // Update status based on progress
          if (progress === 100) {
            setStatus('Download complete! Extracting files...');
          } else if (progress > 0) {
            setStatus(`Downloading... ${progress}%`);
          } else if (numPeers > 0) {
            if (peersWithPieces === 0) {
              setStatus(`⚠️ Connected to ${numPeers} peer${numPeers !== 1 ? 's' : ''}, but no seeders available. Someone needs to seed this torrent first (Profile → Seeding).`);
            } else if (unchokedPeers === 0) {
              setStatus(`Connected to ${numPeers} peer${numPeers !== 1 ? 's' : ''}, but all peers are choking (${peersWithPieces} seeder${peersWithPieces !== 1 ? 's' : ''} found, waiting to unchoke)...`);
            } else {
              setStatus(`Connected to ${numPeers} peer${numPeers !== 1 ? 's' : ''} (${peersWithPieces} seeder${peersWithPieces !== 1 ? 's' : ''}), negotiating data transfer...`);
            }
          } else {
            setStatus('Searching for peers...');
          }
          
          // Log seeder status occasionally
          if (progressUpdateCount % 40 === 0 && numPeers > 0 && downloaded === 0) {
            console.warn('⚠️ NO DATA TRANSFER:', {
              peers: numPeers,
              peersWithPieces: peersWithPieces,
              unchokedPeers: unchokedPeers,
              downloaded: downloaded,
              message: peersWithPieces === 0 
                ? 'No seeders available - someone needs to seed this torrent first' 
                : unchokedPeers === 0 
                  ? 'Peers are choking - waiting for unchoke'
                  : 'Data transfer not starting despite having unchoked peers'
            });
          }
        };
        
        // Initial progress update
        updateProgress('initial');
        
        // Update peer count when a new peer connects
        torrent.on('wire', (wire: any) => {
          const wires = torrent.wires || [];
          const peerHasPieces = wire.peerPieces && (
            (Array.isArray(wire.peerPieces) && wire.peerPieces.length > 0) ||
            (typeof wire.peerPieces === 'object' && Object.keys(wire.peerPieces).length > 0) ||
            (typeof wire.peerPieces === 'number' && wire.peerPieces > 0)
          );
          
          console.log('🔌 [DOWNLOADER] Peer connected!', {
            remoteAddress: wire.remoteAddress || 'Unknown',
            remotePort: wire.remotePort || 'Unknown',
            peerId: wire.peerId?.toString?.('hex')?.substring(0, 16) || 'Unknown',
            totalPeers: wires.length,
            numPeers: torrent.numPeers || 0,
            amChoking: wire.amChoking,
            amInterested: wire.amInterested,
            peerChoking: wire.peerChoking,
            peerInterested: wire.peerInterested,
            peerHasPieces: peerHasPieces,
            peerType: peerHasPieces ? '🟢 Seeder (has pieces)' : '🔴 Downloader (no pieces)',
            peerPieces: wire.peerPieces ? `Has ${wire.peerPieces.length} pieces` : 'Unknown pieces',
            downloadedFromPeer: wire.downloaded || 0,
            uploadedToPeer: wire.uploaded || 0,
            weAreDownloader: '✅ Yes (downloading)',
            connectionDirection: 'Bidirectional (should be visible to seeder)'
          });
          
          // IMPORTANT: Express interest in peer's pieces to ensure bidirectional connection
          // This tells the seeder that we want to download from them
          if (peerHasPieces && wire.amChoking) {
            console.log('📢 [DOWNLOADER] Expressing interest in peer pieces to establish bidirectional connection');
            // WebTorrent should handle this automatically, but we log it for debugging
          }
          
          // Monitor this wire for data transfer
          let lastDownloaded = wire.downloaded || 0;
          let lastUploaded = wire.uploaded || 0;
          
          const wireMonitor = setInterval(() => {
            const currentDownloaded = wire.downloaded || 0;
            const currentUploaded = wire.uploaded || 0;
            
            if (currentDownloaded !== lastDownloaded || currentUploaded !== lastUploaded) {
              console.log(`📡 Wire data transfer (peer ${wire.peerId?.toString?.('hex')?.substring(0, 8)}):`, {
                downloadedChange: `${currentDownloaded - lastDownloaded} bytes`,
                uploadedChange: `${currentUploaded - lastUploaded} bytes`,
                totalDownloaded: `${currentDownloaded} bytes`,
                totalUploaded: `${currentUploaded} bytes`,
                amChoking: wire.amChoking,
                peerChoking: wire.peerChoking,
                peerHasPieces: wire.peerPieces ? wire.peerPieces.length : 0
              });
              lastDownloaded = currentDownloaded;
              lastUploaded = currentUploaded;
            }
          }, 1000); // Check every second
          
          // Clean up monitor when wire closes
          wire.on('close', () => {
            clearInterval(wireMonitor);
          });
          
          updateProgress('peer-connect');
        });
        
        // Also update peer count if a peer disconnects
        torrent.on('noPeers', (announceType: string) => {
          console.log('⚠️ No peers event:', announceType);
          updateProgress('no-peers');
        });
        
        // Update on download events
        torrent.on('download', () => {
          updateProgress('download-event');
        });
        
        // Update on upload events (can indicate connection is active)
        torrent.on('upload', () => {
          updateProgress('upload-event');
        });
        
          // Update when torrent is ready/metadata downloaded
        torrent.on('ready', () => {
          console.log('✅ Torrent ready - metadata downloaded');
          const filesTotal = torrent.files?.reduce((sum: number, f: any) => sum + (f.length || 0), 0) || 0;
          const fileCount = torrent.files?.length || 0;
          setFileCount(fileCount);
          console.log('Metadata state:', {
            files: fileCount,
            torrentLength: torrent.length || 0,
            torrentLengthMB: torrent.length ? `${(torrent.length / 1024 / 1024).toFixed(2)} MB` : '0 MB',
            filesTotal: filesTotal,
            filesTotalMB: filesTotal ? `${(filesTotal / 1024 / 1024).toFixed(2)} MB` : '0 MB',
            fileDetails: torrent.files?.map((f: any) => ({
              name: f.name,
              path: f.path || 'N/A',
              lengthBytes: f.length || 0,
              lengthMB: f.length ? `${(f.length / 1024 / 1024).toFixed(2)} MB` : '0 MB'
            })).slice(0, 5) || [],
            progress: Math.round((torrent.progress || 0) * 100) + '%'
          });
          updateProgress('ready-event');
        });
        
        // Update on any progress change
        torrent.on('metadata', () => {
          console.log('📋 Torrent metadata received');
          setFileCount(torrent.files?.length || 0);
          updateProgress('metadata-event');
        });
        
        torrent.on('error', (err: any) => {
          const errorMsg = err.message || 'Unknown error';
          console.error('❌ Torrent error:', {
            message: errorMsg,
            stack: err.stack,
            torrentInfoHash: torrent.infoHash?.toString?.('hex') || 'Unknown'
          });
          
          // Check for crypto-related errors
          if (errorMsg.includes('no web crypto') || errorMsg.includes('crypto') || errorMsg.includes('Web Crypto')) {
            // Check if we're on HTTP (not HTTPS)
            const isHttp = typeof window !== 'undefined' && window.location.protocol === 'http:';
            const isSecureContext = typeof window !== 'undefined' && window.isSecureContext;
            
            const cryptoErrorMsg = '❌ Web Crypto API Error\n\n' +
                                  'WebTorrent requires Web Crypto API to verify torrent metadata (even for magnet URIs), but it\'s not available.\n\n' +
                                  (isHttp ? '⚠️ You are using HTTP. Web Crypto API requires HTTPS.\n\n' : '') +
                                  (!isSecureContext ? '⚠️ This page is not in a secure context.\n\n' : '') +
                                  'Solutions:\n' +
                                  '1. Use HTTPS instead of HTTP (required for Web Crypto API)\n' +
                                  '2. Use a modern browser (Chrome, Firefox, Edge, Safari)\n' +
                                  '3. Ensure the page is served over HTTPS\n' +
                                  '4. Check browser console for more details';
            setStatus(cryptoErrorMsg);
            showToast('Web Crypto API error - page must be served over HTTPS', 'error');
            setIsDownloading(false);
            setIsDownloadComplete(false);
          } else if (errorMsg.includes('invalid') || errorMsg.includes('corrupt') || errorMsg.includes('parse') || errorMsg.includes('malformed')) {
            setStatus(`❌ Torrent error: ${errorMsg}. The .torrent file may be invalid or corrupted.`);
            showToast(`Torrent error: ${errorMsg}`, 'error');
          } else {
            setStatus(`❌ Torrent error: ${errorMsg}`);
            showToast(`Torrent error: ${errorMsg}`, 'error');
          }
        });
        
        torrent.on('warning', (err: any) => {
          const warnMsg = err.message || 'Unknown warning';
          console.warn('⚠️ Torrent warning:', {
            message: warnMsg,
            torrentInfoHash: torrent.infoHash?.toString?.('hex') || 'Unknown'
          });
          // Show warning to user for important warnings
          if (warnMsg.includes('invalid') || warnMsg.includes('corrupt') || warnMsg.includes('parse') || warnMsg.includes('malformed')) {
            setStatus(`⚠️ Torrent warning: ${warnMsg}. The .torrent file may have issues.`);
            showToast(`Torrent warning: ${warnMsg}`, 'warning');
          }
        });
        
        // Track if files have been successfully extracted to prevent multiple attempts
        let filesExtracted = false;
        
        // Get files when torrent is ready - but only extract if download is complete
        const getFilesFromTorrent = async (torrentFiles: any[]) => {
          console.log('=== FILE EXTRACTION ATTEMPT ===');
          console.log('Files to extract:', torrentFiles.length);
          console.log('File list:', torrentFiles.map((f: any, i: number) => ({
            index: i + 1,
            name: f.name || 'Unknown',
            size: f.length ? `${(f.length / 1024 / 1024).toFixed(2)} MB` : 'Unknown',
            path: f.path || f.name || 'Unknown'
          })));
          
          // Don't extract if already extracted or if torrent isn't complete
          if (filesExtracted) {
            console.log('⏭️ Files already extracted, skipping...');
            return;
          }
          
          // Calculate total length from files if torrent.length is not available
          let totalLength = torrent.length || 0;
          if (!totalLength && torrentFiles && torrentFiles.length > 0) {
            totalLength = torrentFiles.reduce((sum: number, f: any) => sum + (f.length || 0), 0);
          }
          
          const downloaded = torrent.downloaded || 0;
          const progressRaw = torrent.progress || 0;
          const progressCalculated = totalLength > 0 ? (downloaded / totalLength) : 0;
          const progress = Math.max(progressRaw, progressCalculated);
          
          // Use appropriate units based on file size
          const sizeUnit = totalLength < 1024 ? 'bytes' : (totalLength < 1024 * 1024 ? 'KB' : 'MB');
          const formatSize = (bytes: number) => {
            if (sizeUnit === 'bytes') return `${bytes} bytes`;
            if (sizeUnit === 'KB') return `${(bytes / 1024).toFixed(2)} KB`;
            return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
          };
          
          console.log('Torrent completion check:', {
            progressRaw: `${Math.round(progressRaw * 100)}%`,
            progressCalculated: totalLength > 0 ? `${Math.round(progressCalculated * 100)}%` : 'N/A',
            progressFinal: `${Math.round(progress * 100)}%`,
            done: torrent.done ? 'Yes' : 'No',
            downloadedBytes: downloaded,
            downloadedFormatted: formatSize(downloaded),
            totalLengthBytes: totalLength,
            totalLengthFormatted: formatSize(totalLength),
            remaining: totalLength - downloaded,
            torrentLength: torrent.length || 0
          });
          
          // For very small files (< 1KB), use 100% match or allow exact match
          // For larger files, use 99% threshold to account for rounding
          const completionThreshold = totalLength < 1024 ? 1.0 : 0.99;
          const isComplete = torrent.done || 
                             progress >= 1 || 
                             (totalLength > 0 && downloaded >= totalLength * completionThreshold) ||
                             (totalLength > 0 && totalLength < 1024 && downloaded >= totalLength - 1); // Allow 1 byte difference for tiny files
          
          if (!isComplete) {
            console.log(`⏸️ Torrent not complete yet (${Math.round(progress * 100)}%), cannot extract files`);
            console.log(`  Downloaded: ${formatSize(downloaded)} / ${formatSize(totalLength)}`);
            console.log(`  Remaining: ${totalLength - downloaded} bytes`);
            console.log(`  Threshold: ${completionThreshold * 100}%`);
            console.log('Waiting for completion...');
            return;
          }
          
          try {
            console.log(`🔧 Starting extraction of ${torrentFiles.length} file(s) from torrent (progress: ${Math.round(progress * 100)}%)...`);
            setStatus('Extracting files...');
            
            const extractionStartTime = Date.now();
            console.log('📦 Beginning file blob extraction...');
            
            const fileObjs = await Promise.all(
              torrentFiles.map(async (f: any, index: number) => {
                const fileStartTime = Date.now();
                console.log(`[${index + 1}/${torrentFiles.length}] Extracting file: ${f.name}`);
                console.log(`  Size: ${f.length ? `${(f.length / 1024 / 1024).toFixed(2)} MB` : 'Unknown'}`);
                console.log(`  Path: ${f.path || f.name || 'Unknown'}`);
                
                try {
                  let blob: Blob;
                  if (f.getBlob && typeof f.getBlob === 'function') {
                    console.log(`  Method: getBlob (callback-based)`);
                    // WebTorrent's getBlob uses callback
                    blob = await new Promise<Blob>((resolve, reject) => {
                      const blobStartTime = Date.now();
                      f.getBlob((err: any, result: Blob) => {
                        if (err) {
                          console.error(`  ❌ Error getting blob for file ${index + 1} (${f.name}):`, err);
                          reject(err);
                        } else {
                          const duration = ((Date.now() - blobStartTime) / 1000).toFixed(2);
                          console.log(`  ✅ Successfully got blob for file ${index + 1} (${f.name})`);
                          console.log(`  Blob size: ${result.size ? `${(result.size / 1024 / 1024).toFixed(2)} MB` : '0 MB'}`);
                          console.log(`  Blob type: ${result.type || 'Unknown'}`);
                          console.log(`  Extraction time: ${duration}s`);
                          resolve(result);
                        }
                      });
                    });
                  } else if (f.blob && typeof f.blob === 'function') {
                    console.log(`  Method: blob() (promise-based)`);
                    blob = await f.blob();
                  } else {
                    throw new Error('No blob method available');
                  }
                  
                  if (!blob || blob.size === 0) {
                    console.error(`  ❌ Blob is empty or invalid for ${f.name}`);
                    throw new Error(`Blob for ${f.name} is empty`);
                  }
                  
                  if (blob.size !== f.length) {
                    console.warn(`  ⚠️ Blob size mismatch: expected ${f.length}, got ${blob.size}`);
                  }
                  
                  const url = URL.createObjectURL(blob);
                  // Preserve folder structure - WebTorrent files have path property
                  const filePath = f.path || f.name || 'file';
                  const fileDuration = ((Date.now() - fileStartTime) / 1000).toFixed(2);
                  console.log(`  ✅ File ${index + 1} ready (took ${fileDuration}s)`);
                  
                  return { 
                    name: f.name || 'file', 
                    size: f.length || 0, 
                    url,
                    path: filePath, // Full path including folder structure
                    blob: blob // Store the blob directly for ZIP creation
                  };
                } catch (err: any) {
                  console.error(`  ❌ Failed to extract file ${index + 1} (${f.name}):`, err);
                  throw err;
                }
              })
            );
            
            const totalDuration = ((Date.now() - extractionStartTime) / 1000).toFixed(2);
            console.log(`✅ Successfully extracted ${fileObjs.length} file(s) in ${totalDuration}s`);
            console.log('=== EXTRACTION SUMMARY ===');
            console.log('Extracted files:', fileObjs.map((f, i) => ({
              index: i + 1,
              name: f.name,
              size: `${(f.size / 1024 / 1024).toFixed(2)} MB`,
              path: f.path,
              url: f.url.substring(0, 50) + '...'
            })));
            
            console.log('🔄 Setting files in React state...');
            setFiles(fileObjs);
            filesExtracted = true;
            setIsDownloadComplete(true);
            setIsDownloading(false);
            
            if (fileObjs.length > 0) {
              setStatus(`${fileObjs.length} file${fileObjs.length > 1 ? 's' : ''} ready to download.`);
              console.log(`✅ Files state updated! Download buttons should appear now.`);
              console.log('=== FILE EXTRACTION COMPLETE ===');
            }
          } catch (err: any) {
            console.error('❌ Error getting files from torrent:', err);
            console.error('Error details:', {
              message: err.message,
              stack: err.stack,
              name: err.name
            });
            setStatus(`Error extracting files: ${err.message || 'Unknown error'}. Try the "Extract Files" button below.`);
          }
        };
        
        // When torrent metadata is ready (not download complete, just metadata)
        torrent.on('ready', () => {
          console.log('Torrent ready, metadata downloaded (progress:', Math.round((torrent.progress || 0) * 100), '%)');
          updateProgress();
          // Don't extract here - wait for download to complete
        });
        
        torrent.on('metadata', () => {
          console.log('Torrent metadata received');
          updateProgress();
        });
        
        // Periodic progress updates (every 500ms) - this ensures progress updates even if events don't fire
        // Also checks if torrent completed and triggers extraction
        let intervalCount = 0;
        const progressInterval = setInterval(() => {
          intervalCount++;
          if (torrent && !torrent.destroyed) {
            updateProgress('periodic');
            
            // Try to extract files if complete but not yet extracted
            // Calculate length from files if needed
            let totalLength = torrent.length || 0;
            if (!totalLength && torrent.files && torrent.files.length > 0) {
              totalLength = torrent.files.reduce((sum: number, f: any) => sum + (f.length || 0), 0);
            }
            const downloaded = torrent.downloaded || 0;
            
            // For very small files (< 1KB), use 100% match or allow exact match
            // For larger files, use 99% threshold to account for rounding
            const completionThreshold = totalLength < 1024 ? 1.0 : 0.99;
            const isComplete = torrent.done || 
                               torrent.progress >= 1 || 
                               (totalLength > 0 && downloaded >= totalLength * completionThreshold) ||
                               (totalLength > 0 && totalLength < 1024 && downloaded >= totalLength - 1); // Allow 1 byte difference for tiny files
            
            if (!filesExtracted && torrent.files && torrent.files.length > 0 && isComplete) {
              const sizeUnit = totalLength < 1024 ? 'bytes' : (totalLength < 1024 * 1024 ? 'KB' : 'MB');
              const formatSize = (bytes: number) => {
                if (sizeUnit === 'bytes') return `${bytes} bytes`;
                if (sizeUnit === 'KB') return `${(bytes / 1024).toFixed(2)} KB`;
                return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
              };
              
              console.log('🎯 Torrent completed detected in periodic check (interval #' + intervalCount + ')');
              console.log('Completion details:', {
                progress: `${Math.round((torrent.progress || 0) * 100)}%`,
                progressCalculated: totalLength > 0 ? `${Math.round((downloaded / totalLength) * 100)}%` : 'N/A',
                done: torrent.done ? 'Yes' : 'No',
                files: torrent.files.length,
                downloadedBytes: downloaded,
                downloadedFormatted: formatSize(downloaded),
                totalLengthBytes: totalLength,
                totalLengthFormatted: formatSize(totalLength),
                threshold: `${completionThreshold * 100}%`
              });
              getFilesFromTorrent(torrent.files);
            }
          } else {
            console.log('⏹️ Progress interval stopped (torrent destroyed or null)');
            clearInterval(progressInterval);
          }
        }, 500);
        
        // Clean up interval when torrent is destroyed
        torrent.on('destroy', () => {
          console.log('🗑️ Torrent destroyed, cleaning up...');
          clearInterval(progressInterval);
        });
        
        // Extract files when download completes
        torrent.on('done', () => {
          console.log('=== DOWNLOAD COMPLETE EVENT ===');
          console.log('Torrent is 100% complete!');
          const finalStats = {
            progress: `${Math.round((torrent.progress || 0) * 100)}%`,
            downloaded: torrent.downloaded ? `${(torrent.downloaded / 1024 / 1024).toFixed(2)} MB` : '0 MB',
            uploaded: torrent.uploaded ? `${(torrent.uploaded / 1024 / 1024).toFixed(2)} MB` : '0 MB',
            files: torrent.files?.length || 0,
            numPeers: torrent.numPeers || 0,
            done: torrent.done ? 'Yes' : 'No'
          };
          console.log('Final stats:', finalStats);
          
          setDownloadProgress(100);
          setDownloadSpeed(0);
          setTimeRemaining(0);
          setIsDownloadComplete(true);
          
          // Extract files when download is complete
          if (torrent.files && torrent.files.length > 0) {
            console.log(`📥 Starting file extraction for ${torrent.files.length} file(s)...`);
            getFilesFromTorrent(torrent.files).then(() => {
              console.log('✅ File extraction completed successfully from done event');
              setStatus('Download complete! Files ready.');
              showToast('Download complete! Files ready', 'success');
            }).catch((err) => {
              console.error('❌ Error extracting files after download:', err);
              console.error('Error stack:', err.stack);
              setStatus('Download complete, but had trouble extracting files. Try the "Extract Files" button below.');
              showToast('Download complete, but had trouble extracting files', 'warning');
            });
          } else {
            console.warn('⚠️ Download complete but no files found in torrent');
            setStatus('Download complete, but no files found.');
            showToast('Download complete, but no files found', 'warning');
            setIsDownloading(false);
          }
        });
        });
      } catch (blobErr: any) {
        // If Blob failed, try Buffer as fallback
        if (inputTorrentFile && (blobErr.message?.includes('Invalid torrent identifier') || 
                                 blobErr.message?.includes('invalid') ||
                                 blobErr.message?.includes('no web crypto'))) {
          console.log('⚠️ Blob format failed, trying Buffer as fallback...');
          console.log('Error:', blobErr.message);
          try {
            const arrBuf = await inputTorrentFile.arrayBuffer();
            const torrentBuffer = Buffer.from(arrBuf);
            console.log('Attempting to add torrent using Buffer...');
            console.log('Buffer length:', torrentBuffer.length);
            
            // Check if crypto is available
            if (typeof window !== 'undefined') {
              console.log('Web Crypto available:', !!window.crypto);
              console.log('Web Crypto Subtle available:', !!window.crypto?.subtle);
            }
            
            torrent = client.add(torrentBuffer, addOptions, (torrent: any) => {
              const infoHash = torrent.infoHash?.toString?.('hex') || torrent.infoHash;
              console.log('=== TORRENT ADDED TO CLIENT (via Buffer fallback) ===');
              console.log('InfoHash:', infoHash);
              console.log('Torrent name:', torrent.name || 'Unknown');
              console.log('Torrent length:', torrent.length ? `${(torrent.length / 1024 / 1024).toFixed(2)} MB` : 'Unknown');
              // Note: The rest of the callback logic would need to be duplicated here
              // For now, this is a fallback that should rarely be needed
            });
          } catch (bufferErr: any) {
            console.error('❌ Buffer also failed:', bufferErr.message);
            // If both Blob and Buffer fail with crypto error, provide helpful message
            if (bufferErr.message?.includes('no web crypto') || blobErr.message?.includes('no web crypto')) {
              setStatus('❌ Web Crypto API not available. Please use a modern browser with Web Crypto support.');
              showToast('Web Crypto API not available', 'error');
              setIsDownloading(false);
              setIsDownloadComplete(false);
              return;
            }
            // Buffer also failed, throw the original error
            throw blobErr;
          }
        } else {
          throw blobErr;
        }
      }
    } catch (err: any) {
      console.error('=== ERROR ADDING TORRENT (SYNCHRONOUS) ===');
      console.error('Error details:', {
        message: err.message || 'Unknown error',
        name: err.name || 'Error',
        stack: err.stack,
        source: inputMagnet ? 'Magnet URI' : inputTorrentFile ? '.torrent file' : 'Unknown'
      });
      
      // Check for crypto-related errors
      if (err.message && (err.message.includes('no web crypto') || err.message.includes('crypto') || err.message.includes('Web Crypto'))) {
        const cryptoErrorMsg = '❌ Web Crypto API Error\n\n' +
                              'WebTorrent requires Web Crypto API to parse .torrent files.\n\n' +
                              'Solutions:\n' +
                              '1. Use HTTPS (Web Crypto requires secure context)\n' +
                              '2. Use a modern browser (Chrome, Firefox, Edge, Safari)\n' +
                              '3. Use a magnet URI instead of .torrent file\n' +
                              '4. Check browser security settings';
        setStatus(cryptoErrorMsg);
        showToast('Web Crypto API error - try using a magnet URI instead', 'error');
        setIsDownloading(false);
        setIsDownloadComplete(false);
      } else if (err.message && err.message.includes('Invalid torrent identifier')) {
        setStatus('❌ Invalid .torrent file format. Please ensure the file is a valid .torrent file.');
        showToast('Invalid .torrent file format', 'error');
        setIsDownloading(false);
        setIsDownloadComplete(false);
      } else if (err.message && err.message.includes('duplicate')) {
        console.warn('⚠️ Duplicate torrent detected');
        setStatus('Torrent is already being seeded. Use existing active torrent in Profile → Seeding.');
        showToast('Torrent is already being downloaded', 'info');
        setIsDownloading(false);
      } else {
        console.error('❌ Failed to add torrent to client');
        setStatus(`Error: ${err.message || 'Failed to add torrent'}`);
        showToast(`Failed to add torrent: ${err.message || 'Unknown error'}`, 'error');
        setIsDownloading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-black">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur">
          <div className="mb-4">
            <div className="text-white text-xl font-semibold">Download via Magnet Link or .torrent File</div>
            <div className="text-sm text-zinc-400">Paste a magnet URI or upload a .torrent file to fetch files and start seeding</div>


            {/* Upload .torrent file section (moved to top) */}
            <div className="space-y-2">
              <label className="text-sm text-zinc-300">Upload a .torrent file</label>
              <div
                tabIndex={0}
                role="button"
                aria-label="Torrent file upload area"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => {
                  e.preventDefault();
                  setIsDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) {
                    const dt = new DataTransfer();
                    dt.items.add(f);
                    if (fileInputRef.current) {
                      fileInputRef.current.files = dt.files;
                      handleFileChange({ target: { files: dt.files } } as any);
                    }
                    setTorrentFile(f);
                  }
                }}
                className={`relative rounded-xl border border-dashed ${isDragging ? 'border-cyan-500/60 bg-cyan-500/5' : 'border-zinc-700 bg-zinc-950/60'} p-8 text-center cursor-pointer hover:bg-zinc-900/60 w-full`}
                style={{ outline: 'none', minHeight: '120px' }}
              >
                {!torrentFile && (
                  <div className="flex flex-col items-center gap-3 pb-4">
                    <div className="h-12 w-12 grid place-items-center rounded-full bg-zinc-800/60 text-zinc-300 mx-auto">
                      <ImagePlus size={22} />
                    </div>
                    <div className="text-zinc-200 font-medium">Click to select</div>
                    <div className="text-xs text-zinc-500">or drag and drop .torrent file here</div>
                  </div>
                )}
                {torrentFile && (
                  <div className="flex items-center justify-between text-xs text-zinc-400 mt-4">
                    <div className="truncate">{torrentFile.name}</div>
                    <button
                      onClick={() => { handleRemove(); setTorrentFile(null); }}
                      className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs text-zinc-200 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-800"
                    >
                      Remove
                    </button>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  tabIndex={-1}
                  accept=".torrent"
                  onChange={e => {
                    handleFileChange(e);
                    setTorrentFile(e.target.files?.[0] || null);
                  }}
                />
              </div>
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600 px-4 py-2 text-sm font-medium text-white hover:from-cyan-600 hover:to-indigo-700 disabled:opacity-60 mt-2"
                onClick={() => handleDownload(undefined, torrentFile || undefined)}
                disabled={!torrentFile}
              >
                {torrentFile ? 'Download & Seed from .torrent' : 'Select a .torrent file'}
              </button>
            </div>

            {/* Magnet URI section (moved below) */}
            <div className="space-y-2">
              <label className="text-sm text-zinc-300">Or paste a Magnet URI</label>
              <textarea
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-zinc-200"
                rows={3}
                placeholder="magnet:?xt=urn:btih:..."
                value={magnet}
                onChange={e => setMagnet(e.target.value)}
              />
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600 px-4 py-2 text-sm font-medium text-white hover:from-cyan-600 hover:to-indigo-700 disabled:opacity-60 mt-2"
                onClick={() => handleDownload(magnet, undefined)}
                disabled={!magnet}
              >
                {magnet ? 'Download & Seed' : 'Paste a magnet link'}
              </button>
            </div>


            {/* Animated download progress bar */}
            {isDownloading && (
              <div className="my-6">
                <div className="rounded-xl bg-zinc-900/90 p-6 shadow-lg border border-cyan-700">
                  <AnimatedDownload 
                    isAnimating={isDownloading} 
                    className="text-white"
                    progress={downloadProgress}
                    timeRemainingSeconds={timeRemaining}
                    downloadSpeed={downloadSpeed}
                    filesCount={fileCount}
                  />
                  <div className="text-xs text-cyan-300 mt-2 font-semibold drop-shadow">
                    Peers connected: {peerCount}
                    {downloadSpeed > 0 && (
                      <span className="ml-4">
                        Speed: {(downloadSpeed / 1024 / 1024).toFixed(2)} MB/s
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* Status and manual retry */}
            <div className="flex items-center justify-between">
              {status && !status.includes('❌') && !status.includes('⚠️') && !status.includes('Faulty') && !status.includes('Failed') && !status.includes('Warning') && !status.includes('ready') && !status.includes('complete') && (
                <div className="text-sm text-zinc-300 flex-1">
                  {status}
                </div>
              )}
              {isDownloadComplete && files.length === 0 && currentTorrent && (
                <button
                  onClick={async () => {
                    setStatus('Manually extracting files...');
                    try {
                      if (currentTorrent.files && currentTorrent.files.length > 0) {
                        console.log(`Manually extracting ${currentTorrent.files.length} file(s)...`);
                        const fileObjs = await Promise.all(
                          currentTorrent.files.map(async (f: any) => {
                            let blob: Blob;
                            if (f.getBlob && typeof f.getBlob === 'function') {
                              blob = await new Promise<Blob>((resolve, reject) => {
                                f.getBlob((err: any, result: Blob) => {
                                  if (err) reject(err);
                                  else resolve(result);
                                });
                              });
                            } else if (f.blob && typeof f.blob === 'function') {
                              blob = await f.blob();
                            } else {
                              throw new Error('No blob method available');
                            }
                            const url = URL.createObjectURL(blob);
                            const filePath = f.path || f.name || 'file';
                            return { 
                              name: f.name || 'file', 
                              size: f.length || 0, 
                              url,
                              path: filePath,
                              blob: blob
                            };
                          })
                        );
                        console.log(`Successfully extracted ${fileObjs.length} file(s) manually`);
                        setFiles(fileObjs);
                        setStatus(`${fileObjs.length} file${fileObjs.length > 1 ? 's' : ''} extracted!`);
                        showToast(`${fileObjs.length} file${fileObjs.length > 1 ? 's' : ''} extracted`, 'success');
                      } else {
                        setStatus('No files found in torrent.');
                        showToast('No files found in torrent', 'warning');
                      }
                    } catch (err: any) {
                      console.error('Manual extraction error:', err);
                      setStatus(`Failed to extract: ${err.message || 'Unknown error'}`);
                      showToast(`Failed to extract: ${err.message || 'Unknown error'}`, 'error');
                    }
                  }}
                  className="ml-4 text-xs text-cyan-400 hover:text-cyan-300 px-3 py-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20"
                >
                  Extract Files
                </button>
              )}
            </div>

            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-zinc-300">
                    {files.length === 1 ? 'File' : `${files.length} Files`}
                  </div>
                  {/* Show ZIP option if multiple files OR if single file has folder structure */}
                  {(files.length > 1 || (files.length === 1 && files[0].path && files[0].path.includes('/'))) && (
                    <button
                      onClick={async () => {
                        if (files.length === 0) {
                          setStatus('No files available to ZIP');
                          showToast('No files available to ZIP', 'warning');
                          return;
                        }
                        
                        // Warn if download might not be complete
                        if (!isDownloadComplete && downloadProgress < 100) {
                          const proceed = confirm('Download may not be complete yet. Some files might be missing from the ZIP. Continue anyway?');
                          if (!proceed) return;
                        }
                        
                        setStatus('Creating ZIP archive...');
                        try {
                          const zip = new JSZip();
                          let filesAdded = 0;
                          
                          // Add all files to ZIP with preserved folder structure
                          // Use stored blobs directly, or fetch if blob not available
                          await Promise.all(
                            files.map(async (f, index) => {
                              try {
                                let blob: Blob;
                                if (f.blob) {
                                  // Use stored blob directly (preferred)
                                  blob = f.blob;
                                } else {
                                  // Fallback: fetch from URL if blob not stored
                                  console.log(`Fetching ${f.name} from URL for ZIP...`);
                                  const response = await fetch(f.url);
                                  if (!response.ok) {
                                    throw new Error(`Failed to fetch ${f.name}: ${response.statusText}`);
                                  }
                                  blob = await response.blob();
                                }
                                
                                // Normalize path for ZIP (ensure forward slashes)
                                let zipPath = f.path || f.name;
                                // Remove leading slash if present
                                zipPath = zipPath.replace(/^\/+/, '');
                                
                                // Verify blob is valid
                                if (!blob || blob.size === 0) {
                                  throw new Error(`Blob for ${f.name} is empty or invalid`);
                                }
                                
                                // Add file to ZIP
                                zip.file(zipPath, blob);
                                filesAdded++;
                                console.log(`Added to ZIP: ${zipPath} (${(blob.size / 1024).toFixed(1)} KB)`);
                              } catch (err: any) {
                                console.error(`Error adding ${f.name} to ZIP:`, err);
                                setStatus(`Warning: Could not add ${f.name} to ZIP: ${err.message || 'Unknown error'}. Continuing...`);
                                showToast(`Warning: Could not add ${f.name} to ZIP`, 'warning');
                              }
                            })
                          );
                          
                          if (filesAdded === 0) {
                            throw new Error('No files could be added to ZIP');
                          }
                          
                          setStatus(`Compressing ${filesAdded} file${filesAdded > 1 ? 's' : ''}...`);
                          
                          // Generate ZIP file
                          const zipBlob = await zip.generateAsync({ 
                            type: 'blob',
                            compression: 'DEFLATE',
                            compressionOptions: { level: 6 }
                          }, (metadata) => {
                            // Update status with compression progress
                            if (metadata.percent) {
                              setStatus(`Compressing... ${Math.round(metadata.percent)}%`);
                            }
                          });
                          
                          setStatus('Starting download...');
                          
                          // Create download link
                          const url = URL.createObjectURL(zipBlob);
                          // Extract folder name from path or use default
                          let zipName = 'downloads.zip';
                          if (files[0]?.path) {
                            const folderMatch = files[0].path.match(/^([^\/]+)/);
                            if (folderMatch) {
                              zipName = folderMatch[1] + '.zip';
                            }
                          } else if (files.length === 1 && files[0]?.name) {
                            zipName = files[0].name.replace(/\.[^/.]+$/, '') + '.zip';
                          }
                          
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = zipName;
                          document.body.appendChild(a);
                          a.click();
                          
                          setTimeout(() => {
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                            setStatus(`ZIP download started! (${filesAdded} file${filesAdded > 1 ? 's' : ''})`);
                            showToast(`ZIP download started! (${filesAdded} file${filesAdded > 1 ? 's' : ''})`, 'success');
                          }, 100);
                        } catch (err: any) {
                          console.error('Error creating ZIP:', err);
                          setStatus(`Failed to create ZIP: ${err.message || 'Unknown error'}. Try downloading files individually.`);
                          showToast(`Failed to create ZIP: ${err.message || 'Unknown error'}`, 'error');
                        }
                      }}
                      className="text-xs text-cyan-400 hover:text-cyan-300 px-3 py-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20"
                    >
                      📦 Download as ZIP
                    </button>
                  )}
                </div>
                
                {/* Folder Component Display */}
                <div className="relative rounded-xl border border-zinc-700 bg-zinc-950/60 p-8 mb-4">
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
                          files[0].name
                        ) : (
                          `${files.length} file${files.length > 1 ? 's' : ''} downloaded`
                        )}
                      </div>
                      {files.length > 1 && (
                        <div className="text-xs text-zinc-400 max-h-32 overflow-y-auto space-y-1">
                          {files.slice(0, 5).map((f, i) => (
                            <div key={i} className="text-xs text-zinc-500 truncate">
                              • {f.path || f.name} ({formatBytes(f.size)})
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
                  </div>
                </div>
                
                <div className="max-h-96 overflow-y-auto space-y-2">
                  <div className="text-xs text-zinc-500 mb-2 px-1">
                    {(files.length > 1 || (files.length === 1 && files[0].path && files[0].path.includes('/')))
                      ? '💡 Tip: Use "Download as ZIP" above to download with preserved folder structure, or download individually below.'
                      : 'Click Save to download this file.'}
                  </div>
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-100 truncate">{f.name}</div>
                        {f.path && f.path !== f.name && (
                          <div className="text-xs text-zinc-500 truncate" title={f.path}>
                            📁 {f.path}
                          </div>
                        )}
                        <div className="text-xs text-zinc-500 mt-1">{formatBytes(f.size)}</div>
                      </div>
                      <a 
                        className="text-sm text-cyan-400 hover:text-cyan-300 ml-2 flex-shrink-0 px-3 py-1.5 rounded-md border border-zinc-700/50 bg-zinc-800/30 hover:bg-zinc-800/50" 
                        href={f.url} 
                        download={f.path || f.name}
                      >
                        Save
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


