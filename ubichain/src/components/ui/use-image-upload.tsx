"use client";
import * as React from "react";
import { useRef, useState } from "react";
import { useImageUpload } from "../../hooks/use-image-upload";

interface UseImageUploadProps {
  value?: string;
  onChange?: (url: string) => void;
}

export function UseImageUpload({ value, onChange }: UseImageUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const {
    previewUrl,
    fileName,
    fileInputRef,
    handleThumbnailClick,
    handleFileChange,
    handleRemove,
  } = useImageUpload({
    onUpload: (url) => {
      if (onChange) onChange(url);
    },
  });

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const event = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileChange(event);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-xs">
      <div
        ref={dropRef}
        className={`relative w-32 h-32 rounded-2xl border-2 flex items-center justify-center transition-colors duration-200 cursor-pointer ${dragActive ? "border-cyan-500 bg-cyan-950/30" : "border-zinc-700 bg-zinc-900/60"}`}
        onClick={handleThumbnailClick}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        style={{ overflow: "hidden" }}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="Profile preview" className="object-cover w-full h-full" />
        ) : (
          <div className="flex flex-col items-center justify-center text-zinc-400">
            <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="mx-auto mb-2"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16v-4m0 0V8m0 4h4m-4 0H8m12 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2m16 0V8a2 2 0 00-2-2H6a2 2 0 00-2 2v8" /></svg>
            <span className="text-xs">Drag & drop or click to upload</span>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        {dragActive && (
          <div className="absolute inset-0 bg-cyan-500/10 border-2 border-cyan-500 rounded-2xl pointer-events-none transition-all duration-200" />
        )}
      </div>
      {fileName && (
        <div className="text-xs text-zinc-400 mt-1 truncate w-full text-center">{fileName}</div>
      )}
      {previewUrl && (
        <button
          className="rounded bg-red-600 px-3 py-1 text-white text-xs font-medium mt-2"
          onClick={handleRemove}
          type="button"
        >
          Remove
        </button>
      )}
    </div>
  );
}
