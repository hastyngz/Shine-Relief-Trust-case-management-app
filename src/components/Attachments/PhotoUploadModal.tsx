import React, { useState, useRef } from 'react';
import {
  Camera,
  Image as ImageIcon,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  Tag,
  FileText,
} from 'lucide-react';
import {
  AttachmentTargetType,
  AttachmentCategory,
  PhotoAttachment,
} from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { uploadPhotoAttachment } from '../../services/attachmentService';
import { formatBytes } from '../../utils/imageOptimizer';

interface PhotoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: AttachmentTargetType;
  targetId: string;
  targetTitle?: string; // e.g. "Beatrice Banda" or "Sunrise Cottage"
  defaultCategory?: AttachmentCategory;
  onUploaded?: (attachment: PhotoAttachment) => void;
}

const CATEGORY_OPTIONS: { [key in AttachmentTargetType]?: AttachmentCategory[] } = {
  girl: [
    'Profile Photo',
    'School Document',
    'Report Card',
    'Medical Document',
    'Prescription',
    'Family Visit',
    'Supporting Document',
    'Other',
  ],
  household: [
    'Household Condition',
    'Repairs & Maintenance',
    'Group Activity',
    'Receipt',
    'Supporting Document',
    'Other',
  ],
  educationalFollowUp: [
    'School Document',
    'Report Card',
    'Supporting Document',
    'Other',
  ],
  healthFollowUp: [
    'Medical Document',
    'Prescription',
    'Receipt',
    'Supporting Document',
    'Other',
  ],
  familyFollowUp: [
    'Family Visit',
    'Supporting Document',
    'Other',
  ],
  householdActivity: [
    'Group Activity',
    'Household Condition',
    'Repairs & Maintenance',
    'Receipt',
    'Supporting Document',
    'Other',
  ],
  rentPayment: [
    'Receipt',
    'Supporting Document',
    'Other',
  ],
  expense: [
    'Receipt',
    'Supporting Document',
    'Other',
  ],
};

const ALL_CATEGORIES: AttachmentCategory[] = [
  'Profile Photo',
  'School Document',
  'Report Card',
  'Medical Document',
  'Prescription',
  'Household Condition',
  'Repairs & Maintenance',
  'Group Activity',
  'Family Visit',
  'Receipt',
  'Supporting Document',
  'Other',
];

