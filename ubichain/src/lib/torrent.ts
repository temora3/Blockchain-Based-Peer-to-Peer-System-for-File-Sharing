let client: any | null = null;
// Use default WebTorrent trackers (no custom server needed)
const DEFAULT_TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.fastcast.nz'
];

export async function getWebTorrentClient(): Promise<any> {
  if (typeof window === 'undefined') throw new Error('WebTorrent only available in browser');
  if (!client) {
  // Use the browser build of WebTorrent to avoid Node.js-only code
  // @ts-ignore: No types for browser build
  const WebTorrent = (await import('webtorrent/dist/webtorrent.min.js')).default as any;
    client = new WebTorrent({
      tracker: {
        // Enhanced WebRTC configuration for better peer connectivity
        rtcConfig: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
          ]
        }
      },
      announce: DEFAULT_TRACKERS
    } as any);
    
    // Debug logging for peer connections
    client.on('error', (err: any) => console.error('WebTorrent error:', err));
    client.on('warning', (err: any) => console.warn('WebTorrent warning:', err));
    
    // Log peer connections
    client.on('torrent', (torrent: any) => {
      console.log('New torrent added:', torrent.infoHash);
      torrent.on('peer', () => {
        console.log('Connected to peer for:', torrent.infoHash);
      });
      torrent.on('noPeers', (announceType: string) => {
        console.log('No peers found for:', torrent.infoHash, announceType);
      });
    });
    
    // Expose client globally for points calculation
    (window as any).__webtorrentClient = client;
  }
  return client;
}

export async function createTorrentFromFile(file: File): Promise<{ magnetURI: string }>
{
  const client = await getWebTorrentClient();
  return new Promise((resolve, reject) => {
    client.seed(file, { announce: DEFAULT_TRACKERS } as any, (torrent: any) => {
      resolve({ magnetURI: torrent.magnetURI });
    }).on('error', reject);
  });
}

export async function downloadTorrent(magnetURI: string): Promise<Blob[]> {
  const client = await getWebTorrentClient();
  return new Promise((resolve, reject) => {
    client.add(magnetURI, { announce: DEFAULT_TRACKERS } as any, (torrent: any) => {
      const filePromises = torrent.files.map((f: any) => new Promise<Blob>((res, rej) => {
        f.getBlob((err: any, blob: Blob) => {
          if (err) return rej(err);
          res(blob);
        });
      }));
      Promise.all(filePromises).then(resolve).catch(reject);
    }).on('error', reject);
  });
}

export function getPeerId(): string | null {
  // Note: when called early on SSR, return null
  if (typeof window === 'undefined') return null;
  try {
    const c = (client as any);
    return c?.peerId || null;
  } catch {
    return null;
  }
}


