import { useSourceLanguage, sourceText } from "../shopI18n";
export function ShopDisclaimer({ className }: { className?: string }) {
  useSourceLanguage();
  return (
    <p className={`shop-disclaimer ${className ?? ''}`.trim()}>
      {sourceText("Thực phẩm này không phải là thuốc và không có tác dụng thay thế thuốc chữa bệnh.")}</p>
  );
}
