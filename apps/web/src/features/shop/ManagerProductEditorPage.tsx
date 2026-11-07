import { useSourceLanguage, sourceText, sourceFormat, sourceError, sourceNotify as notify } from './shopI18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { PageHeader } from '../../shared/ui/PageHeader';
import { NutrientRowsEditor, type NutrientRowDraft } from './components/NutrientRowsEditor';
import {
  ProductImagesEditor,
  type EditableProductImage,
} from './components/ProductImagesEditor';
import { VariantRowsEditor, type VariantRowDraft } from './components/VariantRowsEditor';
import './shop-portal.css';
import { shopApi } from './shopApi';
import { FORM_LABELS, GOAL_LABELS } from './shopFormat';
import { Select } from '../../shared/ui/Select';
import type {
  CategoryAdminDto,
  ProductForm,
  ProductGoal,
  ProductUpsertRequest,
} from './shopTypes';

const ALL_GOALS: ProductGoal[] = [
  'muscle_gain',
  'recovery',
  'energy',
  'weight_management',
  'wellness',
];

const ALL_FORMS: ProductForm[] = ['powder', 'capsule', 'tablet', 'liquid', 'bar', 'other'];

type FieldErrorKey =
  | 'name'
  | 'categoryId'
  | 'shortDescription'
  | 'description'
  | 'goals'
  | 'variants'
  | 'servingSize';

