export function ShopDisclaimer({ className }: { className?: string }) {
  return (
    <p className={`shop-disclaimer ${className ?? ''}`.trim()}>
      Thực phẩm này không phải là thuốc và không có tác dụng thay thế thuốc chữa bệnh.
    </p>
  );
}
