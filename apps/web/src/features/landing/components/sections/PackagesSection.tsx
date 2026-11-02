import { useState } from 'react';
import { ArrowButton } from '../ArrowButton';
import { Reveal } from '../../../../shared/ui/Reveal';

interface PackagesSectionProps {
  onSelectPlan?: (planName: string) => void;
}

export function PackagesSection({ onSelectPlan }: PackagesSectionProps) {
  const [mobileTierIdx, setMobileTierIdx] = useState(1);
  const [cycle, setCycle] = useState<'1m' | '6m' | '12m'>('1m');

  const tiersByCycle = {
    '1m': [
      {
        id: 'silver',
        name: 'SILVER',
        duration: '30 NGÀY / THÁNG',
        price: '199.000',
        unit: 'VNĐ / THÁNG',
        description: 'BASIC – Cơ bản',
        perks: [
          'Tập luyện không giới hạn trong giờ hoạt động.',
          'Sử dụng khu vực tập luyện tiêu chuẩn.',
          'Sử dụng phòng thay đồ và tủ khóa chung.',
          'Miễn phí nước uống.',
          '2 lượt đăng ký lớp Group Fitness cơ bản theo lịch.',
          'Đánh giá thể trạng và chỉ số BMI ban đầu.',
        ],
        featured: false,
      },
      {
        id: 'gold',
        name: 'GOLD',
        duration: '30 NGÀY / THÁNG',
        price: '299.000',
        unit: 'VNĐ / THÁNG',
        description: 'STANDARD – Trung cấp',
        perks: [
          'Toàn bộ quyền lợi Silver, cộng thêm:',
          '03 buổi tập Personal Trainer 1:1 mỗi tháng.',
          'Sử dụng khu vực máy tập nâng cao.',
          'Cung cấp khăn tập riêng trong mỗi buổi tập.',
          'Tủ khóa cá nhân cố định.',
          'Được đánh giá thể trạng định kỳ mỗi tháng.',
          'Xây dựng kế hoạch tập luyện cá nhân cơ bản.',
          '5 lượt đặt chỗ trong các lớp Group Fitness.',
          'Giảm 10% dịch vụ PT bổ sung và sản phẩm tại trung tâm.',
        ],
        featured: true,
      },
      {
        id: 'platinum',
        name: 'PLATINUM',
        duration: '30 NGÀY / THÁNG',
        price: '599.000',
        unit: 'VNĐ / THÁNG',
        description: 'VIP – Cao cấp',
        perks: [
          'Toàn bộ quyền lợi Gold, cộng thêm:',
          '06 buổi tập Personal Trainer 1:1 mỗi tháng.',
          'Đặc quyền sử dụng phòng tập VIP riêng biệt.',
          'Sử dụng hệ thống máy tập cao cấp và thiết bị chuyên biệt.',
          'Khăn tập và khăn tắm cá nhân theo tiêu chuẩn VIP.',
          'Tủ đồ cá nhân cao cấp, có khóa riêng.',
          'Sử dụng phòng xông hơi.',
          'Miễn phí nước khoáng và đồ uống thể thao.',
          'Đánh giá chỉ số cơ thể chuyên sâu: BMI, Body Fat, Muscle Mass.',
          'Thiết kế giáo án tập luyện riêng theo mục tiêu.',
          'Tư vấn dinh dưỡng cơ bản cùng huấn luyện viên.',
          'Ưu tiên đặt lịch PT và lớp học.',
          'Giảm 20% dịch vụ PT bổ sung và sản phẩm tại trung tâm.',
          'Được mời tham gia các sự kiện và chương trình độc quyền.',
        ],
        featured: false,
      },
    ],
    '6m': [
      {
        id: 'silver-6m',
        name: 'SILVER 6T',
        duration: '180 NGÀY (6 THÁNG)',
        price: '999.000',
        unit: 'VNĐ / 6 THÁNG (~166K/THÁNG)',
        description: 'BASIC – Tiết kiệm 16%',
        perks: [
          'Tập luyện không giới hạn suốt 180 ngày.',
          'Tiết kiệm 16% so với đăng ký từng tháng.',
          'Sử dụng khu vực tập luyện tiêu chuẩn & tủ khóa chung.',
          'Miễn phí nước uống suốt thời gian tập.',
          '12 lượt đăng ký lớp Group Fitness cơ bản.',
          'Đánh giá thể trạng và chỉ số BMI định kỳ.',
          'Tặng 01 lần bảo lưu thẻ tối đa 30 ngày.',
        ],
        featured: false,
      },
      {
        id: 'gold-6m',
        name: 'GOLD 6T',
        duration: '180 NGÀY (6 THÁNG)',
        price: '1.499.000',
        unit: 'VNĐ / 6 THÁNG (~249K/THÁNG)',
        description: 'STANDARD – Tiết kiệm 17%',
        perks: [
          'Toàn bộ quyền lợi Silver, cộng thêm:',
          '18 buổi tập Personal Trainer 1:1 trong 6 tháng.',
          'Sử dụng máy tập nâng cao & tủ khóa cố định.',
          'Cung cấp khăn tập riêng mỗi buổi tập.',
          'Đánh giá thể trạng định kỳ mỗi tháng.',
          '30 lượt đặt chỗ trong các lớp Group Fitness.',
          'Giảm 10% dịch vụ PT bổ sung & sản phẩm.',
          'Tặng 01 lần bảo lưu thẻ 30 ngày & 01 túi tập thể thao cao cấp.',
        ],
        featured: true,
      },
      {
        id: 'platinum-6m',
        name: 'PLATINUM 6T',
        duration: '180 NGÀY (6 THÁNG)',
        price: '2.999.000',
        unit: 'VNĐ / 6 THÁNG (~499K/THÁNG)',
        description: 'VIP – Tiết kiệm 17%',
        perks: [
          'Toàn bộ quyền lợi Gold, cộng thêm:',
          '36 buổi tập Personal Trainer 1:1 trong 6 tháng.',
          'Đặc quyền sử dụng phòng tập VIP riêng biệt.',
          'Khăn VIP 5 sao & tủ đồ cá nhân cao cấp.',
          'Sử dụng phòng xông hơi không giới hạn.',
          'Miễn phí nước khoáng & đồ uống thể thao.',
          'Giáo án riêng & tư vấn dinh dưỡng cùng HLV.',
          'Ưu tiên cao nhất khi đặt lịch PT và lớp học.',
          'Tặng 02 lần bảo lưu (60 ngày) & 02 vé mời VIP cho người thân.',
        ],
        featured: false,
      },
    ],
    '12m': [
      {
        id: 'silver-12m',
        name: 'SILVER 12T',
        duration: '365 NGÀY (12 THÁNG)',
        price: '1.799.000',
        unit: 'VNĐ / NĂM (~149K/THÁNG)',
        description: 'BASIC – Tiết kiệm 25% (Tặng 3 tháng)',
        perks: [
          'Tập luyện không giới hạn suốt 365 ngày.',
          'Tiết kiệm 25% (tương đương 3 tháng tập miễn phí).',
          'Sử dụng khu vực tập luyện tiêu chuẩn & tủ khóa chung.',
          'Miễn phí nước uống suốt cả năm.',
          '24 lượt đăng ký lớp Group Fitness cơ bản.',
          'Đánh giá thể trạng và chỉ số BMI định kỳ hàng quý.',
          'Tặng 02 lần bảo lưu thẻ với tổng thời gian 60 ngày.',
        ],
        featured: false,
      },
      {
        id: 'gold-12m',
        name: 'GOLD 12T',
        duration: '365 NGÀY (12 THÁNG)',
        price: '2.699.000',
        unit: 'VNĐ / NĂM (~224K/THÁNG)',
        description: 'STANDARD – Tiết kiệm 25% (Tặng 3 tháng)',
        perks: [
          'Toàn bộ quyền lợi Silver, cộng thêm:',
          '36 buổi tập Personal Trainer 1:1 suốt năm.',
          'Sử dụng máy tập nâng cao & tủ khóa cố định cả năm.',
          'Cung cấp khăn tập riêng mỗi buổi tập.',
          'Đánh giá thể trạng chuyên sâu định kỳ mỗi tháng.',
          '60 lượt đặt chỗ trong các lớp Group Fitness.',
          'Giảm 15% dịch vụ PT bổ sung & sản phẩm.',
          'Bảo lưu linh hoạt tới 90 ngày.',
          'Tặng trọn bộ quà tặng SÖL Premium (bình + khăn + túi tập).',
        ],
        featured: true,
      },
      {
        id: 'platinum-12m',
        name: 'PLATINUM 12T',
        duration: '365 NGÀY (12 THÁNG)',
        price: '5.399.000',
        unit: 'VNĐ / NĂM (~449K/THÁNG)',
        description: 'VIP – Tiết kiệm 25% (Tặng 3 tháng)',
        perks: [
          'Toàn bộ quyền lợi Gold, cộng thêm:',
          '72 buổi tập Personal Trainer 1:1 cao cấp.',
          'Đặc quyền sử dụng phòng tập VIP riêng biệt 365 ngày.',
          'Khăn VIP 5 sao & tủ đồ cá nhân cao cấp.',
          'Sử dụng phòng xông hơi sauna/jacuzzi không giới hạn.',
          'Miễn phí nước khoáng & đồ uống thể thao mỗi buổi.',
          'Giáo án riêng & chế độ dinh dưỡng cùng Master Coach.',
          'Ưu tiên cao nhất mọi lịch hẹn PT, lớp học và khu vực VIP.',
          'Giảm 25% dịch vụ PT bổ sung & sản phẩm.',
          'Tặng bảo lưu 120 ngày & 04 vé mời VIP cho người thân.',
        ],
        featured: false,
      },
    ],
  };

  const tiers = tiersByCycle[cycle];

  const handleSelect = (planName: string) => {
    if (onSelectPlan) {
      onSelectPlan(planName);
    }
  };

  return (
    <section
      id="packages"
      className="sol-section sol-fullscreen-card"
      style={{ backgroundColor: '#F6F2EC' }}
    >
      <div className="sol-section-inner">
        <Reveal index={0} style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto clamp(10px, 2vh, 16px) auto' }}>
          <h2 className="editorial-headline" style={{ margin: 0, fontSize: 'clamp(1.7rem, 2.8vw, 2.5rem)' }}>
            CURATED{' '}
            <span className="editorial-flourish" style={{ fontStyle: 'italic', fontWeight: 300 }}>
              Residencies
            </span>
          </h2>
        </Reveal>

        {/* Billing Cycle Switcher */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', margin: '0 auto clamp(12px, 1.8vh, 20px) auto', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => { setCycle('1m'); setMobileTierIdx(1); }}
            style={{
              background: cycle === '1m' ? 'var(--color-text-main, #202020)' : 'transparent',
              color: cycle === '1m' ? '#FAF8F5' : 'var(--color-text-muted, #736b63)',
              border: '1px solid',
              borderColor: cycle === '1m' ? 'var(--color-text-main, #202020)' : 'var(--color-border-medium, #e3ded6)',
              padding: '6px 14px',
              borderRadius: '20px',
              fontFamily: 'var(--font-sans)',
              fontSize: '0.75rem',
              letterSpacing: '0.05em',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Gói 1 Tháng
          </button>
          <button
            type="button"
            onClick={() => { setCycle('6m'); setMobileTierIdx(1); }}
            style={{
              background: cycle === '6m' ? 'var(--color-text-main, #202020)' : 'transparent',
              color: cycle === '6m' ? '#FAF8F5' : 'var(--color-text-muted, #736b63)',
              border: '1px solid',
              borderColor: cycle === '6m' ? 'var(--color-text-main, #202020)' : 'var(--color-border-medium, #e3ded6)',
              padding: '6px 14px',
              borderRadius: '20px',
              fontFamily: 'var(--font-sans)',
              fontSize: '0.75rem',
              letterSpacing: '0.05em',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Đồng Hành 6 Tháng (-17%)
          </button>
          <button
            type="button"
            onClick={() => { setCycle('12m'); setMobileTierIdx(1); }}
            style={{
              background: cycle === '12m' ? 'var(--color-text-main, #202020)' : 'transparent',
              color: cycle === '12m' ? '#FAF8F5' : 'var(--color-text-muted, #736b63)',
              border: '1px solid',
              borderColor: cycle === '12m' ? 'var(--color-text-main, #202020)' : 'var(--color-border-medium, #e3ded6)',
              padding: '6px 14px',
              borderRadius: '20px',
              fontFamily: 'var(--font-sans)',
              fontSize: '0.75rem',
              letterSpacing: '0.05em',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Đồng Hành 12 Tháng (Tặng 3 Tháng)
          </button>
        </div>

        {/* Mobile Tier Tabs */}
        <div className="pricing-tabs-mobile">
          {tiers.map((t, idx) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMobileTierIdx(idx)}
              style={{
                background: mobileTierIdx === idx ? 'var(--color-text-main)' : 'transparent',
                color: mobileTierIdx === idx ? '#FAF8F5' : 'var(--color-text-muted)',
                border: '1px solid',
                borderColor: mobileTierIdx === idx ? 'var(--color-text-main)' : 'var(--color-border-medium)',
                padding: '4px 12px',
                borderRadius: '2px',
                fontFamily: 'var(--font-sans)',
                fontSize: '0.68rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              {t.name}
            </button>
          ))}
        </div>

        <div className="pricing-grid" style={{ marginTop: 'clamp(10px, 1.8vh, 22px)', gap: 'clamp(14px, 2vw, 24px)' }}>
          {tiers.map((tier, idx) => (
            <Reveal
              key={tier.id}
              index={idx}
              className={`pricing-card ${tier.featured ? 'featured' : ''} ${mobileTierIdx === idx ? 'mobile-active' : ''}`}
              style={{
                padding: 'clamp(16px, 2.2vh, 26px) clamp(16px, 2vw, 24px)',
              }}
            >
              {tier.featured && <div className="pricing-badge">MOST REVERED</div>}

              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '0.68rem',
                    letterSpacing: '0.18em',
                    color: 'var(--color-text-muted)',
                    textTransform: 'uppercase',
                    marginBottom: '6px',
                    fontWeight: 600,
                  }}
                >
                  {tier.duration}
                </div>

                <h3
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: 'clamp(1.2rem, 1.6vw, 1.5rem)',
                    fontWeight: 500,
                    letterSpacing: '0.04em',
                    margin: '0 0 8px 0',
                    color: 'var(--color-text-main)',
                  }}
                >
                  {tier.name}
                </h3>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '10px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: 'clamp(1.6rem, 2.2vw, 2.1rem)',
                      fontWeight: 500,
                      color: 'var(--color-text-main)',
                    }}
                  >
                    {tier.price}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '0.72rem',
                      color: 'var(--color-text-muted)',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {tier.unit}
                  </span>
                </div>

                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'clamp(0.78rem, 0.95vw, 0.84rem)',
                    lineHeight: 1.5,
                    color: 'var(--color-text-muted)',
                    marginBottom: 'clamp(10px, 1.5vh, 16px)',
                    fontWeight: 300,
                  }}
                >
                  {tier.description}
                </p>

                <div
                  style={{
                    borderTop: '1px solid var(--color-border-subtle)',
                    paddingTop: 'clamp(8px, 1.2vh, 12px)',
                    marginBottom: 'clamp(12px, 1.8vh, 18px)',
                  }}
                >
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: 0,
                      display: 'grid',
                      gap: '6px',
                      fontFamily: 'var(--font-sans)',
                      fontSize: 'clamp(0.74rem, 0.9vw, 0.78rem)',
                      color: 'var(--color-text-main)',
                      lineHeight: 1.4,
                    }}
                  >
                    {tier.perks.slice(0, 4).map((p, idx) => (
                      <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <span style={{ color: 'var(--color-accent-gold)', flexShrink: 0 }}>✦</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div>
                <ArrowButton
                  label="SELECT RESIDENCY"
                  href="#contact"
                  onClick={() => handleSelect(tier.name)}
                />
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
