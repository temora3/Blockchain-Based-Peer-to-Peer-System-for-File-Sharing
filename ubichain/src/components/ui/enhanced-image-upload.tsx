"use client";
import * as React from "react";
import { useRef, useState } from "react";
import { useImageUpload } from "../../hooks/use-image-upload";
import { supabase } from "@/lib/supabase/client";

interface EnhancedImageUploadProps {
  value?: string;
  onChange?: (url: string) => void;
  title?: string;
  supportedFormats?: string;
  onUploadStart?: () => void;
  onUploadComplete?: (url: string) => void;
  onUploadError?: (error: string) => void;
}

export function EnhancedImageUpload({ 
  value, 
  onChange, 
  title = "Image Upload",
  supportedFormats = "Supported formats: JPG, PNG, GIF",
  onUploadStart,
  onUploadComplete,
  onUploadError
}: EnhancedImageUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const dropRef = useRef<HTMLDivElement>(null);
  
  const {
    previewUrl,
    fileName,
    fileInputRef,
    handleThumbnailClick,
    handleFileChange: originalHandleFileChange,
    handleRemove,
  } = useImageUpload();

  // Function to upload file to Supabase Storage
  const uploadFile = async (file: File) => {
    try {
      setUploading(true);
      setUploadProgress(0);
      onUploadStart?.();

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      // Handle refresh token errors gracefully
      if (userError) {
        if (userError.message?.includes('Refresh Token') || userError.message?.includes('refresh_token')) {
          console.log('Invalid refresh token detected during image upload, clearing session');
          await supabase.auth.signOut();
          throw new Error('Session expired. Please sign in again.');
        }
        throw new Error(`Authentication error: ${userError.message}`);
      }
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Create a unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `profile-pictures/${fileName}`;

      // Upload file to Supabase Storage
      const { data, error } = await supabase.storage
        .from('avatars') // You'll need to create this bucket in Supabase
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        throw error;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setUploadProgress(100);
      onUploadComplete?.(publicUrl);
      if (onChange) onChange(publicUrl);
      
      return publicUrl;
    } catch (error: any) {
      console.error('Upload error:', error);
      onUploadError?.(error.message || 'Upload failed');
      throw error;
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Enhanced file change handler
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      onUploadError?.('Invalid file type. Please select JPG, PNG, or GIF.');
      return;
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      onUploadError?.('File too large. Please select a file smaller than 5MB.');
      return;
    }

    // Show preview immediately
    originalHandleFileChange(event);
    
    // Upload the file
    try {
      await uploadFile(file);
    } catch (error) {
      // Error handling is done in uploadFile
    }
  };

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

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      
      // Validate file type
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
      if (!validTypes.includes(file.type)) {
        onUploadError?.('Invalid file type. Please select JPG, PNG, or GIF.');
        return;
      }

      // Validate file size (5MB max)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        onUploadError?.('File too large. Please select a file smaller than 5MB.');
        return;
      }

      // Show preview immediately
      const event = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
      originalHandleFileChange(event);
      
      // Upload the file
      try {
        await uploadFile(file);
      } catch (error) {
        // Error handling is done in uploadFile
      }
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
        <p className="text-sm text-gray-300">{supportedFormats}</p>
      </div>

      {/* Upload Area */}
      <div
        ref={dropRef}
        className={`relative w-full h-64 rounded-lg border-2 border-dashed transition-colors duration-200 ${
          uploading ? "cursor-not-allowed" : "cursor-pointer"
        } ${
          dragActive 
            ? "border-cyan-500 bg-cyan-950/20" 
            : uploading
            ? "border-yellow-500 bg-yellow-950/20"
            : "border-gray-400 bg-gray-800/50"
        }`}
        onClick={uploading ? undefined : handleThumbnailClick}
        onDragEnter={uploading ? undefined : handleDrag}
        onDragOver={uploading ? undefined : handleDrag}
        onDragLeave={uploading ? undefined : handleDrag}
        onDrop={uploading ? undefined : handleDrop}
      >
        {uploading ? (
          <div className="flex flex-col items-center justify-center h-full text-white">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mb-4"></div>
            <p className="font-semibold text-white mb-2">Uploading...</p>
            <div className="w-32 bg-gray-700 rounded-full h-2 mb-2">
              <div 
                className="bg-cyan-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-300">{uploadProgress}%</p>
          </div>
        ) : previewUrl ? (
          <div className="relative w-full h-full">
            <img 
              src={previewUrl} 
              alt="Upload preview" 
              className="w-full h-full object-cover rounded-lg" 
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity duration-200 rounded-lg flex items-center justify-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove();
                }}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-white">
            {/* Image Icon with Plus */}
            <div className="relative mb-4">
              <svg 
                width="48" 
                height="48" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                className="text-white"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21,15 16,10 5,21"/>
              </svg>
              {/* Plus icon overlay */}
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-cyan-500 rounded-full flex items-center justify-center">
                <svg 
                  width="12" 
                  height="12" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="white" 
                  strokeWidth="3" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </div>
            </div>
            
            <div className="text-center">
              <p className="font-semibold text-white mb-1">Click to select</p>
              <p className="text-gray-300">or drag and drop file here</p>
            </div>
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
          <div className="absolute inset-0 bg-cyan-500/10 border-2 border-cyan-500 rounded-lg pointer-events-none transition-all duration-200" />
        )}
      </div>

      {/* File name display */}
      {fileName && (
        <div className="mt-3 text-sm text-gray-400 text-center truncate">
          {fileName}
        </div>
      )}
    </div>
  );
}
