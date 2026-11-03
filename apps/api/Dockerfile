# Giai đoạn 1: dùng Maven 3.9 và JDK 21 để build ứng dụng; đặt tên là "build".
FROM maven:3.9-eclipse-temurin-21 AS build
# Đặt thư mục làm việc trong image; tự tạo nếu chưa tồn tại.
WORKDIR /build

# Sao chép cấu hình Maven từ build context vào /build/pom.xml.
COPY pom.xml .
# Sao chép source code vào /build/src.
COPY src ./src
# Biên dịch và đóng gói JAR vào /build/target.
# -B: chạy không tương tác; -DskipTests: bỏ qua chạy test, CI chạy test riêng.
RUN mvn -B -DskipTests package

# Giai đoạn 2: tạo image chạy với Java Runtime 21, không mang theo Maven và source.
FROM eclipse-temurin:21-jre-alpine
# Đặt thư mục làm việc của ứng dụng là /app.
WORKDIR /app

# Lấy JAR từ giai đoạn "build", sao chép sang image chạy và đổi tên thành app.jar.
COPY --from=build /build/target/*.jar /app/app.jar

# Bật profile Supabase mặc định; có thể ghi đè bằng biến môi trường khi chạy.
ENV SPRING_PROFILES_ACTIVE=supabase
# Tùy chọn JVM cho máy ít tài nguyên (Render free: 0,1 CPU, 512 MB RAM); ghi đè được bằng biến môi trường JAVA_OPTS.
# SerialGC: ít luồng và ít RAM hơn G1; TieredStopAtLevel=1: chỉ dùng trình biên dịch C1, giảm CPU và RAM khi khởi động.
# MaxRAMPercentage=65: chừa RAM cho metaspace và bộ nhớ ngoài heap; Xss512k: giảm RAM mỗi luồng.
# ExitOnOutOfMemoryError: thoát để nền tảng khởi động lại thay vì treo trong trạng thái hỏng.
ENV JAVA_OPTS="-XX:+UseSerialGC -XX:TieredStopAtLevel=1 -XX:MaxRAMPercentage=65 -Xss512k -XX:+ExitOnOutOfMemoryError"
# Khai báo cổng dự kiến; cần docker run -p để ánh xạ cổng ra máy host.
EXPOSE 8080
# Chạy bằng user ID và group ID 10001 thay vì root để hạn chế quyền.
USER 10001:10001

# Khi container khởi động, shell thay biến môi trường rồi chạy file JAR.
# exec thay shell bằng Java để ứng dụng nhận tín hiệu dừng trực tiếp.
# 0.0.0.0: nhận kết nối qua các giao diện mạng trong container.
# PORT: dùng cổng do môi trường (như Render) cung cấp; nếu thiếu hoặc rỗng, dùng 8080.
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar --server.address=0.0.0.0 --server.port=${PORT:-8080}"]