export function ManagerProductEditorPage() {
  useSourceLanguage();
  const { productId } = useParams<{ productId: string }>();
  const isEdit = Boolean(productId);
  const numericId = isEdit ? Number(productId) : null;
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);

  const [categories, setCategories] = useState<CategoryAdminDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | Error>('');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | Error>('');
  const [errors, setErrors] = useState<Partial<Record<FieldErrorKey, string>>>({});

  // Form state
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<number>(0);
  const [formType, setFormType] = useState<ProductForm>('powder');
  const [brand, setBrand] = useState('SÖL Nutrition');
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [servingSize, setServingSize] = useState('1 muỗng (33 g)');
  const [usageInstructions, setUsageInstructions] = useState('');
  const [warnings, setWarnings] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [goals, setGoals] = useState<ProductGoal[]>(['muscle_gain']);
  const [active, setActive] = useState(true);
  const [featured, setFeatured] = useState(false);
  const [images, setImages] = useState<EditableProductImage[]>([]);
  const [variants, setVariants] = useState<VariantRowDraft[]>([
    {
      key: 'v-init-0',
      id: null,
      sku: '',
      label: '',
      price: '',
      servingsPerContainer: '30',
      stock: 0,
      initialStock: '10',
      active: true,
    },
  ]);
  const [nutrients, setNutrients] = useState<NutrientRowDraft[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const catList = await shopApi.manager.listCategories();
      setCategories(catList);

      if (isEdit && numericId != null && Number.isSafeInteger(numericId) && numericId > 0) {
        const p = await shopApi.manager.getProduct(numericId);
        setName(p.name);
        setCategoryId(p.categoryId);
        setFormType(p.form);
        setBrand(p.brand ?? '');
        setShortDescription(p.shortDescription);
        setDescription(p.description);
        setServingSize(p.servingSize);
        setUsageInstructions(p.usageInstructions ?? '');
        setWarnings(p.warnings ?? '');
        setRegistrationNumber(p.registrationNumber ?? '');
        setGoals(p.goals);
        setActive(p.active);
        setFeatured(p.featured);
        setImages(p.images);
        setVariants(
          p.variants.map((v, idx) => ({
            key: `v-${v.id ?? idx}`,
            id: v.id,
            sku: v.sku,
            label: v.label,
            price: String(v.price),
            servingsPerContainer:
              v.servingsPerContainer != null ? String(v.servingsPerContainer) : '',
            stock: v.stock,
            initialStock: String(v.stock),
            active: v.active,
          })),
        );
        setNutrients(
          p.nutrients.map((n, idx) => ({
            key: `n-${idx}`,
            name: n.name,
            amount: String(n.amount),
            unit: n.unit,
            dailyValuePercent: n.dailyValuePercent != null ? String(n.dailyValuePercent) : '',
            subRow: n.subRow,
            highlight: n.highlight,
          })),
        );
      } else if (catList.length > 0) {
        setCategoryId(catList[0].id);
      }
    } catch (err) {
      setLoadError(sourceError(err, 'Không thể tải dữ liệu sản phẩm.'));
    } finally {
      setLoading(false);
    }
  }, [isEdit, numericId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleGoal = (goal: ProductGoal) => {
    setGoals(prev =>
      prev.includes(goal) ? prev.filter(g => g !== goal) : [...prev, goal],
    );
    if (errors.goals) {
      setErrors(prev => ({ ...prev, goals: undefined }));
    }
  };

  const validate = (): Partial<Record<FieldErrorKey, string>> => {
    const next: Partial<Record<FieldErrorKey, string>> = {};
    if (name.trim().length < 2) {
      next.name = 'Tên sản phẩm cần tối thiểu 2 ký tự.';
    }
    if (!categoryId || categoryId <= 0) {
      next.categoryId = 'Vui lòng chọn loại sản phẩm.';
    }
    if (shortDescription.trim().length < 5) {
      next.shortDescription = 'Mô tả ngắn cần tối thiểu 5 ký tự.';
    }
    if (description.trim().length < 5) {
      next.description = 'Mô tả chi tiết cần tối thiểu 5 ký tự.';
    }
    if (goals.length === 0) {
      next.goals = 'Vui lòng chọn ít nhất 1 mục tiêu tập luyện.';
    }
    if (
      variants.length === 0 ||
      variants.some(
        v =>
          !v.sku.trim() ||
          !v.label.trim() ||
          !Number.isFinite(Number(v.price)) ||
          Number(v.price) <= 0,
      )
    ) {
      next.variants = 'Mỗi biến thể cần có đầy đủ SKU, nhãn và giá bán lớn hơn 0.';
    }
    if (!servingSize.trim()) {
      next.servingSize = 'Vui lòng nhập định lượng khẩu phần.';
    }
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const nextErrors = validate();
    setErrors(nextErrors);

    const orderedKeys: FieldErrorKey[] = [
      'name',
      'categoryId',
      'shortDescription',
      'description',
      'goals',
      'variants',
      'servingSize',
    ];
    const firstKey = orderedKeys.find(k => Boolean(nextErrors[k]));
    if (firstKey) {
      const selector =
        firstKey === 'variants' ? '[data-field="variantSku"]' : `[data-field="${firstKey}"]`;
      const el = formRef.current?.querySelector<HTMLElement>(selector);
      el?.focus();
      return;
    }

    setSaving(true);
    setSubmitError('');
    try {
      const payload: ProductUpsertRequest = {
        name: name.trim(),
        categoryId,
        form: formType,
        brand: brand.trim() || null,
        shortDescription: shortDescription.trim(),
        description: description.trim(),
        servingSize: servingSize.trim(),
        usageInstructions: usageInstructions.trim() || null,
        warnings: warnings.trim() || null,
        registrationNumber: registrationNumber.trim() || null,
        goals,
        active,
        featured,
        variants: variants.map((v, idx) => ({
          id: v.id,
          sku: v.sku.trim(),
          label: v.label.trim(),
          price: Number(v.price),
          servingsPerContainer:
            v.servingsPerContainer.trim() !== '' &&
            Number.isFinite(Number(v.servingsPerContainer))
              ? Number(v.servingsPerContainer)
              : null,
          initialStock: v.id == null ? Math.max(0, Number(v.initialStock) || 0) : null,
          active: v.active,
          sortOrder: idx,
        })),
        nutrients: nutrients
          .filter(n => n.name.trim() !== '')
          .map((n, idx) => ({
            name: n.name.trim(),
            amount: Number(n.amount) || 0,
            unit: n.unit.trim() || 'g',
            dailyValuePercent:
              n.dailyValuePercent.trim() !== '' &&
              Number.isFinite(Number(n.dailyValuePercent))
                ? Number(n.dailyValuePercent)
                : null,
            subRow: n.subRow,
            highlight: n.highlight,
            sortOrder: idx,
          })),
      };

      if (isEdit && numericId != null) {
        await shopApi.manager.updateProduct(numericId, payload);
        notify('Đã cập nhật sản phẩm.', 'success');
      } else {
        const created = await shopApi.manager.createProduct(payload);
        for (const pendingImg of images) {
          if (pendingImg.id < 0 && pendingImg.dataUrl) {
            await shopApi.manager.addImage(created.id, {
              dataUrl: pendingImg.dataUrl,
              altText: pendingImg.alt,
            });
          }
        }
        notify('Đã tạo sản phẩm mới.', 'success');
      }
      navigate('/manager/products');
    } catch (err) {
      setSubmitError(sourceError(err, 'Không thể lưu sản phẩm. Vui lòng kiểm tra lại.'));
    } finally {
      setSaving(false);
    }
  };

  const firstServings =
    variants[0]?.servingsPerContainer.trim() !== '' &&
    Number.isFinite(Number(variants[0]?.servingsPerContainer))
      ? Number(variants[0].servingsPerContainer)
      : null;

  return (
    <div className="portal-container stack">
      <PageHeader
        eyebrow={sourceText("Quản trị sản phẩm")}
        title={isEdit ? sourceFormat("Sửa sản phẩm: {0}", name || '...') : sourceText('Thêm sản phẩm mới')}
        actions={
          <Link to="/manager/products" className="btn-secondary">
            {sourceText("Quay lại danh sách")}</Link>
        }
      />

      {loading ? (
        <LoadingSkeleton label={sourceText("Đang tải trình soạn sản phẩm…")} variant="rows" count={4} />
      ) : loadError ? (
        <div className="portal-alert" role="alert">
          <span>{sourceText(loadError)}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void load()}>
            {sourceText("Thử lại")}</button>
        </div>
      ) : (
        <form
          ref={formRef}
          className="stack shop-product-editor"
          onSubmit={e => void handleSubmit(e)}
          noValidate
        >
          <section className="portal-card stack" aria-label={sourceText("Thông tin chung")}>
            <h2 className="portal-card-title" style={{ margin: 0 }}>
              {sourceText("Thông tin chung")}</h2>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
                gap: 14,
              }}
            >
              <div className="shop-field">
                <label className="shop-label" htmlFor="product-name">
                  {sourceText("Tên sản phẩm")}</label>
                <input
                  id="product-name"
                  data-field="name"
                  type="text"
                  className="shop-input"
                  maxLength={160}
                  value={name}
                  disabled={saving}
                  aria-invalid={Boolean(errors.name)}
                  onChange={e => {
                    setName(e.target.value);
                    if (errors.name) setErrors(prev => ({ ...prev, name: undefined }));
                  }}
                />
                {errors.name && (
                  <p className="form-error" role="alert">
                    {sourceText(errors.name)}
                  </p>
                )}
              </div>

              <div className="shop-field">
                <label className="shop-label" htmlFor="product-category">
                  {sourceText("Loại sản phẩm")}</label>
                <Select
                  id="product-category"
                  data-field="categoryId"
                  className="shop-select"
                  value={String(categoryId)}
                  disabled={saving}
                  aria-invalid={Boolean(errors.categoryId)}
                  onChange={e => {
                    setCategoryId(Number(e.target.value));
                    if (errors.categoryId) {
                      setErrors(prev => ({ ...prev, categoryId: undefined }));
                    }
                  }}
                >
                  <option value={0}>{sourceText("-- Chọn loại sản phẩm --")}</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                {errors.categoryId && (
                  <p className="form-error" role="alert">
                    {sourceText(errors.categoryId)}
                  </p>
                )}
              </div>

              <div className="shop-field">
                <label className="shop-label" htmlFor="product-form">
                  {sourceText("Dạng bào chế")}</label>
                <Select
                  id="product-form"
                  className="shop-select"
                  value={formType}
                  disabled={saving}
                  onChange={e => setFormType(e.target.value as ProductForm)}
                >
                  {ALL_FORMS.map(f => (
                    <option key={f} value={f}>
                      {FORM_LABELS[f]}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="shop-field">
                <label className="shop-label" htmlFor="product-brand">
                  {sourceText("Thương hiệu")}</label>
                <input
                  id="product-brand"
                  type="text"
                  className="shop-input"
                  maxLength={80}
                  value={brand}
                  disabled={saving}
                  onChange={e => setBrand(e.target.value)}
                />
              </div>
            </div>

            <div className="shop-field">
              <label className="shop-label" htmlFor="product-short-desc">
                {sourceText("Mô tả ngắn")}</label>
              <input
                id="product-short-desc"
                data-field="shortDescription"
                type="text"
                className="shop-input"
                maxLength={300}
                value={shortDescription}
                disabled={saving}
                aria-invalid={Boolean(errors.shortDescription)}
                onChange={e => {
                  setShortDescription(e.target.value);
                  if (errors.shortDescription) {
                    setErrors(prev => ({ ...prev, shortDescription: undefined }));
                  }
                }}
              />
              {errors.shortDescription && (
                <p className="form-error" role="alert">
                  {sourceText(errors.shortDescription)}
                </p>
              )}
            </div>

            <div className="shop-field">
              <label className="shop-label" htmlFor="product-desc">
                {sourceText("Mô tả chi tiết")}</label>
              <textarea
                id="product-desc"
                data-field="description"
                className="shop-textarea"
                rows={4}
                value={description}
                disabled={saving}
                aria-invalid={Boolean(errors.description)}
                onChange={e => {
                  setDescription(e.target.value);
                  if (errors.description) {
                    setErrors(prev => ({ ...prev, description: undefined }));
                  }
                }}
              />
              {errors.description && (
                <p className="form-error" role="alert">
                  {sourceText(errors.description)}
                </p>
              )}
            </div>

            <div className="shop-field">
              <span className="shop-label">{sourceText("Mục tiêu tập luyện")}</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ALL_GOALS.map((g, idx) => {
                  const selected = goals.includes(g);
                  return (
                    <button
                      key={g}
                      type="button"
                      data-field={idx === 0 ? 'goals' : undefined}
                      aria-pressed={selected}
                      className={`portal-tab ${selected ? 'active' : ''}`}
                      disabled={saving}
                      onClick={() => toggleGoal(g)}
                    >
                      {GOAL_LABELS[g]}
                    </button>
                  );
                })}
              </div>
              {errors.goals && (
                <p className="form-error" role="alert">
                  {sourceText(errors.goals)}
                </p>
              )}
            </div>
          </section>

          <ProductImagesEditor
            productId={numericId}
            images={images}
            onChange={setImages}
            disabled={saving}
          />

          <VariantRowsEditor
            rows={variants}
            onChange={next => {
              setVariants(next);
              if (errors.variants) setErrors(prev => ({ ...prev, variants: undefined }));
            }}
            disabled={saving}
            error={errors.variants}
          />

          <NutrientRowsEditor
            servingSize={servingSize}
            onServingSizeChange={next => {
              setServingSize(next);
              if (errors.servingSize) setErrors(prev => ({ ...prev, servingSize: undefined }));
            }}
            servingsPreview={firstServings}
            rows={nutrients}
            onChange={setNutrients}
            disabled={saving}
            servingSizeError={errors.servingSize}
          />

          <section className="portal-card stack" aria-label={sourceText("Hướng dẫn và hiển thị")}>
            <h2 className="portal-card-title" style={{ margin: 0 }}>
              {sourceText("Cách dùng, lưu ý & hiển thị")}</h2>

            <div className="shop-field">
              <label className="shop-label" htmlFor="product-usage">
                {sourceText("Cách dùng")}</label>
              <textarea
                id="product-usage"
                className="shop-textarea"
                rows={2}
                value={usageInstructions}
                disabled={saving}
                onChange={e => setUsageInstructions(e.target.value)}
              />
            </div>

            <div className="shop-field">
              <label className="shop-label" htmlFor="product-warnings">
                {sourceText("Lưu ý bảo quản & cảnh báo")}</label>
              <textarea
                id="product-warnings"
                className="shop-textarea"
                rows={2}
                value={warnings}
                disabled={saving}
                onChange={e => setWarnings(e.target.value)}
              />
            </div>

            <div className="shop-field" style={{ maxWidth: 360 }}>
              <label className="shop-label" htmlFor="product-reg-number">
                {sourceText("Số công bố (nếu có)")}</label>
              <input
                id="product-reg-number"
                type="text"
                className="shop-input"
                maxLength={60}
                value={registrationNumber}
                disabled={saving}
                onChange={e => setRegistrationNumber(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <label className="shop-checkbox">
                <input
                  type="checkbox"
                  checked={active}
                  disabled={saving}
                  onChange={e => setActive(e.target.checked)}
                />
                <span>{sourceText("Đang bán")}</span>
              </label>
              <label className="shop-checkbox">
                <input
                  type="checkbox"
                  checked={featured}
                  disabled={saving}
                  onChange={e => setFeatured(e.target.checked)}
                />
                <span>{sourceText("Nổi bật trên landing")}</span>
              </label>
            </div>
          </section>

          {submitError && (
            <p className="form-error" role="alert">
              {sourceText(submitError)}
            </p>
          )}

          <div className="form-actions">
            <Link to="/manager/products" className="btn-secondary">
              {sourceText("Hủy")}</Link>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? sourceText('Đang lưu…') : sourceText('Lưu sản phẩm')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
