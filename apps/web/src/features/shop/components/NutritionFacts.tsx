import type { NutrientDto } from '../shopTypes';

const num = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

export function NutritionFacts({
  servingSize,
  servings,
  nutrients,
}: {
  servingSize: string;
  servings: number | null;
  nutrients: NutrientDto[];
}) {
  const hasDv = nutrients.some((n) => n.dailyValuePercent != null);
  return (
    <div className="shop-facts">
      <table>
        <caption>Thành phần dinh dưỡng</caption>
        <thead>
          <tr className="shop-facts__serving">
            <td colSpan={hasDv ? 3 : 2}>
              Khẩu phần: {servingSize}
              {servings ? (
                <>
                  <br />
                  Số lần dùng: {servings}
                </>
              ) : null}
            </td>
          </tr>
          {nutrients.length > 0 && (
            <tr className="shop-facts__head">
              <th scope="col">Mỗi khẩu phần</th>
              <th scope="col" className="is-num">
                Lượng
              </th>
              {hasDv && (
                <th scope="col" className="is-num">
                  % NCKN*
                </th>
              )}
            </tr>
          )}
        </thead>
        {nutrients.length > 0 && (
          <tbody>
            {nutrients.map((n, index) => (
              <tr key={`${n.name}-${index}`} className={n.subRow ? 'is-sub' : undefined}>
                <th scope="row">{n.name}</th>
                <td className="is-num">
                  {num.format(n.amount)} {n.unit}
                </td>
                {hasDv && (
                  <td className="is-num">{n.dailyValuePercent != null ? `${n.dailyValuePercent}%` : ''}</td>
                )}
              </tr>
            ))}
          </tbody>
        )}
      </table>
      {hasDv && (
        <p className="shop-facts__foot">*NCKN: phần trăm nhu cầu khuyến nghị hằng ngày cho người trưởng thành.</p>
      )}
    </div>
  );
}
