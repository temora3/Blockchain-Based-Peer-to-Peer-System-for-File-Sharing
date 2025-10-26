let client: any | null = null;
const TRACKER_ANNOUNCE = (process.env.NEXT_PUBLIC_TRACKER_URL || 'ws://localhost:4000') + '/announce';

export async function getWebTorrentClient(): Promise<any> {
  if (typeof window === 'undefined') throw new Error('WebTorrent only available in browser');
  if (!client) {
  // Use the browser build of WebTorrent to avoid Node.js-only code
  // @ts-ignore: No types for browser build
  const WebTorrent = (await import('webtorrent/dist/webtorrent.min.js')).default as any;
    client = new WebTorrent({
      tracker: {
        rtcConfig: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
      },
      announce: [TRACKER_ANNOUNCE]
    } as any);
  }
  return client;
}

export async function createTorrentFromFile(file: File): Promise<{ magnetURI: string }>
{
  const client = await getWebTorrentClient();
  return new Promise((resolve, reject) => {
    client.seed(file, { announce: [TRACKER_ANNOUNCE] } as any, (torrent: any) => {
      resolve({ magnetURI: torrent.magnetURI });
    }).on('error', reject);
  });
}

export async function downloadTorrent(magnetURI: string): Promise<Blob[]> {
  const client = await getWebTorrentClient();
  return new Promise((resolve, reject) => {
    client.add(magnetURI, { announce: [TRACKER_ANNOUNCE] } as any, (torrent: any) => {
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


