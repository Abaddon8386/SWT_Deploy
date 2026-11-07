import { useSourceLanguage, sourceText, sourceFormat, sourceError, sourceNotify as notify } from '../shopI18n';
import { useRef, useState } from 'react';
import { shopApi } from '../shopApi';
import type { ProductImageDto } from '../shopTypes';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = Math.floor(1.5 * 1024 * 1024);
const MAX_IMAGES = 6;

export interface EditableProductImage extends ProductImageDto {
  dataUrl?: string;
}

export interface ProductImagesEditorProps {
  productId: number | null;
  images: EditableProductImage[];
  onChange: (next: EditableProductImage[]) => void;
  disabled?: boolean;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(sourceError(null, 'Không thể đọc tệp ảnh.'));
    reader.readAsDataURL(file);
  });
}

export function ProductImagesEditor({
  productId,
  images,
  onChange,
  disabled = false,
}: ProductImagesEditorProps) {
  useSourceLanguage();
  const [altText, setAltText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | Error>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.has(file.type)) {
      return 'Chỉ chấp nhận ảnh định dạng JPEG, PNG hoặc WEBP.';
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return 'Dung lượng ảnh không được vượt quá 1,5 MB.';
    }
    return null;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const validationErr = validateFile(file);
    if (validationErr) {
      setError(validationErr);
      setSelectedFile(null);
      return;
    }
    setError('');
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (busy || disabled) return;
    if (images.length >= MAX_IMAGES) {
      setError(sourceFormat("Mỗi sản phẩm tối đa {0} ảnh.", MAX_IMAGES));
      return;
    }
    const trimmedAlt = altText.trim();
    if (!trimmedAlt) {
      setError('Vui lòng nhập mô tả ảnh (alt) trước khi tải lên.');
      return;
    }
    if (!selectedFile) {
      setError('Vui lòng chọn tệp ảnh.');
      return;
    }
    const validationErr = validateFile(selectedFile);
    if (validationErr) {
      setError(validationErr);
      return;
    }

    setBusy(true);
    setError('');
    try {
      const dataUrl = await readFileAsDataUrl(selectedFile);
      if (productId != null) {
        const updated = await shopApi.manager.addImage(productId, {
          dataUrl,
          altText: trimmedAlt,
        });
        onChange(updated.images);
        notify('Đã tải ảnh sản phẩm lên.', 'success');
      } else {
        const tempId = -(Date.now() + images.length + 1);
        onChange([
          ...images,
          { id: tempId, url: dataUrl, alt: trimmedAlt, dataUrl },
        ]);
      }
      setAltText('');
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setError(sourceError(err, 'Không thể tải ảnh lên. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= images.length || busy || disabled) return;
    const next = [...images];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);

    if (productId != null && next.every(img => img.id > 0)) {
      setBusy(true);
      setError('');
      try {
        const updated = await shopApi.manager.reorderImages(
          productId,
          next.map(i => i.id),
        );
        onChange(updated.images);
      } catch (err) {
        setError(sourceError(err, 'Không thể đổi thứ tự ảnh.'));
      } finally {
        setBusy(false);
      }
    } else {
      onChange(next);
    }
  };

  const handleRemove = async (img: EditableProductImage) => {
    if (busy || disabled) return;
    if (productId != null && img.id > 0) {
      setBusy(true);
      setError('');
      try {
        const updated = await shopApi.manager.removeImage(productId, img.id);
        onChange(updated.images);
        notify('Đã xóa ảnh sản phẩm.', 'success');
      } catch (err) {
        setError(sourceError(err, 'Không thể xóa ảnh sản phẩm.'));
      } finally {
        setBusy(false);
      }
    } else {
      onChange(images.filter(item => item.id !== img.id));
    }
  };

  return (
    <section className="portal-card stack" aria-label={sourceText("Ảnh sản phẩm")}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h2 className="portal-card-title" style={{ margin: 0 }}>
          {sourceText("Ảnh sản phẩm (")}{images.length}/{MAX_IMAGES})
        </h2>
        <span className="muted">{sourceText("JPEG, PNG, WEBP · Tối đa 1,5 MB/ảnh")}</span>
      </div>

      {images.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'grid',
            gap: 10,
          }}
        >
          {images.map((img, idx) => (
            <li
              key={img.id}
              className="portal-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 12px',
                flexWrap: 'wrap',
              }}
            >
              <div className="shop-image-description">
                <img
                  src={img.url}
                  alt={img.alt}
                  style={{
                    width: 52,
                    height: 52,
                    objectFit: 'contain',
                    borderRadius: 8,
                    background: 'var(--portal-raised)',
                  }}
                />
                <div>
                  <strong>{img.alt}</strong>
                  <div className="muted">{sourceText("Ảnh #")}{idx + 1}</div>
                </div>
              </div>
              <div className="shop-image-actions">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  aria-label={sourceFormat("Chuyển ảnh {0} lên", img.alt)}
                  disabled={busy || disabled || idx === 0}
                  onClick={() => void handleMove(idx, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  aria-label={sourceFormat("Chuyển ảnh {0} xuống", img.alt)}
                  disabled={busy || disabled || idx === images.length - 1}
                  onClick={() => void handleMove(idx, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={busy || disabled}
                  onClick={() => void handleRemove(img)}
                >
                  {sourceText("Xóa ảnh")}</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
          gap: 12,
          alignItems: 'end',
        }}
      >
        <div className="shop-field">
          <label className="shop-label" htmlFor="product-image-file">
            {sourceText("Tệp ảnh")}</label>
          <input
            ref={fileInputRef}
            id="product-image-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="shop-input"
            disabled={busy || disabled || images.length >= MAX_IMAGES}
            onChange={handleFileChange}
          />
        </div>
        <div className="shop-field">
          <label className="shop-label" htmlFor="product-image-alt">
            {sourceText("Mô tả ảnh (alt)")}</label>
          <input
            id="product-image-alt"
            type="text"
            className="shop-input"
            maxLength={160}
            value={altText}
            disabled={busy || disabled || images.length >= MAX_IMAGES}
            placeholder={sourceText("Mặt trước hũ SÖL Whey Isolate")}
            onChange={e => {
              setAltText(e.target.value);
              if (error) setError('');
            }}
          />
        </div>
        <div>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy || disabled || images.length >= MAX_IMAGES}
            onClick={() => void handleUpload()}
          >
            {busy ? sourceText('Đang tải…') : sourceText('Tải ảnh lên')}
          </button>
        </div>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {sourceText(error)}
        </p>
      )}
    </section>
  );
}
