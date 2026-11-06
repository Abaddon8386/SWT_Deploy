# SCRUM-110: CI tự động, build/deploy VPS bằng tay trong 1Panel

Giữ nguyên `.github/workflows/ci.yml` và `cd.yml` cho Render + Vercel.
Workflow bổ sung `ci-vps.yml` chỉ kiểm tra Docker; không publish GHCR,
không SSH vào VPS và không tự thay containers. Không cần secrets VPS trên GitHub.

## Mỗi lần sửa code

1. Sửa trên Mac, commit/push lên branch và mở PR vào main.
2. Trong GitHub > Actions hoặc PR > Checks, chờ **CI** và **CI VPS** xanh.
   CI kiểm tra frontend/backend; CI VPS kiểm tra Compose, build hai image,
   kiểm tra Java và Nginx/React routes. Lỗi ở job nào thì sửa và push lại.
3. Merge main, chờ checks của merge commit xanh. CD Render/Vercel tự chạy như cũ.
4. Trong Terminal 1Panel, cập nhật source:

```bash
cd /opt/scms
git pull --ff-only origin main
```

5. Vào Containers > Composes > scms, chọn build/rebuild và deploy/up nếu giao diện có.
   Phải build lại image và recreate containers; Restart chỉ chạy lại image cũ.
   Nếu giao diện chỉ có Up và không build lại image, dùng Terminal với
   **đúng file Compose của stack**:

```bash
sudo docker compose -p scms -f /DUONG_DAN_THUC_TE/docker-compose.yml up -d --build
```

Thay đường dẫn mẫu bằng đường dẫn hiển thị trong stack; không chạy nguyên placeholder.
Stack inline đã tạo trong 1Panel thường lưu dưới `/opt/1panel/docker/compose/scms/`;
kiểm tra tên file thực tế. Build context phải trỏ đến `/opt/scms/apps/api` và `/opt/scms/apps/web`.

6. Xem log build và kiểm tra containers:

```bash
sudo docker ps --filter name=scms
sudo docker logs --tail 80 scms-api-1
```

Tên container có thể khác; lấy tên thực tế từ docker ps hoặc 1Panel.
Container phải giữ trạng thái Up, không lặp Restarting/Exited. Nếu đã có healthcheck,
đợi healthy; Up một mình chưa chứng minh ứng dụng sẵn sàng.

## Health check ngay sau khi deploy

Trong Terminal 1Panel, kiểm tra API bên trong container (không cần mở cổng API):

```bash
sudo docker exec scms-api-1 wget -qO- http://127.0.0.1:8080/api/v1/health
```

Tiếp theo kiểm tra cả đường đi Nginx -> API và file frontend:

```bash
sudo docker exec scms-web-1 wget -qO- http://127.0.0.1/api/v1/health
sudo docker exec scms-web-1 wget -q -O /dev/null http://127.0.0.1/index.html
```

Hai lệnh health phải trả JSON có `"status":"UP"` và `"service":"scms-api"`.
Lệnh index.html trả exit code 0 khi thành công và không in nội dung.
Nếu API check lỗi, xem log api; API tốt mà check qua web lỗi thì xem log web/proxy.
Endpoint health kiểm tra API đang phản hồi, không thay thế kiểm tra chức năng/database:
thử thêm đăng nhập và mở một màn hình gọi dữ liệu.

Khi DNS/HTTPS của domain VPS đã cấu hình xong, từ Mac hoặc VPS chạy:

```bash
curl -fsS --max-time 15 https://scms.nexasoft.us/api/v1/health
```

Mở `https://scms.nexasoft.us` để kiểm tra giao diện. Nếu kiểm tra trong container tốt
nhưng domain lỗi, kiểm tra DNS, reverse proxy/TLS và cổng Azure. Các bước build/health
không tự tạo DNS hoặc chứng chỉ. Vercel/Render vẫn dùng domain/cấu hình riêng hiện tại.

Không cần file CD VPS trên GitHub hay callback/token từ VPS về GitHub.

## Cấu hình đang có

- `compose.yml` của repo mặc định dùng cổng web **8080**, đợi API healthy.
  Stack inline tạo trước đó trong 1Panel dùng cổng **80**.
  Tiếp tục dùng đúng stack; không tạo thêm stack scms thứ hai hoặc vô tình đổi cổng.
- Nếu chuyển sang nguồn Path dùng Compose của repo trong 1Panel, đồng bộ WEB_PORT,
  public URLs/CORS, reverse proxy và tunnel. Có OpenResty thì tránh trùng cổng 80/443.
- Không cần clone lại. Không sửa/commit source trên VPS để tránh lệch lịch sử GitHub.
- `.env` được giữ riêng trên VPS, không commit; các biến sẽ được cấu hình sau.
- Chưa mở cổng Azure thì chỉ xem qua tunnel; CI không tự sửa firewall hoặc DNS.
- Có thể đặt Ruleset trên main yêu cầu CI và CI VPS xanh trước khi merge.
  Workflow không tự tạo Ruleset trong GitHub Settings.

## Luồng thuyết trình

```text
Push/PR -> CI + CI VPS tự động kiểm tra
Merge main -> CD tự động Render -> Vercel
           -> git pull trên VPS -> build/deploy trong 1Panel -> health check
```

VPS là triển khai thủ công sau CI, không phải continuous deployment tự động.
`docs/examples` chỉ là mẫu tham khảo cho repo khác, không phải workflow đang chạy.
