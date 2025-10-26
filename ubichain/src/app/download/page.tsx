"use client";
import { useState } from 'react';
import { getWebTorrentClient } from '@/lib/torrent';
import { useRef } from 'react';
import { useImageUpload } from '@/hooks/use-image-upload';
import { ImagePlus } from 'lucide-react';
// @ts-ignore
import parseTorrent from 'parse-torrent';
import { Buffer } from 'buffer';

export default function DownloadPage() {
  const [magnet, setMagnet] = useState('');
  const [status, setStatus] = useState('');
  const [files, setFiles] = useState<{ name: string; size: number; url: string }[]>([]);
  const [torrentFile, setTorrentFile] = useState<File | null>(null);
  const { previewUrl, fileInputRef, handleFileChange, handleRemove } = useImageUpload({ onUpload: () => {} });
  const [isDragging, setIsDragging] = useState(false);
  const [dropPreview, setDropPreview] = useState<string | null>(null);

  // Download handler for both magnet and .torrent file
  const handleDownload = async (inputMagnet?: string, inputTorrentFile?: File) => {
    setFiles([]);
    setStatus('Connecting to peers...');
    const client = await getWebTorrentClient();
    let source: string | Buffer | undefined = undefined;
    if (inputMagnet) {
      source = inputMagnet;
    } else if (inputTorrentFile) {
      const arrBuf = await inputTorrentFile.arrayBuffer();
      source = Buffer.from(arrBuf);
    }
    if (!source) return;
    client.add(source, (torrent: any) => {
      setStatus('Downloading...');
      torrent.on('download', () => {
        const progress = (torrent.progress * 100).toFixed(1);
        setStatus(`Downloading... ${progress}%`);
      });
      torrent.on('done', () => {
        setStatus('Download complete. Seeding to earn points...');
      });
      (async () => {
        const fileObjs = await Promise.all(
          torrent.files.map(async (f: any) => {
            const blob = await f.blob();
            const url = URL.createObjectURL(blob);
            return { name: f.name, size: f.length, url };
          })
        );
        setFiles(fileObjs);
      })();
    });
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

            {status && <div className="text-sm text-zinc-300">{status}</div>}

            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-sm text-zinc-300">Files</div>
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                    <div>
                      <div className="text-sm text-zinc-100">{f.name}</div>
                      <div className="text-xs text-zinc-500">{(f.size/1024/1024).toFixed(2)} MB</div>
                    </div>
                    <a className="text-sm text-cyan-400 hover:text-cyan-300" href={f.url} download={f.name}>Save</a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


