import React, { useState } from 'react';
import {
  Camera,
  Image as ImageIcon,
  Plus,
  Trash2,
  Download,
  Calendar,
  User,
  Tag,
  ExternalLink,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Loader2,
  FileText,
} from 'lucide-react';
import {
  PhotoAttachment,
  AttachmentCategory,
  AttachmentTargetType,
} from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import {
  canDeleteAttachment,
  canUploadAttachment,
  deletePhotoAttachment,
} from '../../services/attachmentService';
import { PhotoUploadModal } from './PhotoUploadModal';
import { formatDate } from '../../utils/export';
import { formatBytes } from '../../utils/imageOptimizer';

interface PhotoGalleryProps {
  attachments: PhotoAttachment[];
  targetType: AttachmentTargetType;
  targetId: string;
  targetTitle?: string;
  title?: string;
  subtitle?: string;
  defaultCategory?: AttachmentCategory;
  onAttachmentDeleted?: (attachmentId: string) => void;
  onAttachmentAdded?: (attachment: PhotoAttachment) => void;
}

export const PhotoGallery: React.FC<PhotoGalleryProps> = ({
  attachments,
  targetType,
  targetId,
  targetTitle,
  title = 'Photos & Attached Documentation',
  subtitle = 'Secure photos, report cards, medical records and supporting documents stored in Firebase Storage',
  defaultCategory,
  onAttachmentDeleted,
  onAttachmentAdded,
}) => {
  const { currentUser, role, isAdmin, isViewOnly } = useAuth();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmAttachment, setDeleteConfirmAttachment] = useState<PhotoAttachment | null>(null);

  const canUpload = canUploadAttachment(role, isViewOnly);

  // Filter categories present in current attachments list
  const availableCategories = Array.from(
    new Set(attachments.map((a) => a.category).filter(Boolean))
  );

  const filteredAttachments = attachments.filter((att) => {
    if (selectedCategory === 'all') return true;
    return att.category === selectedCategory;
  });

  const handleDelete = async (att: PhotoAttachment) => {
    setDeletingId(att.id);
    try {
      await deletePhotoAttachment(att);
      if (onAttachmentDeleted) {
        onAttachmentDeleted(att.id);
      }
      setDeleteConfirmAttachment(null);
      if (activePhotoIndex !== null) {
        setActivePhotoIndex(null);
      }
    } catch (err) {
      console.error('Failed to delete photo attachment:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const activePhoto =
    activePhotoIndex !== null && filteredAttachments[activePhotoIndex]
      ? filteredAttachments[activePhotoIndex]
      : null;

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-bold text-teal-950">{title}</h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-900 border border-teal-200">
              {attachments.length}
            </span>
          </div>
          {subtitle && <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>}
        </div>

        {canUpload && (
          <button
            type="button"
            onClick={() => setIsUploadOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-teal-900 hover:bg-teal-950 text-white text-xs font-bold rounded-xl shadow-xs transition-all active:scale-[0.98] self-start sm:self-auto"
          >
            <Camera className="w-4 h-4 text-amber-400" />
            <span>Take or Attach Photo</span>
          </button>
        )}
      </div>

      {/* Category Filter Pills (if more than 1 category exists) */}
      {availableCategories.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1 rounded-lg font-semibold whitespace-nowrap transition-colors ${
              selectedCategory === 'all'
                ? 'bg-teal-900 text-white shadow-2xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            All ({attachments.length})
          </button>
          {availableCategories.map((cat) => {
            const count = attachments.filter((a) => a.category === cat).length;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-teal-900 text-white shadow-2xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Grid of Photo Cards */}
      {filteredAttachments.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filteredAttachments.map((att, idx) => {
            const userCanDelete = currentUser
              ? canDeleteAttachment(att, currentUser.uid, role, isAdmin)
              : false;

            return (
              <div
                key={att.id}
                className="group relative bg-stone-50 border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-all flex flex-col"
              >
                {/* Thumbnail */}
                <div
                  onClick={() => setActivePhotoIndex(idx)}
                  className="relative aspect-4/3 bg-stone-200 cursor-pointer overflow-hidden"
                >
                  <img
                    src={att.downloadUrl}
                    alt={att.caption || att.fileName}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-stone-900/0 group-hover:bg-stone-900/30 transition-colors flex items-center justify-center">
                    <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 drop-shadow-md transition-opacity" />
                  </div>
                  {/* Category Pill */}
                  <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md text-[10px] font-black bg-stone-900/80 text-white backdrop-blur-xs tracking-tight">
                    {att.category}
                  </span>
                </div>

                {/* Card Details */}
                <div className="p-2.5 flex-1 flex flex-col justify-between text-xs space-y-1.5">
                  <div>
                    <div className="font-bold text-stone-900 line-clamp-1" title={att.caption || att.fileName}>
                      {att.caption || att.fileName}
                    </div>
                    <div className="text-[10px] text-stone-500 flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3 text-stone-400" />
                      <span>{formatDate(att.date)}</span>
                      {att.fileSize > 0 && (
                        <span>• {formatBytes(att.fileSize)}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-stone-200 text-[10px] text-stone-500">
                    <span className="truncate" title={`Uploaded by: ${att.uploadedBy?.name || 'Staff'}`}>
                      {att.uploadedBy?.name || 'Staff'}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={att.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 text-stone-400 hover:text-teal-900 rounded"
                        title="Open in new tab / download"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                      {userCanDelete && !isViewOnly && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmAttachment(att);
                          }}
                          className="p-1 text-stone-400 hover:text-red-600 rounded"
                          title="Delete photo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="p-8 border-2 border-dashed border-stone-200 rounded-xl text-center space-y-3 bg-stone-50/50">
          <div className="w-12 h-12 rounded-full bg-teal-100 text-teal-900 flex items-center justify-center mx-auto shadow-xs">
            <ImageIcon className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-stone-800">No photos or documents attached yet</h4>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              Staff can use their phone camera or select existing images to document school records, medical receipts, or home visits.
            </p>
          </div>
          {canUpload && (
            <button
              type="button"
              onClick={() => setIsUploadOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-900 hover:bg-teal-950 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              <Camera className="w-4 h-4 text-amber-400" />
              <span>Take or Attach First Photo</span>
            </button>
          )}
        </div>
      )}

      {/* Upload Modal */}
      <PhotoUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        targetType={targetType}
        targetId={targetId}
        targetTitle={targetTitle}
        defaultCategory={defaultCategory}
        onUploaded={(att) => {
          if (onAttachmentAdded) onAttachmentAdded(att);
        }}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirmAttachment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/70 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-stone-900">Delete Photo?</h4>
                <p className="text-xs text-stone-500">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-stone-600">
              Are you sure you want to permanently remove this photo ({deleteConfirmAttachment.category}) from Firebase Storage?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmAttachment(null)}
                disabled={deletingId !== null}
                className="px-3 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirmAttachment)}
                disabled={deletingId !== null}
                className="px-4 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
              >
                {deletingId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Delete Photo</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Lightbox Modal */}
      {activePhoto && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-stone-950/95 backdrop-blur-md text-white p-3 sm:p-5 animate-fadeIn"
          role="dialog"
          aria-modal="true"
        >
          {/* Lightbox Top Bar */}
          <div className="flex items-center justify-between pb-3 border-b border-stone-800">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-500 text-stone-950">
                {activePhoto.category}
              </span>
              <span className="text-xs text-stone-400">
                {activePhotoIndex! + 1} of {filteredAttachments.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={activePhoto.downloadUrl}
                target="_blank"
                rel="noreferrer"
                download={activePhoto.fileName}
                className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-white transition-colors"
                title="Download full photo"
              >
                <Download className="w-4 h-4" />
              </a>
              {currentUser &&
                canDeleteAttachment(activePhoto, currentUser.uid, role, isAdmin) &&
                !isViewOnly && (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmAttachment(activePhoto)}
                    className="p-2 rounded-xl bg-red-900/60 hover:bg-red-800 text-white transition-colors"
                    title="Delete photo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              <button
                type="button"
                onClick={() => setActivePhotoIndex(null)}
                className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-white transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Lightbox Center Image Stage */}
          <div className="relative flex-1 flex items-center justify-center my-3 overflow-hidden">
            {/* Previous Photo Button */}
            {activePhotoIndex! > 0 && (
              <button
                type="button"
                onClick={() => setActivePhotoIndex(activePhotoIndex! - 1)}
                className="absolute left-2 p-2 rounded-full bg-stone-900/80 hover:bg-stone-800 text-white transition-colors z-10"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            <img
              src={activePhoto.downloadUrl}
              alt={activePhoto.caption || activePhoto.fileName}
              className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
            />

            {/* Next Photo Button */}
            {activePhotoIndex! < filteredAttachments.length - 1 && (
              <button
                type="button"
                onClick={() => setActivePhotoIndex(activePhotoIndex! + 1)}
                className="absolute right-2 p-2 rounded-full bg-stone-900/80 hover:bg-stone-800 text-white transition-colors z-10"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Lightbox Bottom Metadata Bar */}
          <div className="bg-stone-900/80 rounded-xl p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 border border-stone-800">
            <div>
              <div className="font-bold text-sm text-stone-100">
                {activePhoto.caption || activePhoto.fileName}
              </div>
              <div className="text-stone-400 flex flex-wrap items-center gap-3 text-[11px] mt-0.5">
                <span>Date: {formatDate(activePhoto.date)}</span>
                <span>Uploaded by: {activePhoto.uploadedBy?.name || 'Staff'}</span>
                {activePhoto.fileSize > 0 && <span>Size: {formatBytes(activePhoto.fileSize)}</span>}
              </div>
            </div>
            <div className="text-[10px] text-stone-500 truncate">
              Storage: {activePhoto.storagePath}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
