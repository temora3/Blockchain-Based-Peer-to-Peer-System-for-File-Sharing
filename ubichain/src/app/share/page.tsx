"use client";
import { useEffect, useRef, useState } from 'react';
import AuthService from '@/lib/auth';
import { getWebTorrentClient } from '@/lib/torrent';
import createTorrent from 'create-torrent';
import { getContracts } from '@/lib/web3';
import { useImageUpload } from '@/hooks/use-image-upload';
import { ImagePlus } from 'lucide-react';
import { v4 as uuidv4 } from "uuid";
import { supabase } from '@/lib/supabase/client';

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
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [magnet, setMagnet] = useState('');
  const [torrentFileUrl, setTorrentFileUrl] = useState<string | null>(null);
  const { previewUrl, fileName, fileInputRef, handleThumbnailClick, handleFileChange, handleRemove } = useImageUpload({
    onUpload: () => {},
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dropPreview, setDropPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!previewUrl) return;
    setDropPreview(previewUrl);
  }, [previewUrl]);

  const handleCreate = async () => {
    if (!file) return;
    setStatus('Creating torrent...');
    // Get current userId from Supabase
    const { user, error } = await AuthService.getCurrentUser();
    if (!user || error) {
      setStatus('You must be signed in to share a file.');
      return;
    }
    const userId = user.id;
    if (!userId) {
      setStatus('Could not determine user ID.');
      return;
    }
    // Generate .torrent file using create-torrent
    createTorrent(file, { announceList: [[process.env.NEXT_PUBLIC_TRACKER_URL + '/announce']] }, async (err: any, torrentBuf: Buffer) => {
      if (err || !torrentBuf) {
        setStatus('Failed to create .torrent file');
        setTorrentFileUrl(null);
        return;
      }
      // Ensure the Blob is the .torrent file, not the original file
      const uint8 = Uint8Array.from(torrentBuf as any);
      const torrentBlob = new Blob([uint8], { type: 'application/x-bittorrent' });
      const torrentFileObj = new File([torrentBlob], `${file.name}.torrent`, { type: "application/x-bittorrent" });
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
      // Seed the file with WebTorrent
      const client = await getWebTorrentClient();
      client.seed(file, { announce: [process.env.NEXT_PUBLIC_TRACKER_URL + '/announce'] }, async (torrent: any) => {
        setMagnet(torrent.magnetURI);
        setStatus('Seeding. Share the magnet link or .torrent file below.');
        // Save to MongoDB via API
        try {
          const res = await fetch('/api/torrents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name && name.trim() ? name : (file.name ? file.name.replace(/\.[^/.]+$/, '') : 'file'),
              magnetURI: torrent.magnetURI,
              torrentFileUrl: publicTorrentUrl,
              userId,
            }),
          });
          if (!res.ok) {
            setStatus('Torrent created, but failed to save to database.');
          }
        } catch (e) {
          setStatus('Torrent created, but error saving to database.');
        }
      });
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-black">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur">
          <div className="mb-4">
            <div className="text-white text-xl font-semibold">Share a file</div>
            <div className="text-sm text-zinc-400">Create a torrent and register on-chain</div>
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

            <div
              tabIndex={0}
              role="button"
              aria-label="File upload area"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => {
                    // ...existing code...
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
                  setFile(f);
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
                  <div className="text-xs text-zinc-500">or drag and drop file here</div>
                </div>
              )}
              {/* File preview (if present) */}
              {dropPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={dropPreview} alt="preview" className="max-h-72 rounded-lg object-contain mx-auto" style={{ pointerEvents: 'none', position: 'relative', zIndex: 2 }} />
              )}
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                tabIndex={-1}
                onChange={e => {
                  handleFileChange(e);
                  setFile(e.target.files?.[0] || null);
                }}
              />
              {/* File name and Remove button row */}
              <div className="flex items-center justify-between text-xs text-zinc-400 mt-4" style={{ position: 'relative', zIndex: 3 }}>
                <div className="truncate">{name || fileName || file?.name || 'No file selected'}</div>
                {(dropPreview || previewUrl) && (
                  <button
                    onClick={() => { handleRemove(); if (dropPreview) { URL.revokeObjectURL(dropPreview); setDropPreview(null); } setFile(null); }}
                    className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs text-zinc-200 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-800"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="pt-2">
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600 px-4 py-2 text-sm font-medium text-white hover:from-cyan-600 hover:to-indigo-700 disabled:opacity-60"
                onClick={handleCreate}
                disabled={!file}
              >
                {file ? 'Create & Register' : 'Select a file to continue'}
              </button>
            </div>

            {status && <div className="text-sm text-zinc-300">{status}</div>}

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
                          const fileName = (name && name.trim() ? name : (file?.name ? file.name.replace(/\.[^/.]+$/, '') : 'file')) + '.torrent';
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
      </div>
    </div>
  );
}


