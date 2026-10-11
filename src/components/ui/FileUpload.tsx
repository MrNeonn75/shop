import React, { useRef, useState } from 'react';
import { UploadCloud, File, X, AlertCircle } from 'lucide-react';
import { cn } from '../../shared/utils/cn';

export interface FileUploadProps {
  accept?: string; // e.g. "image/*,.pdf,.csv"
  maxSizeBytes?: number; // e.g. 5 * 1024 * 1024 (5MB)
  multiple?: boolean;
  onFilesSelected?: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  accept = 'image/*,.pdf,.csv,.xlsx',
  maxSizeBytes = 5 * 1024 * 1024, // 5MB default
  multiple = false,
  onFilesSelected,
  disabled = false,
  className,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndAddFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setErrorMessage(null);

    const newFiles: File[] = [];
    const maxMb = (maxSizeBytes / (1024 * 1024)).toFixed(0);

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];

      if (file.size > maxSizeBytes) {
        setErrorMessage(`"${file.name}" faylı çox böyükdür (Maksimum hədd: ${maxMb}MB).`);
        return;
      }

      newFiles.push(file);
      if (!multiple) break;
    }

    const updated = multiple ? [...selectedFiles, ...newFiles] : newFiles;
    setSelectedFiles(updated);
    onFilesSelected?.(updated);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (index: number) => {
    const updated = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updated);
    onFilesSelected?.(updated);
  };

  return (
    <div className={cn('flex flex-col gap-2.5 w-full', className)}>
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors text-center select-none bg-background',
          dragActive
            ? 'border-bh-accent bg-bh-accent/5'
            : 'border-border hover:border-bh-accent/50 hover:bg-muted/30',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(e) => validateAndAddFiles(e.target.files)}
          className="hidden"
        />

        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground mb-2">
          <UploadCloud className="h-5 w-5" />
        </div>

        <p className="text-sm font-medium text-foreground">
          Faylı bura sürükləyin və ya <span className="text-bh-accent underline">seçin</span>
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          İcazə verilən formatlar: {accept.replace(/\*/g, 'bütün')} (Maks. {(maxSizeBytes / (1024 * 1024)).toFixed(0)}MB)
        </p>
      </div>

      {errorMessage && (
        <div className="flex items-center gap-1.5 text-xs text-danger font-medium animate-in fade-in">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {selectedFiles.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {selectedFiles.map((file, idx) => (
            <div
              key={`${file.name}-${idx}`}
              className="flex items-center justify-between p-2 rounded border border-border bg-card text-xs"
            >
              <div className="flex items-center gap-2 truncate">
                <File className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">{file.name}</span>
                <span className="text-muted-foreground shrink-0">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeFile(idx)}
                className="p-1 text-muted-foreground hover:text-foreground rounded"
                aria-label="Sil"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

