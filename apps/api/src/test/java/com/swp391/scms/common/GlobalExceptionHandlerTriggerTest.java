package com.swp391.scms.common;

import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.config.I18nConfig;
import org.hibernate.JDBCException;
import org.hibernate.dialect.PostgreSQLDialect;
import org.hibernate.exception.internal.SQLStateConversionDelegate;
import org.hibernate.exception.internal.StandardSQLExceptionConverter;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.jpa.vendor.HibernateJpaDialect;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.sql.SQLException;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** SCRUM-80: PostgreSQL trigger failures must retain localized HTTP responses. */
class GlobalExceptionHandlerTriggerTest {

    private static final String DB_CAPACITY_VI = "Lớp học đã đầy chỗ (vượt quá capacity cho phép).";
    private static final String CAPACITY_VI = "Lớp học đã đầy chỗ";
    private static final String CAPACITY_EN = "Class is full";
    private static final String SCHEDULE_VI = "Trùng lịch: Huấn luyện viên hoặc phòng học đã có lịch trong khung giờ này";
    private static final String SCHEDULE_EN = "Schedule conflict: Coach or room is already booked during this time slot";
    private static final String MEMBERSHIP_VI = "Bạn chưa đăng ký gói tập, gói tập chưa được kích hoạt hoặc đã hết hạn. Vui lòng đăng ký gói tập trước khi đặt lịch";
    private static final String MEMBERSHIP_EN = "You do not have an active membership package or your subscription has expired. Please register or activate a package before booking";

    @Test
    void coachRestTriggerReturnsConflict() {
        var response = new GlobalExceptionHandler().handleDataIntegrity(
                new DataIntegrityViolationException("ERROR: trg_coach_bookings_rest_required"));
        org.junit.jupiter.api.Assertions.assertEquals(409, response.getStatusCode().value());
        org.junit.jupiter.api.Assertions.assertEquals("COACH_REST_REQUIRED", response.getBody().getCode());
    }

    @Test
    void scheduleContentionReturnsRetryableConflict() {
        var response = new GlobalExceptionHandler().handleDataIntegrity(
                new DataIntegrityViolationException("trg_pt_schedule_busy"));
        org.junit.jupiter.api.Assertions.assertEquals(409, response.getStatusCode().value());
        org.junit.jupiter.api.Assertions.assertEquals("SCHEDULE_UPDATE_IN_PROGRESS", response.getBody().getCode());
    }

    @Test
    void memberScheduleOverlapReturnsConflict() {
        var response = new GlobalExceptionHandler().handleDataIntegrity(
                new DataIntegrityViolationException("ERROR: trg_member_schedule_conflict"));
        org.junit.jupiter.api.Assertions.assertEquals(409, response.getStatusCode().value());
        org.junit.jupiter.api.Assertions.assertEquals("SCHEDULING_MEMBER_TIME_OVERLAP", response.getBody().getCode());
    }

    @ParameterizedTest
    @MethodSource("triggerFailures")
    void preservesPostgresTriggerResponses(TriggerFailure trigger, String databaseMessage, String language) throws Exception {
        SQLException sqlError = new SQLException("ERROR: " + databaseMessage, trigger.sqlState());
        DataAccessException translated = translate(sqlError);
        assertInstanceOf(DataIntegrityViolationException.class, translated);

        assertTriggerResponse(translated, trigger, language);
    }

    @ParameterizedTest
    @MethodSource("unrelatedDatabaseFailures")
    void keepsUnrelatedDatabaseFailuresAsLocalizedServerErrors(SQLException sqlError, String language) throws Exception {
        DataAccessException translated = translate(sqlError);

        mockMvcFor(translated).perform(get("/trigger-test").header("Accept-Language", language))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_SERVER_ERROR"))
                .andExpect(jsonPath("$.details").doesNotExist())
                .andExpect(jsonPath("$.message").value(language.equals("vi")
                        ? "Đã xảy ra lỗi hệ thống. Vui lòng liên hệ quản trị viên."
                        : "An internal system error occurred. Please contact administrator."));
    }