export const PhotoUploadModal: React.FC<PhotoUploadModalProps> = ({
  isOpen,
  onClose,
  targetType,
  targetId,
  targetTitle,
  defaultCategory,
  onUploaded,
}) => {
  const { currentUser, staffProfile, role } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState<AttachmentCategory>(
    defaultCategory || CATEGORY_OPTIONS[targetType]?.[0] || 'Supporting Document'
  );
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFilesSelected = (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    setError(null);
    const newFiles = Array.from(selectedFiles);
    setFiles((prev) => [...prev, ...newFiles]);

    // Create preview URLs
    const newUrls = newFiles.map((file) => URL.createObjectURL(file));
    setPreviewUrls((prev) => [...prev, ...newUrls]);
  };

  const removeFile = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      setError('Please take a photo or select an image to upload.');
      return;
    }

    if (!currentUser) {
      setError('You must be signed in to upload photos.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgressText(
          files.length > 1
            ? `Optimizing & uploading ${i + 1} of ${files.length}...`
            : 'Compressing and uploading photo to Firebase Storage...'
        );

        const attachment = await uploadPhotoAttachment({
          file,
          targetType,
          targetId,
          caption: caption.trim() || undefined,
          category,
          date,
          user: {
            uid: currentUser.uid,
            fullName: staffProfile?.fullName || currentUser.displayName || undefined,
            email: currentUser.email || '',
            role: role || undefined,
          },
        });

        if (onUploaded) {
          onUploaded(attachment);
        }
      }

      // Cleanup previews
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
      setFiles([]);
      setPreviewUrls([]);
      setCaption('');
      onClose();
    } catch (err: any) {
      console.error('Upload photo error:', err);
      setError(err.message || 'Failed to upload photo. Please check your connection.');
    } finally {
      setUploading(false);
      setProgressText('');
    }
  };

  const availableCategories = CATEGORY_OPTIONS[targetType] || ALL_CATEGORIES;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/70 backdrop-blur-xs overflow-y-auto animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-lg overflow-hidden my-auto">
        {/* Header */}
        <div className="bg-teal-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-800 flex items-center justify-center text-amber-400">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">Attach Photo or Document</h3>
              {targetTitle && (
                <p className="text-xs text-teal-200">
                  Target: <span className="font-semibold text-white">{targetTitle}</span>
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="p-1 rounded-lg text-teal-200 hover:text-white hover:bg-teal-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleUploadAll} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Hidden inputs for camera capture & gallery file picker */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              handleFilesSelected(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFilesSelected(e.target.files);
              e.target.value = '';
            }}
          />

          {/* Action Buttons: Take Photo vs Choose from Gallery */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
              className="flex flex-col items-center justify-center gap-2 p-4 bg-teal-50 hover:bg-teal-100/80 border-2 border-dashed border-teal-400 rounded-xl text-teal-900 transition-all active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-full bg-teal-900 text-amber-400 flex items-center justify-center shadow-xs">
                <Camera className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold">Take Photo</span>
              <span className="text-[10px] text-teal-700">Use phone camera</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex flex-col items-center justify-center gap-2 p-4 bg-stone-50 hover:bg-stone-100 border-2 border-dashed border-stone-300 rounded-xl text-stone-800 transition-all active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-full bg-stone-800 text-white flex items-center justify-center shadow-xs">
                <ImageIcon className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold">Choose Photos</span>
              <span className="text-[10px] text-stone-500">Pick from device</span>
            </button>
          </div>

          {/* Selected Previews */}
          {files.length > 0 && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-stone-700">
                Selected Photos ({files.length})
              </label>
              <div className="grid grid-cols-3 gap-2 max-h-44 overflow-y-auto p-1 bg-stone-50 rounded-xl border border-stone-200">
                {files.map((file, idx) => (
                  <div
                    key={idx}
                    className="relative group rounded-lg overflow-hidden border border-stone-300 bg-white aspect-square shadow-2xs"
                  >
                    <img
                      src={previewUrls[idx]}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      disabled={uploading}
                      className="absolute top-1 right-1 p-1 rounded-full bg-red-600 text-white opacity-90 hover:opacity-100 shadow-sm"
                      title="Remove"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <div className="absolute bottom-0 inset-x-0 bg-stone-900/75 text-white text-[9px] px-1 py-0.5 truncate text-center">
                      {formatBytes(file.size)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Category Selection */}
          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-teal-800" />
              Category / Documentation Type
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as AttachmentCategory)}
              disabled={uploading}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-700 font-medium"
            >
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Date Picker */}
          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-teal-800" />
              Document / Photo Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={uploading}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-700"
            />
          </div>

          {/* Caption / Description (Optional) */}
          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-teal-800" />
              Description / Caption <span className="text-stone-400 font-normal lowercase">(optional)</span>
            </label>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              disabled={uploading}
              placeholder="e.g. Standard 8 Term 2 Report Card or Roof repair documentation"
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-700"
            />
          </div>

          {/* Mobile optimization reminder */}
          <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200 text-[11px] text-stone-600">
            <span className="font-semibold text-teal-900">Automatic Mobile Optimization:</span> Large phone photos are automatically compressed before upload to save mobile data while keeping text sharp.
          </div>

          {/* Upload Status / Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || files.length === 0}
              className="px-5 py-2.5 bg-teal-900 hover:bg-teal-950 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 active:scale-[0.99]"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>{progressText || 'Uploading...'}</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 text-amber-400" />
                  <span>
                    Upload {files.length > 0 ? `(${files.length})` : ''} to Firebase Storage
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
