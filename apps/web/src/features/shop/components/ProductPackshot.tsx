import { useSourceLanguage } from "../shopI18n";
import { useState } from 'react';
import { LoadingImage } from '../../../shared/ui/LoadingImage';
import type { ProductForm } from '../shopTypes';

function getMonogram(name: string): string {
  const cleaned = name
    .replace(/^söl\s+/i, '')
    .trim();
  const words = (cleaned || name).split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
  }
  return (words[0] ?? 'SL').slice(0, 2).toUpperCase();
}

export function ProductPackshot({
  form,
  name,
  imageUrl,
  alt,
  className,
}: {
  form: ProductForm;
  name: string;
  imageUrl?: string | null;
  alt?: string;
  className?: string;
}) {
  useSourceLanguage();
  const label = alt || name;
  const monogram = getMonogram(name);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const resolvedUrl = imageUrl;

  if (resolvedUrl && failedSrc !== resolvedUrl) {
    return (
      <div className={`shop-packshot ${className ?? ''}`.trim()}>
        <LoadingImage
          src={resolvedUrl}
          alt={label}
          loading="lazy"
          className="shop-packshot__img"
          onError={() => setFailedSrc(resolvedUrl)}
        />
      </div>
    );
  }

  return (
    <div className={`shop-packshot ${className ?? ''}`.trim()}>
      <svg viewBox="0 0 200 240" role="img" aria-label={label} className="shop-packshot__svg">
        {form === 'powder' && (
          <>
            <rect x="46" y="24" width="108" height="22" rx="6" className="shop-packshot__cap" />
            <rect x="34" y="46" width="132" height="168" rx="22" className="shop-packshot__vessel" />
            <rect x="35" y="102" width="130" height="56" className="shop-packshot__band" />
            <text x="100" y="138" textAnchor="middle" className="shop-packshot__monogram">
              {monogram}
            </text>
          </>
        )}
        {(form === 'capsule' || form === 'tablet') && (
          <>
            <rect x="66" y="26" width="68" height="20" rx="5" className="shop-packshot__cap" />
            <rect x="74" y="46" width="52" height="16" className="shop-packshot__vessel" />
            <rect x="48" y="62" width="104" height="150" rx="20" className="shop-packshot__vessel" />
            <rect x="49" y="110" width="102" height="52" className="shop-packshot__band" />
            <text x="100" y="144" textAnchor="middle" className="shop-packshot__monogram">
              {monogram}
            </text>
          </>
        )}
        {form === 'liquid' && (
          <>
            <rect x="78" y="18" width="44" height="18" rx="4" className="shop-packshot__cap" />
            <path
              d="M82 36h36l18 34v136a14 14 0 0 1-14 14H78a14 14 0 0 1-14-14V70z"
              className="shop-packshot__vessel"
            />
            <rect x="65" y="112" width="70" height="54" className="shop-packshot__band" />
            <text x="100" y="147" textAnchor="middle" className="shop-packshot__monogram">
              {monogram}
            </text>
          </>
        )}
        {form === 'bar' && (
          <>
            <rect x="20" y="84" width="16" height="72" rx="4" className="shop-packshot__cap" />
            <rect x="164" y="84" width="16" height="72" rx="4" className="shop-packshot__cap" />
            <rect x="32" y="78" width="136" height="84" rx="12" className="shop-packshot__vessel" />
            <rect x="68" y="79" width="64" height="82" className="shop-packshot__band" />
            <text x="100" y="128" textAnchor="middle" className="shop-packshot__monogram">
              {monogram}
            </text>
          </>
        )}
        {form === 'other' && (
          <>
            <rect x="38" y="38" width="124" height="168" rx="12" className="shop-packshot__vessel" />
            <line x1="38" y1="64" x2="162" y2="64" className="shop-packshot__vessel" />
            <rect x="39" y="104" width="122" height="54" className="shop-packshot__band" />
            <text x="100" y="139" textAnchor="middle" className="shop-packshot__monogram">
              {monogram}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