    @Test
    void defaultsTriggerResponseToVietnamese() throws Exception {
        mockMvcFor(translate(new SQLException(DB_CAPACITY_VI, "23514"))).perform(get("/trigger-test"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CLASS_CAPACITY_EXCEEDED"))
                .andExpect(jsonPath("$.message").value(CAPACITY_VI));
    }

    @ParameterizedTest
    @MethodSource("unrelatedIntegrityFailures")
    void keepsOtherCheckViolationsAsGenericIntegrityErrors(String databaseMessage, String language) throws Exception {
        DataAccessException translated = translate(new SQLException(databaseMessage, "23514"));

        mockMvcFor(translated).perform(get("/trigger-test").header("Accept-Language", language))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DATA_INTEGRITY_VIOLATION"))
                .andExpect(jsonPath("$.message").value(language.equals("vi")
                        ? "Vi phạm ràng buộc toàn vẹn cơ sở dữ liệu."
                        : "Database integrity constraint violation."));
    }

    private void assertTriggerResponse(DataAccessException failure, TriggerFailure trigger, String language) throws Exception {
        mockMvcFor(failure).perform(get("/trigger-test").header("Accept-Language", language))
                .andExpect(status().is(trigger.status()))
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.status").value(trigger.status()))
                .andExpect(jsonPath("$.code").value(trigger.code()))
                .andExpect(jsonPath("$.details").doesNotExist())
                .andExpect(jsonPath("$.message").value(language.equals("vi") ? trigger.vietnamese() : trigger.english()));
    }

    private static DataAccessException translate(SQLException sqlError) {
        PostgreSQLDialect dialect = new PostgreSQLDialect();
        StandardSQLExceptionConverter converter = new StandardSQLExceptionConverter(
                dialect.buildSQLExceptionConversionDelegate(), new SQLStateConversionDelegate(dialect));
        JDBCException hibernateError = converter.convert(sqlError, "could not execute statement", "insert into private_table values (?)");
        DataAccessException translated = new HibernateJpaDialect().translateExceptionIfPossible(hibernateError);
        assertNotNull(translated);
        return translated;
    }

    private MockMvc mockMvcFor(RuntimeException failure) {
        ResourceBundleMessageSource source = new ResourceBundleMessageSource();
        source.setBasename("i18n/messages");
        source.setDefaultEncoding("UTF-8");
        source.setFallbackToSystemLocale(false);
        return MockMvcBuilders.standaloneSetup(new FailingController(failure))
                .setControllerAdvice(new GlobalExceptionHandler(new MessageService(source)))
                .setLocaleResolver(new I18nConfig().localeResolver())
                .build();
    }

    private static Stream<Arguments> triggerFailures() {
        return Stream.of(
                new TriggerFailure(DB_CAPACITY_VI, "trg_enrollments_check_capacity", "23514", 409,
                        "CLASS_CAPACITY_EXCEEDED", CAPACITY_VI, CAPACITY_EN),
                new TriggerFailure("Huấn luyện viên hoặc phòng tập đã có lịch trùng khung giờ này.",
                        "trg_sessions_check_conflict", "23P01", 409,
                        "SCHEDULE_CONFLICT", SCHEDULE_VI, SCHEDULE_EN),
                new TriggerFailure("Học viên không có gói thành viên còn hiệu lực để đăng ký lớp.",
                        "trg_enrollments_check_membership", "23514", 403,
                        "MEMBERSHIP_INACTIVE_OR_EXPIRED", MEMBERSHIP_VI, MEMBERSHIP_EN),
                new TriggerFailure("Học viên không có gói thành viên còn hiệu lực để check-in.",
                        "trg_checkins_check_membership", "23514", 403,
                        "MEMBERSHIP_INACTIVE_OR_EXPIRED", MEMBERSHIP_VI, MEMBERSHIP_EN))
                .flatMap(trigger -> Stream.of(trigger.message(), trigger.constraint())
                        .flatMap(message -> Stream.of("vi", "en").map(language -> Arguments.of(trigger, message, language))));
    }

    @ParameterizedTest
    @MethodSource("courtFailures")
    void courtConstraintsHaveLocalizedPublicResponses(String constraint, int httpStatus, String code,
                                                     String language, String message) throws Exception {
        mockMvcFor(translate(new SQLException(constraint, "23514")))
                .perform(get("/trigger-test").header("Accept-Language", language))
                .andExpect(status().is(httpStatus))
                .andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.message").value(message))
                .andExpect(jsonPath("$.details").doesNotExist());
    }

    private static Stream<Arguments> courtFailures() {
        return Stream.of(
                Arguments.of("trg_court_bookings_check_conflict", 409, "COURT_BOOKING_SLOT_TAKEN", "vi",
                        "Khung giờ đã có lượt đặt sân hoặc lớp học trùng lịch"),
                Arguments.of("trg_court_bookings_check_conflict", 409, "COURT_BOOKING_SLOT_TAKEN", "en",
                        "This time overlaps an existing court booking or class"),
                Arguments.of("trg_court_bookings_check_membership", 403, "COURT_BOOKING_MEMBERSHIP_INVALID", "vi",
                        "Bạn chưa đăng ký gói tập hoặc gói tập không còn hiệu lực đến ngày đặt sân. Vui lòng đăng ký gói tập đang hoạt động để đặt sân"),
                Arguments.of("trg_court_bookings_check_limit", 409, "COURT_BOOKING_LIMIT_REACHED", "en",
                        "You can have at most four court bookings per day"),
                Arguments.of("trg_court_bookings_check_slot", 400, "COURT_BOOKING_INVALID_SLOT", "en",
                        "Choose a whole-hour 60-minute slot within the court opening hours"));
    }

    private static Stream<Arguments> unrelatedDatabaseFailures() {
        return Stream.of(
                new SQLException("syntax error at or near 'trg_enrollments_check_capacity'.", "42601"),
                new SQLException(CAPACITY_VI, "42601"),
                new SQLException("Unknown processing failure for gói and khung giờ.", "P0001"),
                new SQLException("Connection to private_database failed.", "08001"))
                .flatMap(error -> Stream.of("vi", "en").map(language -> Arguments.of(error, language)));
    }

    private static Stream<Arguments> unrelatedIntegrityFailures() {
        return Stream.of("ERROR: invalid gói value.", "ERROR: invalid khung giờ value.")
                .flatMap(message -> Stream.of("vi", "en").map(language -> Arguments.of(message, language)));
    }

    private record TriggerFailure(String message, String constraint, String sqlState,
                                  int status, String code, String vietnamese, String english) { }

    @RestController
    static class FailingController {
        private final RuntimeException failure;

        FailingController(RuntimeException failure) {
            this.failure = failure;
        }

        @GetMapping("/trigger-test")
        void fail() {
            throw failure;
        }
    }
}
