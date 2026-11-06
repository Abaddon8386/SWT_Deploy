import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VnpayReturnPage } from './VnpayReturnPage';
import * as api from './vnpayApi';
import { toast } from '../../shared/ui/toast';
vi.mock('../../shared/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('./vnpayApi', () => ({ getVnpayStatus: vi.fn(), verifyVnpayReturn: vi.fn() }));
let host: HTMLDivElement; let root: Root;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host=document.createElement('div');document.body.append(host);root=createRoot(host); });
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.clearAllMocks();vi.unstubAllGlobals();});
async function render(query: string) { await act(async()=>root.render(<MemoryRouter key={query} initialEntries={['/member/payments/vnpay/return'+query]}><VnpayReturnPage /></MemoryRouter>)); }
it('never trusts a successful browser return code over server status',async()=>{
 vi.mocked(api.getVnpayStatus).mockResolvedValue({reference:'ABC123',paymentId:1,subscriptionId:2,amount:500000,status:'failed',expiresAt:'2026-11-03T12:15:00',destination:'/member/packages'});
 await render('?vnp_TxnRef=ABC123&vnp_ResponseCode=00');
 expect(host.textContent).toContain('Thanh toán chưa thành công'); expect(host.textContent).not.toContain('Thanh toán thành công');
 expect(toast.error).toHaveBeenCalledWith('Thanh toán VNPay chưa thành công', { vi: 'Thanh toán VNPay chưa thành công', en: 'VNPay payment unsuccessful' }); expect(toast.success).not.toHaveBeenCalled();
});
it('shows confirmed server success even if the return code says failure',async()=>{
 vi.mocked(api.getVnpayStatus).mockResolvedValue({reference:'ABC123',paymentId:1,subscriptionId:2,amount:500000,status:'success',expiresAt:'2026-11-03T12:15:00',destination:'/member/packages'});
 await render('?vnp_TxnRef=ABC123&vnp_ResponseCode=24');expect(host.textContent).toContain('Thanh toán thành công');
 expect(toast.success).toHaveBeenCalledTimes(1); expect(toast.error).not.toHaveBeenCalled();
});
it('requires a reference and makes no callback or settlement request',async()=>{await render('');expect(host.querySelector('[role="alert"]')).not.toBeNull();expect(api.getVnpayStatus).not.toHaveBeenCalled();});
it('verifies signed VNPay return parameters with the server',async()=>{
 vi.mocked(api.verifyVnpayReturn).mockResolvedValue({reference:'ABC123',paymentId:1,subscriptionId:2,amount:500000,status:'success',expiresAt:'2026-11-03T12:15:00',destination:'/member/packages'});
 await render('?vnp_TxnRef=ABC123&vnp_ResponseCode=00&vnp_SecureHash=signed123');
 expect(api.verifyVnpayReturn).toHaveBeenCalledWith({vnp_TxnRef:'ABC123',vnp_ResponseCode:'00',vnp_SecureHash:'signed123'});
 expect(host.textContent).toContain('Thanh toán thành công');
});
it('vnpay return accepts /member/orders/42 and still rejects other paths',async()=>{
 vi.mocked(api.getVnpayStatus).mockResolvedValueOnce({reference:'ABC123',paymentId:1,subscriptionId:null,amount:500000,status:'success',expiresAt:'2026-11-03T12:15:00',destination:'/member/orders/42'});
 await render('?vnp_TxnRef=ABC123');
 expect(host.querySelector('a.btn-primary')?.getAttribute('href')).toBe('/member/orders/42');

 vi.mocked(api.getVnpayStatus).mockResolvedValueOnce({reference:'DEF456',paymentId:2,subscriptionId:null,amount:500000,status:'success',expiresAt:'2026-11-03T12:15:00',destination:'/admin/users'});
 await render('?vnp_TxnRef=DEF456');
 expect(host.querySelector('a.btn-primary')?.getAttribute('href')).toBe('/member/invoices');
});

it('keeps pending uncertain and only announces a delayed success after a backend recheck', async () => {
 const status: api.VnpayStatus = {reference:'ABC123',paymentId:1,subscriptionId:2,amount:500000,status:'pending',expiresAt:'2026-11-03T12:15:00',destination:'/member/packages'};
 vi.mocked(api.getVnpayStatus).mockResolvedValueOnce(status).mockResolvedValueOnce({...status,status:'success'});
 await render('?vnp_TxnRef=ABC123&vnp_ResponseCode=00');
 expect(host.textContent).toContain('Hệ thống chưa nhận xác nhận từ VNPay');
 expect(toast.success).not.toHaveBeenCalled(); expect(toast.error).not.toHaveBeenCalled();
 await act(async()=> ([...host.querySelectorAll('button')].find(button=>button.textContent==='Kiểm tra lại') as HTMLButtonElement).click());
 expect(host.textContent).toContain('Thanh toán thành công');
 expect(toast.success).toHaveBeenCalledTimes(1);
});
