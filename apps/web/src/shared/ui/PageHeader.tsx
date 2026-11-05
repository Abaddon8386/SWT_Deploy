import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  /** Từ in nghiêng kiểu editorial đặt sau tiêu đề, giống "Sanctuary" ở landing. */
  flourish?: string;
  actions?: ReactNode;
}

/** Đầu trang chuẩn của portal: eyebrow + tiêu đề serif + đường kẻ vàng, đồng bộ với landing. */
export function PageHeader({ eyebrow, title, flourish, actions }: PageHeaderProps) {
  return (
    <div className="portal-header">
      <div>
        {eyebrow && <p className="portal-eyebrow">{eyebrow}</p>}
        <h1 className="portal-title">
          {title}
          {flourish && <> {flourish}</>}
        </h1>
      </div>
      {actions && <div className="portal-header__actions">{actions}</div>}
    </div>
  );
}
