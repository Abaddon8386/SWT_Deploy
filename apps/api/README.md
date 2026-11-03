# SCMS API

Run with Java 21 and Maven 3.9+:

```bash
mvn spring-boot:run
```

Set `APP_JWT_SECRET` and `SPRING_DATASOURCE_*` in the environment before running. Every database connection uses the `supabase` profile and PostgreSQL with TLS. Hibernate JPA entities own the schema (`ddl-auto: update`); invariant triggers and data security are installed by the existing initializers. Do not bootstrap from historical DDL/migrations or use retired database profiles.

Optional Redis catalog cache and Kafka notification outbox: see [setup and operation](../../docs/setup/kafka-redis.md). Both are off by default until infrastructure is configured. The new tests are prepared but have not been executed at the user's request.

Organize new code by feature and use `controller`, `service`, `repository`, `entity`, and `dto` packages where applicable. Never put feature business logic in global `controller` or `service` packages. `run-local.ps1` loads the root `.env` and generates a temporary JWT signing key for local runs; manual and deployed runs must provide a private `APP_JWT_SECRET`. Set `APP_OTP_DELIVERY=smtp` and the `SMTP_*` variables to deliver production email OTPs; the `disabled` adapter returns HTTP 503, while `run-local.ps1` exposes the generated code only in its local profile.
