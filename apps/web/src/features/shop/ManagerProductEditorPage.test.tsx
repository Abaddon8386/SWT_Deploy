import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ManagerProductEditorPage } from './ManagerProductEditorPage';
import { shopApi } from './shopApi';

vi.mock('../../shared/lib/portalNotices', () => ({ notify: vi.fn() }));
vi.mock('./shopApi', () => ({
  shopApi: {
    manager: {
      listCategories: vi.fn(),
      getProduct: vi.fn(),
      createProduct: vi.fn(),
      updateProduct: vi.fn(),
      addImage: vi.fn(),
      removeImage: vi.fn(),
      reorderImages: vi.fn(),
      adjustStock: vi.fn(),
    },
  },
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.mocked(shopApi.manager.listCategories).mockResolvedValue([
    { id: 1, name: 'Whey', slug: 'whey', sortOrder: 1, active: true, productCount: 2 },
  ]);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function renderEditor(entry = '/manager/products/new') {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/manager/products/new" element={<ManagerProductEditorPage />} />
          <Route path="/manager/products/:productId" element={<ManagerProductEditorPage />} />
          <Route path="/manager/products" element={<div>Danh sách sản phẩm</div>} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

async function click(text: string) {
  await act(async () => {
    const btn = [...host.querySelectorAll<HTMLButtonElement>('button')].find(el =>
      el.textContent?.includes(text),
    );
    expect(btn).toBeTruthy();
    btn!.click();
  });
}

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, val: string) {
  const proto =
    el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

it('editor validates required fields inline and focuses the first error', async () => {
  await renderEditor('/manager/products/new');
  await click('Lưu sản phẩm');

  const nameInput = host.querySelector<HTMLInputElement>('#product-name')!;
  expect(nameInput.getAttribute('aria-invalid')).toBe('true');
  expect(document.activeElement).toBe(nameInput);
  expect(host.textContent).toContain('Tên sản phẩm cần tối thiểu 2 ký tự.');
  expect(shopApi.manager.createProduct).not.toHaveBeenCalled();
});

it('editor shows a live NutritionFacts preview while typing nutrient rows', async () => {
  await renderEditor('/manager/products/new');
  await click('Thêm thành phần');

  const nameField = host.querySelector<HTMLInputElement>('input[aria-label="Tên chất 1"]')!;
  const amountField = host.querySelector<HTMLInputElement>('input[aria-label="Lượng chất 1"]')!;
  const dvField = host.querySelector<HTMLInputElement>('input[aria-label="% NCKN chất 1"]')!;

  await act(async () => {
    setInputValue(nameField, 'Đạm');
    setInputValue(amountField, '25');
    setInputValue(dvField, '50');
  });

  const factsTable = host.querySelector('.shop-facts table')!;
  expect(factsTable.textContent).toContain('Đạm');
  expect(factsTable.textContent).toContain('25 g');
  expect(factsTable.textContent).toContain('50%');
});

it('only one nutrient can be marked as highlight', async () => {
  await renderEditor('/manager/products/new');
  await click('Thêm thành phần');
  await click('Thêm thành phần');

  const hl1 = host.querySelector<HTMLInputElement>('input[aria-label="Nổi bật chất 1"]')!;
  const hl2 = host.querySelector<HTMLInputElement>('input[aria-label="Nổi bật chất 2"]')!;

  await act(async () => {
    hl1.click();
  });
  expect(hl1.checked).toBe(true);
  expect(hl2.checked).toBe(false);

  await act(async () => {
    hl2.click();
  });
  expect(hl1.checked).toBe(false);
  expect(hl2.checked).toBe(true);
});

it('images: rejects non JPEG/PNG/WEBP or >1.5 MB before upload, requires alt text, reorders with ↑↓', async () => {
  vi.mocked(shopApi.manager.getProduct).mockResolvedValue({
    id: 5,
    slug: 'sol-whey-isolate',
    name: 'SÖL Whey Isolate',
    brand: 'SÖL Nutrition',
    categoryId: 1,
    categoryName: 'Whey',
    categorySlug: 'whey',
    form: 'powder',
    goals: ['muscle_gain'],
    shortDescription: 'Đạm whey tách béo',
    description: 'Đạm whey tách béo chất lượng cao',
    servingSize: '1 muỗng (33 g)',
    usageInstructions: null,
    warnings: null,
    registrationNumber: null,
    active: true,
    featured: false,
    images: [
      { id: 101, url: '/img/1.png', alt: 'Ảnh mặt trước' },
      { id: 102, url: '/img/2.png', alt: 'Ảnh nhãn sau' },
    ],
    variants: [
      {
        id: 11,
        sku: 'SOL-WHEY-2KG',
        label: 'Sô-cô-la · 2,27 kg',
        price: 1290000,
        servingsPerContainer: 68,
        pricePerServing: 18971,
        stock: 15,
        available: true,
        active: true,
        sortOrder: 0,
      },
    ],
    nutrients: [],
  });
  vi.mocked(shopApi.manager.reorderImages).mockImplementation(async (_pid, ids) => ({
    id: 5,
    slug: 'sol-whey-isolate',
    name: 'SÖL Whey Isolate',
    brand: 'SÖL Nutrition',
    categoryId: 1,
    categoryName: 'Whey',
    categorySlug: 'whey',
    form: 'powder',
    goals: ['muscle_gain'],
    shortDescription: 'Đạm whey tách béo',
    description: 'Đạm whey tách béo chất lượng cao',
    servingSize: '1 muỗng (33 g)',
    usageInstructions: null,
    warnings: null,
    registrationNumber: null,
    active: true,
    featured: false,
    images:
      ids[0] === 102
        ? [
            { id: 102, url: '/img/2.png', alt: 'Ảnh nhãn sau' },
            { id: 101, url: '/img/1.png', alt: 'Ảnh mặt trước' },
          ]
        : [
            { id: 101, url: '/img/1.png', alt: 'Ảnh mặt trước' },
            { id: 102, url: '/img/2.png', alt: 'Ảnh nhãn sau' },
          ],
    variants: [],
    nutrients: [],
  }));

  await renderEditor('/manager/products/5');

  const fileInput = host.querySelector<HTMLInputElement>('#product-image-file')!;

  // 1. Reject SVG
  const svgFile = new File(['<svg></svg>'], 'bad.svg', { type: 'image/svg+xml' });
  await act(async () => {
    Object.defineProperty(fileInput, 'files', { value: [svgFile], configurable: true });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(host.textContent).toContain('Chỉ chấp nhận ảnh định dạng JPEG, PNG hoặc WEBP.');
  expect(shopApi.manager.addImage).not.toHaveBeenCalled();

  // 2. Reject > 1.5 MB
  const bigFile = new File([new Uint8Array(1600000)], 'huge.png', { type: 'image/png' });
  await act(async () => {
    Object.defineProperty(fileInput, 'files', { value: [bigFile], configurable: true });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(host.textContent).toContain('Dung lượng ảnh không được vượt quá 1,5 MB.');
  expect(shopApi.manager.addImage).not.toHaveBeenCalled();

  // 3. Require alt text before upload
  const validFile = new File(['pngbytes'], 'ok.png', { type: 'image/png' });
  await act(async () => {
    Object.defineProperty(fileInput, 'files', { value: [validFile], configurable: true });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await click('Tải ảnh lên');
  expect(host.textContent).toContain('Vui lòng nhập mô tả ảnh (alt) trước khi tải lên.');
  expect(shopApi.manager.addImage).not.toHaveBeenCalled();

  // 4. Reorder with ↑↓
  const moveDownBtn = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Chuyển ảnh Ảnh mặt trước xuống"]',
  )!;
  await act(async () => {
    moveDownBtn.click();
  });
  expect(shopApi.manager.reorderImages).toHaveBeenCalledWith(5, [102, 101]);
});

it('existing variant stock is read-only and changed through the adjust dialog with a reason', async () => {
  vi.mocked(shopApi.manager.getProduct).mockResolvedValue({
    id: 5,
    slug: 'sol-whey-isolate',
    name: 'SÖL Whey Isolate',
    brand: 'SÖL Nutrition',
    categoryId: 1,
    categoryName: 'Whey',
    categorySlug: 'whey',
    form: 'powder',
    goals: ['muscle_gain'],
    shortDescription: 'Đạm whey tách béo',
    description: 'Đạm whey tách béo chất lượng cao',
    servingSize: '1 muỗng (33 g)',
    usageInstructions: null,
    warnings: null,
    registrationNumber: null,
    active: true,
    featured: false,
    images: [],
    variants: [
      {
        id: 11,
        sku: 'SOL-WHEY-2KG',
        label: 'Sô-cô-la · 2,27 kg',
        price: 1290000,
        servingsPerContainer: 68,
        pricePerServing: 18971,
        stock: 15,
        available: true,
        active: true,
        sortOrder: 0,
      },
    ],
    nutrients: [],
  });
  vi.mocked(shopApi.manager.adjustStock).mockResolvedValue({
    id: 11,
    sku: 'SOL-WHEY-2KG',
    label: 'Sô-cô-la · 2,27 kg',
    price: 1290000,
    servingsPerContainer: 68,
    pricePerServing: 18971,
    stock: 25,
    available: true,
    active: true,
    sortOrder: 0,
  });

  await renderEditor('/manager/products/5');

  const stockInput = host.querySelector<HTMLInputElement>('input[aria-label="Tồn kho biến thể 1"]')!;
  expect(stockInput.readOnly).toBe(true);
  expect(stockInput.value).toBe('15');

  await click('Điều chỉnh tồn');
  expect(host.querySelector('dialog')).not.toBeNull();

  await click('Lưu điều chỉnh');
  expect(shopApi.manager.adjustStock).toHaveBeenCalledWith(11, {
    delta: 10,
    reason: 'restock',
    note: null,
  });
  expect(stockInput.value).toBe('25');
});
