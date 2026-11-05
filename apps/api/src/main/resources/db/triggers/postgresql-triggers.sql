-- Invariant business triggers for PostgreSQL
-- Automatically initialized after Hibernate Code-First schema generation

CREATE OR REPLACE FUNCTION scms_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION scms_touch_updated_at();

CREATE OR REPLACE FUNCTION scms_check_enrollment_capacity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    previous_class_id BIGINT;
    class_capacity INTEGER;
    booked_count BIGINT;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        previous_class_id := OLD.class_id;
    END IF;

    PERFORM id
    FROM classes
    WHERE id = NEW.class_id OR id = previous_class_id
    ORDER BY id
    FOR UPDATE;

    IF NEW.status = 'booked' THEN
        SELECT capacity INTO class_capacity FROM classes WHERE id = NEW.class_id;
        SELECT COUNT(*) INTO booked_count
        FROM class_enrollments
        WHERE class_id = NEW.class_id AND status = 'booked';

        IF booked_count > class_capacity THEN
            RAISE EXCEPTION 'Lớp học đã đầy chỗ (vượt quá capacity cho phép).'
                USING ERRCODE = '23514', CONSTRAINT = 'trg_enrollments_check_capacity';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrollments_check_capacity ON class_enrollments;
CREATE TRIGGER trg_enrollments_check_capacity
AFTER INSERT OR UPDATE OF class_id, status ON class_enrollments
FOR EACH ROW EXECUTE FUNCTION scms_check_enrollment_capacity();

CREATE OR REPLACE FUNCTION scms_check_session_conflict()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    session_coach_id BIGINT;
    session_room_id BIGINT;
    lock_key BIGINT;
BEGIN
    SELECT coach_id, room_id INTO session_coach_id, session_room_id
    FROM classes WHERE id = NEW.class_id FOR SHARE;

    FOR lock_key IN
        SELECT DISTINCT hashtextextended(resource_key, 0)
        FROM unnest(ARRAY[
            'coach:' || session_coach_id::TEXT,
            'room:' || session_room_id::TEXT
        ]) AS resources(resource_key)
        ORDER BY 1
    LOOP
        PERFORM pg_advisory_xact_lock(lock_key);
    END LOOP;

    IF NEW.status <> 'cancelled' AND EXISTS (
        SELECT 1
        FROM class_sessions existing_session
        JOIN classes existing_class ON existing_class.id = existing_session.class_id
        WHERE existing_session.id <> NEW.id
          AND existing_session.session_date = NEW.session_date
          AND existing_session.status <> 'cancelled'
          AND NEW.start_time < existing_session.end_time
          AND NEW.end_time > existing_session.start_time
          AND (existing_class.coach_id = session_coach_id OR existing_class.room_id = session_room_id)
    ) THEN
        RAISE EXCEPTION 'Huấn luyện viên hoặc phòng tập đã có lịch trùng khung giờ này.'
            USING ERRCODE = '23P01', CONSTRAINT = 'trg_sessions_check_conflict';
    END IF;

    IF NEW.status <> 'cancelled' AND EXISTS (
        SELECT 1 FROM court_bookings b
        WHERE b.room_id = session_room_id AND b.booking_date = NEW.session_date
          AND b.status = 'booked'
          AND NEW.start_time < b.end_time AND NEW.end_time > b.start_time
    ) THEN
        RAISE EXCEPTION 'trg_court_bookings_check_conflict'
            USING ERRCODE = '23P01', CONSTRAINT = 'trg_court_bookings_check_conflict';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sessions_check_conflict ON class_sessions;
CREATE TRIGGER trg_sessions_check_conflict
AFTER INSERT OR UPDATE OF class_id, session_date, start_time, end_time, status ON class_sessions
FOR EACH ROW EXECUTE FUNCTION scms_check_session_conflict();

-- Room and member locks serialize independent application instances as well as direct SQL.
-- The room key is shared with class-session creation/rescheduling above.
CREATE OR REPLACE FUNCTION scms_guard_court_booking()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    lock_key BIGINT;
    court rooms%ROWTYPE;
    discipline_name TEXT;
    business_now TIMESTAMP := statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh';
BEGIN
    IF NEW.status <> 'booked' THEN RETURN NEW; END IF;

    FOR lock_key IN
        SELECT DISTINCT hashtextextended(resource_key, 0)
        FROM unnest(ARRAY['room:' || NEW.room_id::TEXT,
                          'court-member:' || NEW.member_id::TEXT]) AS resources(resource_key)
        ORDER BY 1
    LOOP
        PERFORM pg_advisory_xact_lock(lock_key);
    END LOOP;

    SELECT * INTO court FROM rooms WHERE id = NEW.room_id FOR SHARE;
    SELECT name INTO discipline_name FROM disciplines WHERE id = court.discipline_id;
    IF court.id IS NULL OR court.status <> 'available' OR court.open_time IS NULL
       OR court.close_time IS NULL OR court.discipline_id IS NULL
       OR discipline_name NOT IN ('Tennis', 'Cầu lông', 'Bơi lội') THEN
        RAISE EXCEPTION 'trg_court_bookings_check_court'
            USING ERRCODE = '23514', CONSTRAINT = 'trg_court_bookings_check_court';
    END IF;

    IF NEW.booking_date + NEW.start_time <= business_now THEN
        RAISE EXCEPTION 'trg_court_bookings_check_past'
            USING ERRCODE = '23514', CONSTRAINT = 'trg_court_bookings_check_past';
    END IF;
    IF EXTRACT(MINUTE FROM NEW.start_time) <> 0 OR EXTRACT(SECOND FROM NEW.start_time) <> 0
       OR NEW.end_time - NEW.start_time <> INTERVAL '1 hour'
       OR NEW.start_time < court.open_time OR NEW.end_time > court.close_time
       OR court.open_time >= court.close_time THEN
        RAISE EXCEPTION 'trg_court_bookings_check_slot'
            USING ERRCODE = '23514', CONSTRAINT = 'trg_court_bookings_check_slot';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM membership_subscriptions s JOIN users u ON u.id = s.member_id
        WHERE s.member_id = NEW.member_id AND s.status = 'active'
          AND s.start_date <= business_now::date AND s.end_date >= business_now::date
          AND s.start_date <= NEW.booking_date AND s.end_date >= NEW.booking_date
          AND u.deleted_at IS NULL AND u.status = 'active'
        FOR SHARE OF s, u
    ) THEN
        RAISE EXCEPTION 'trg_court_bookings_check_membership'
            USING ERRCODE = '23514', CONSTRAINT = 'trg_court_bookings_check_membership';
    END IF;

    IF EXISTS (
        SELECT 1 FROM court_bookings b WHERE b.id IS DISTINCT FROM NEW.id
          AND b.booking_date = NEW.booking_date AND b.status = 'booked'
          AND (b.room_id = NEW.room_id OR b.member_id = NEW.member_id)
          AND NEW.start_time < b.end_time AND NEW.end_time > b.start_time
    ) OR EXISTS (
        SELECT 1 FROM class_sessions s JOIN classes c ON c.id = s.class_id
        WHERE c.room_id = NEW.room_id AND s.session_date = NEW.booking_date
          AND s.status <> 'cancelled'
          AND NEW.start_time < s.end_time AND NEW.end_time > s.start_time
    ) THEN
        RAISE EXCEPTION 'trg_court_bookings_check_conflict'
            USING ERRCODE = '23P01', CONSTRAINT = 'trg_court_bookings_check_conflict';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_court_bookings_check_conflict ON court_bookings;
CREATE TRIGGER trg_court_bookings_check_conflict
BEFORE INSERT OR UPDATE OF room_id, member_id, booking_date, start_time, end_time, status ON court_bookings
FOR EACH ROW EXECUTE FUNCTION scms_guard_court_booking();

-- Changing the room of an existing class moves its sessions without updating their rows.
CREATE OR REPLACE FUNCTION scms_guard_class_court_room()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.room_id IS NOT DISTINCT FROM OLD.room_id THEN RETURN NEW; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('room:' || NEW.room_id::TEXT, 0));
    IF EXISTS (
        SELECT 1 FROM class_sessions s JOIN court_bookings b
          ON b.room_id = NEW.room_id AND b.booking_date = s.session_date
         AND b.status = 'booked' AND s.start_time < b.end_time AND s.end_time > b.start_time
        WHERE s.class_id = NEW.id AND s.status <> 'cancelled'
    ) THEN
        RAISE EXCEPTION 'trg_court_bookings_check_conflict'
            USING ERRCODE = '23P01', CONSTRAINT = 'trg_court_bookings_check_conflict';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_classes_check_court_room ON classes;
CREATE TRIGGER trg_classes_check_court_room AFTER UPDATE OF room_id ON classes
FOR EACH ROW EXECUTE FUNCTION scms_guard_class_court_room();

CREATE OR REPLACE FUNCTION scms_require_active_membership_for_enrollment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    business_date date := (statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
    IF NEW.status = 'booked' AND NOT EXISTS (
        SELECT 1
        FROM membership_subscriptions subscription
        WHERE subscription.member_id = NEW.member_id
          AND subscription.status = 'active'
          AND subscription.start_date <= business_date
          AND subscription.end_date >= business_date
        FOR SHARE
    ) THEN
        RAISE EXCEPTION 'Học viên không có gói thành viên còn hiệu lực để đăng ký lớp.'
            USING ERRCODE = '23514', CONSTRAINT = 'trg_enrollments_check_membership';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrollments_check_membership ON class_enrollments;
CREATE TRIGGER trg_enrollments_check_membership
BEFORE INSERT OR UPDATE OF member_id, status ON class_enrollments
FOR EACH ROW EXECUTE FUNCTION scms_require_active_membership_for_enrollment();

-- Per-session bookings: each session has its own seats. Class-wide enrollments (legacy rows) also occupy a seat in
-- every session of their class, so both are counted against the class capacity.
CREATE OR REPLACE FUNCTION scms_check_session_booking_capacity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    target_class_id BIGINT;
    class_capacity INTEGER;
    class_wide_count BIGINT;
    booked_count BIGINT;
BEGIN
    IF NEW.status <> 'booked' THEN
        RETURN NEW;
    END IF;

    SELECT class_id INTO target_class_id FROM class_sessions WHERE id = NEW.session_id;
    SELECT capacity INTO class_capacity FROM classes WHERE id = target_class_id FOR UPDATE;

    SELECT COUNT(*) INTO class_wide_count
    FROM class_enrollments
    WHERE class_id = target_class_id AND status = 'booked';

    SELECT COUNT(*) INTO booked_count
    FROM session_bookings
    WHERE session_id = NEW.session_id AND status = 'booked';

    IF class_wide_count + booked_count > class_capacity THEN
        RAISE EXCEPTION 'Buổi học đã đầy chỗ (vượt quá capacity cho phép).'
            USING ERRCODE = '23514', CONSTRAINT = 'trg_session_bookings_check_capacity';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_session_bookings_check_capacity ON session_bookings;
CREATE TRIGGER trg_session_bookings_check_capacity
AFTER INSERT OR UPDATE OF session_id, status ON session_bookings
FOR EACH ROW EXECUTE FUNCTION scms_check_session_booking_capacity();

DROP TRIGGER IF EXISTS trg_session_bookings_check_membership ON session_bookings;
CREATE TRIGGER trg_session_bookings_check_membership
BEFORE INSERT OR UPDATE OF member_id, status ON session_bookings
FOR EACH ROW EXECUTE FUNCTION scms_require_active_membership_for_enrollment();

CREATE UNIQUE INDEX IF NOT EXISTS uq_session_booking_active ON session_bookings (session_id, member_id) WHERE status = 'booked';

CREATE OR REPLACE FUNCTION scms_require_active_membership_for_checkin()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    business_date date := (statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
    IF (NEW.status IS NULL OR NEW.status = 'GRANTED') AND NOT EXISTS (
        SELECT 1
        FROM membership_subscriptions subscription
        WHERE subscription.member_id = NEW.member_id
          AND subscription.status = 'active'
          AND subscription.start_date <= business_date
          AND subscription.end_date >= business_date
        FOR SHARE
    ) THEN
        RAISE EXCEPTION 'Học viên không có gói thành viên còn hiệu lực để check-in.'
            USING ERRCODE = '23514', CONSTRAINT = 'trg_checkins_check_membership';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_checkins_check_membership ON center_checkins;
CREATE TRIGGER trg_checkins_check_membership
BEFORE INSERT ON center_checkins
FOR EACH ROW EXECUTE FUNCTION scms_require_active_membership_for_checkin();

-- Filtered unique indexes (cannot be expressed portably in JPA)
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON users (username) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone ON users (phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_enrollment_active ON class_enrollments (class_id, member_id) WHERE status = 'booked';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'notifications'
          AND column_name = 'message'
          AND is_nullable = 'NO'
    ) THEN
        EXECUTE format('ALTER TABLE %I.notifications ALTER COLUMN message DROP NOT NULL', current_schema());
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = 'membership_subscriptions'
    ) THEN
        EXECUTE format('ALTER TABLE %I.membership_subscriptions DROP CONSTRAINT IF EXISTS ck_subscriptions_status', current_schema());
        EXECUTE format('ALTER TABLE %I.membership_subscriptions ADD CONSTRAINT ck_subscriptions_status CHECK (status IN (''pending_payment'',''active'',''frozen'',''expired'',''cancelled''))', current_schema());
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'member_trial_redemptions'
          AND column_name = 'cccd'
          AND is_nullable = 'NO'
    ) THEN
        EXECUTE format('ALTER TABLE %I.member_trial_redemptions ALTER COLUMN cccd DROP NOT NULL', current_schema());
        EXECUTE format('ALTER TABLE %I.member_trial_redemptions DROP CONSTRAINT IF EXISTS uq_trial_cccd', current_schema());
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'member_trial_redemptions'
          AND column_name = 'subscription_id'
          AND is_nullable = 'NO'
    ) THEN
        EXECUTE format('ALTER TABLE %I.member_trial_redemptions ALTER COLUMN subscription_id DROP NOT NULL', current_schema());
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = 'member_trial_redemptions'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'member_trial_redemptions'
              AND column_name = 'document_type'
        ) THEN
            EXECUTE format('ALTER TABLE %I.member_trial_redemptions ADD COLUMN document_type VARCHAR(20) DEFAULT ''CCCD'' NOT NULL', current_schema());
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'member_trial_redemptions'
              AND column_name = 'nationality'
        ) THEN
            EXECUTE format('ALTER TABLE %I.member_trial_redemptions ADD COLUMN nationality VARCHAR(100)', current_schema());
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'member_trial_redemptions'
              AND column_name = 'front_image_url'
        ) THEN
            EXECUTE format('ALTER TABLE %I.member_trial_redemptions ADD COLUMN front_image_url TEXT', current_schema());
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'member_trial_redemptions'
              AND column_name = 'back_image_url'
        ) THEN
            EXECUTE format('ALTER TABLE %I.member_trial_redemptions ADD COLUMN back_image_url TEXT', current_schema());
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'member_trial_redemptions'
              AND column_name = 'status'
        ) THEN
            EXECUTE format('ALTER TABLE %I.member_trial_redemptions ADD COLUMN status VARCHAR(30) DEFAULT ''APPROVED'' NOT NULL', current_schema());
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'member_trial_redemptions'
              AND column_name = 'reviewed_by'
        ) THEN
            EXECUTE format('ALTER TABLE %I.member_trial_redemptions ADD COLUMN reviewed_by BIGINT', current_schema());
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'member_trial_redemptions'
              AND column_name = 'reviewed_at'
        ) THEN
            EXECUTE format('ALTER TABLE %I.member_trial_redemptions ADD COLUMN reviewed_at TIMESTAMP', current_schema());
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'member_trial_redemptions'
              AND column_name = 'rejection_reason'
        ) THEN
            EXECUTE format('ALTER TABLE %I.member_trial_redemptions ADD COLUMN rejection_reason VARCHAR(500)', current_schema());
        END IF;

        EXECUTE format('UPDATE %I.member_trial_redemptions SET document_type = ''CCCD'' WHERE document_type IS NULL', current_schema());
        EXECUTE format('UPDATE %I.member_trial_redemptions SET status = CASE WHEN subscription_id IS NOT NULL THEN ''APPROVED'' ELSE ''PENDING_APPROVAL'' END WHERE status IS NULL', current_schema());
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'members'
          AND column_name = 'identity_verified'
    ) THEN
        EXECUTE format('UPDATE %I.members SET identity_verified = FALSE WHERE identity_verified IS NULL', current_schema());
    END IF;
END;
$$;

-- SCRUM-86: Supabase Broadcast carries no payment/member/amount/status data.
-- The opaque capability is returned only to its authenticated owner by the API.
-- The send participates in the transaction, so rolled-back payments emit no event.
CREATE OR REPLACE FUNCTION scms_membership_realtime_invalidation()
RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE channel_id uuid;
BEGIN
    IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT payment_realtime_topic INTO channel_id FROM members WHERE user_id = NEW.member_id;
    IF channel_id IS NOT NULL THEN
        PERFORM realtime.send('{}'::jsonb, 'changed', 'membership:' || channel_id::text, false);
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- A notification outage must never roll back a valid payment.
    RAISE WARNING 'Membership invalidation unavailable (SQLSTATE %)', SQLSTATE;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_realtime ON payments;
CREATE TRIGGER trg_payments_realtime AFTER INSERT OR UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION scms_membership_realtime_invalidation();

-- SCRUM-106: private chat invalidation; message text never leaves the authenticated API.
CREATE OR REPLACE FUNCTION scms_chat_realtime_invalidation()
RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE member_id bigint; staff_id bigint;
BEGIN
    IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT member_user_id, staff_user_id INTO member_id, staff_id
    FROM chat_conversations WHERE id = NEW.conversation_id;
    PERFORM realtime.send('{}'::jsonb, 'changed', 'scms:chat:' || member_id::text, true);
    PERFORM realtime.send('{}'::jsonb, 'changed', 'scms:chat:' || staff_id::text, true);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Persist messages even during a Realtime outage; reconnect/focus fetches missed data.
    RAISE WARNING 'Chat invalidation unavailable (SQLSTATE %)', SQLSTATE;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_message_realtime ON chat_messages;
CREATE TRIGGER trg_chat_message_realtime AFTER INSERT ON chat_messages
FOR EACH ROW EXECUTE FUNCTION scms_chat_realtime_invalidation();

-- Only the public application installation owns these named global policies.
-- Isolated integration-test schemas must never change realtime.messages policies.
-- RLS is already enabled on Supabase's table; do not ALTER it.
DO $$
BEGIN
    IF current_schema() = 'public' AND to_regclass('realtime.messages') IS NOT NULL THEN
        DROP POLICY IF EXISTS scms_chat_receive ON realtime.messages;
        CREATE POLICY scms_chat_receive ON realtime.messages FOR SELECT TO authenticated
        USING (extension = 'broadcast'
            AND (auth.jwt() ->> 'scms_chat_scope') = 'receive'
            AND realtime.topic() = 'scms:chat:' || (auth.jwt() ->> 'scms_chat_user_id'));

        -- PostgreSQL ORs permissive policies: also constrain chat topics restrictively
        -- so an existing broad receive policy cannot expose another user's inbox.
        DROP POLICY IF EXISTS scms_chat_receive_guard ON realtime.messages;
        CREATE POLICY scms_chat_receive_guard ON realtime.messages AS RESTRICTIVE FOR SELECT TO authenticated
        USING (realtime.topic() NOT LIKE 'scms:chat:%' OR (
            extension = 'broadcast' AND (auth.jwt() ->> 'scms_chat_scope') = 'receive'
            AND realtime.topic() = 'scms:chat:' || (auth.jwt() ->> 'scms_chat_user_id')));

        DROP POLICY IF EXISTS scms_chat_send_guard ON realtime.messages;
        CREATE POLICY scms_chat_send_guard ON realtime.messages AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK (realtime.topic() NOT LIKE 'scms:chat:%');
    END IF;
END;
$$;
DROP TRIGGER IF EXISTS trg_subscriptions_realtime ON membership_subscriptions;
CREATE TRIGGER trg_subscriptions_realtime AFTER INSERT OR UPDATE ON membership_subscriptions
FOR EACH ROW EXECUTE FUNCTION scms_membership_realtime_invalidation();

-- SCRUM-128: transactional private invalidations, containing no ticket/message data.
CREATE OR REPLACE FUNCTION scms_support_realtime_invalidation()
RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE ticket_id bigint;
BEGIN
    IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN RETURN NEW; END IF;
    IF TG_TABLE_NAME = 'support_requests' THEN ticket_id := NEW.id;
    ELSE ticket_id := NEW.support_request_id; END IF;
    PERFORM realtime.send('{}'::jsonb, 'changed', 'scms:support:ticket:' || ticket_id::text, true);
    PERFORM realtime.send('{}'::jsonb, 'changed', 'scms:support:inbox', true);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Support invalidation unavailable (SQLSTATE %)', SQLSTATE;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_support_request_realtime ON support_requests;
CREATE TRIGGER trg_support_request_realtime AFTER INSERT OR UPDATE ON support_requests
FOR EACH ROW EXECUTE FUNCTION scms_support_realtime_invalidation();
DROP TRIGGER IF EXISTS trg_support_message_realtime ON support_request_messages;
CREATE TRIGGER trg_support_message_realtime AFTER INSERT ON support_request_messages
FOR EACH ROW EXECUTE FUNCTION scms_support_realtime_invalidation();

DO $$
BEGIN
    IF current_schema() = 'public' AND to_regclass('realtime.messages') IS NOT NULL THEN
        DROP POLICY IF EXISTS scms_support_receive ON realtime.messages;
        CREATE POLICY scms_support_receive ON realtime.messages FOR SELECT TO authenticated
        USING (extension = 'broadcast' AND (auth.jwt() ->> 'scms_support_scope') = 'receive'
            AND realtime.topic() = (auth.jwt() ->> 'scms_support_topic')
            AND realtime.topic() LIKE 'scms:support:%');
        DROP POLICY IF EXISTS scms_support_receive_guard ON realtime.messages;
        CREATE POLICY scms_support_receive_guard ON realtime.messages AS RESTRICTIVE FOR SELECT TO PUBLIC
        USING (realtime.topic() NOT LIKE 'scms:support:%' OR (
            extension = 'broadcast' AND (auth.jwt() ->> 'scms_support_scope') = 'receive'
            AND realtime.topic() = (auth.jwt() ->> 'scms_support_topic')));
        DROP POLICY IF EXISTS scms_support_send_guard ON realtime.messages;
        CREATE POLICY scms_support_send_guard ON realtime.messages AS RESTRICTIVE FOR INSERT TO PUBLIC
        WITH CHECK (realtime.topic() NOT LIKE 'scms:support:%');
    END IF;
END;
$$;

-- SCRUM-133: PT and group scheduling must share the same database guard.
CREATE OR REPLACE FUNCTION scms_guard_pt_schedule()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    target_coach BIGINT;
    schedule_conflict BOOLEAN := FALSE;
BEGIN
    -- ponytail: serialize schedule writes for this MVP; use ordered participant locks if contention grows.
    -- Never wait while a caller may already hold a class row lock.
    IF NOT pg_try_advisory_xact_lock(hashtext(current_schema()), 391133) THEN
        RAISE EXCEPTION 'trg_pt_schedule_busy'
            USING ERRCODE = '23514', CONSTRAINT = 'trg_pt_schedule_busy';
    END IF;
    IF TG_TABLE_NAME = 'coach_bookings' THEN
        IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
        IF NOT EXISTS (
            SELECT 1 FROM membership_subscriptions m
            WHERE m.member_id = NEW.member_id AND m.status = 'active'
              AND m.start_date <= (statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
              AND m.end_date >= (statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
              AND m.start_date <= NEW.booking_date AND m.end_date >= NEW.booking_date
        ) THEN
            RAISE EXCEPTION 'trg_enrollments_check_membership'
                USING ERRCODE = '23514', CONSTRAINT = 'trg_enrollments_check_membership';
        END IF;
        SELECT EXISTS (
            SELECT 1 FROM coach_bookings b
            WHERE b.id IS DISTINCT FROM NEW.id AND b.status = 'confirmed'
              AND b.booking_date = NEW.booking_date
              AND b.start_time < NEW.end_time AND b.end_time > NEW.start_time
              AND (b.coach_id = NEW.coach_id OR b.member_id = NEW.member_id)
        ) OR EXISTS (
            SELECT 1 FROM class_sessions s JOIN classes c ON c.id = s.class_id
            WHERE s.status = 'scheduled' AND s.session_date = NEW.booking_date
              AND s.start_time < NEW.end_time AND s.end_time > NEW.start_time
              AND (c.coach_id = NEW.coach_id OR EXISTS (
                  SELECT 1 FROM class_enrollments e WHERE e.class_id = c.id
                    AND e.member_id = NEW.member_id AND e.status = 'booked')
                  OR EXISTS (
                  SELECT 1 FROM session_bookings sb WHERE sb.session_id = s.id
                    AND sb.member_id = NEW.member_id AND sb.status = 'booked'))
        ) INTO schedule_conflict;
    ELSIF TG_TABLE_NAME = 'class_enrollments' THEN
        IF NEW.status <> 'booked' THEN RETURN NEW; END IF;
        SELECT EXISTS (
            SELECT 1 FROM class_sessions s JOIN coach_bookings b ON b.booking_date = s.session_date
            WHERE s.class_id = NEW.class_id AND s.status = 'scheduled'
              AND b.member_id = NEW.member_id AND b.status = 'confirmed'
              AND b.start_time < s.end_time AND b.end_time > s.start_time
        ) INTO schedule_conflict;
    ELSIF TG_TABLE_NAME = 'session_bookings' THEN
        IF NEW.status <> 'booked' THEN RETURN NEW; END IF;
        SELECT EXISTS (
            SELECT 1 FROM class_sessions s JOIN coach_bookings b ON b.booking_date = s.session_date
            WHERE s.id = NEW.session_id AND s.status = 'scheduled'
              AND b.member_id = NEW.member_id AND b.status = 'confirmed'
              AND b.start_time < s.end_time AND b.end_time > s.start_time
        ) INTO schedule_conflict;
    ELSIF TG_TABLE_NAME = 'class_sessions' THEN
        IF NEW.status <> 'scheduled' THEN RETURN NEW; END IF;
        SELECT coach_id INTO target_coach FROM classes WHERE id = NEW.class_id;
        SELECT EXISTS (
            SELECT 1 FROM coach_bookings b
            WHERE b.status = 'confirmed' AND b.booking_date = NEW.session_date
              AND b.start_time < NEW.end_time AND b.end_time > NEW.start_time
              AND (b.coach_id = target_coach OR EXISTS (
                  SELECT 1 FROM class_enrollments e WHERE e.class_id = NEW.class_id
                    AND e.member_id = b.member_id AND e.status = 'booked')
                  OR EXISTS (
                  SELECT 1 FROM session_bookings sb WHERE sb.session_id = NEW.id
                    AND sb.member_id = b.member_id AND sb.status = 'booked'))
        ) INTO schedule_conflict;
    ELSIF TG_TABLE_NAME = 'classes' THEN
        SELECT EXISTS (
            SELECT 1 FROM class_sessions s JOIN coach_bookings b ON b.booking_date = s.session_date
            WHERE s.class_id = NEW.id AND s.status = 'scheduled' AND b.status = 'confirmed'
              AND b.coach_id = NEW.coach_id
              AND b.start_time < s.end_time AND b.end_time > s.start_time
        ) INTO schedule_conflict;
    END IF;
    IF schedule_conflict THEN
        RAISE EXCEPTION 'trg_sessions_check_conflict'
            USING ERRCODE = '23514', CONSTRAINT = 'trg_sessions_check_conflict';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pt_schedule_booking ON coach_bookings;
CREATE TRIGGER trg_pt_schedule_booking BEFORE INSERT OR UPDATE ON coach_bookings
FOR EACH ROW EXECUTE FUNCTION scms_guard_pt_schedule();
DROP TRIGGER IF EXISTS trg_pt_schedule_enrollment ON class_enrollments;
CREATE TRIGGER trg_pt_schedule_enrollment BEFORE INSERT OR UPDATE ON class_enrollments
FOR EACH ROW EXECUTE FUNCTION scms_guard_pt_schedule();
DROP TRIGGER IF EXISTS trg_pt_schedule_session_booking ON session_bookings;
CREATE TRIGGER trg_pt_schedule_session_booking BEFORE INSERT OR UPDATE ON session_bookings
FOR EACH ROW EXECUTE FUNCTION scms_guard_pt_schedule();
DROP TRIGGER IF EXISTS trg_pt_schedule_session ON class_sessions;
CREATE TRIGGER trg_pt_schedule_session BEFORE INSERT OR UPDATE ON class_sessions
FOR EACH ROW EXECUTE FUNCTION scms_guard_pt_schedule();
DROP TRIGGER IF EXISTS trg_pt_schedule_class ON classes;
CREATE TRIGGER trg_pt_schedule_class BEFORE UPDATE OF coach_id ON classes
FOR EACH ROW EXECUTE FUNCTION scms_guard_pt_schedule();

-- Một hội viên không được học hai buổi lớp trùng giờ, dù giữ chỗ từng buổi (session_bookings) hay đăng ký cả lớp
-- (class_enrollments). Chặn cả khi Quản lý thêm/đổi giờ một buổi mà hội viên đã đặt làm buổi đó chồng lên lớp khác.
-- Chỉ xét buổi chưa qua để dữ liệu cũ không chặn các thao tác mới.
CREATE OR REPLACE FUNCTION scms_member_session_overlaps(p_member BIGINT, p_session BIGINT, p_today DATE)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM class_sessions target
        JOIN class_sessions other
          ON other.session_date = target.session_date
         AND other.id <> target.id
         AND other.class_id <> target.class_id
         AND other.status = 'scheduled'
         AND other.start_time < target.end_time
         AND other.end_time > target.start_time
        WHERE target.id = p_session
          AND target.status = 'scheduled'
          AND target.session_date >= p_today
          AND (EXISTS (SELECT 1 FROM session_bookings b
                       WHERE b.session_id = other.id AND b.member_id = p_member AND b.status = 'booked')
               OR EXISTS (SELECT 1 FROM class_enrollments e
                          WHERE e.class_id = other.class_id AND e.member_id = p_member AND e.status = 'booked'))
    );
$$;

CREATE OR REPLACE FUNCTION scms_guard_member_class_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    today DATE := (statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
    has_conflict BOOLEAN := FALSE;
BEGIN
    IF TG_TABLE_NAME = 'session_bookings' THEN
        IF NEW.status <> 'booked' THEN RETURN NEW; END IF;
        IF TG_OP = 'UPDATE' AND OLD.status = 'booked' AND OLD.session_id = NEW.session_id
           AND OLD.member_id = NEW.member_id THEN
            RETURN NEW;
        END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended('member-schedule:' || NEW.member_id::TEXT, 0));
        has_conflict := scms_member_session_overlaps(NEW.member_id, NEW.session_id, today);
    ELSIF TG_TABLE_NAME = 'class_enrollments' THEN
        IF NEW.status <> 'booked' THEN RETURN NEW; END IF;
        IF TG_OP = 'UPDATE' AND OLD.status = 'booked' AND OLD.class_id = NEW.class_id
           AND OLD.member_id = NEW.member_id THEN
            RETURN NEW;
        END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended('member-schedule:' || NEW.member_id::TEXT, 0));
        SELECT EXISTS (
            SELECT 1 FROM class_sessions s
            WHERE s.class_id = NEW.class_id AND s.status = 'scheduled' AND s.session_date >= today
              AND scms_member_session_overlaps(NEW.member_id, s.id, today)
        ) INTO has_conflict;
    ELSIF TG_TABLE_NAME = 'class_sessions' THEN
        IF NEW.status <> 'scheduled' OR NEW.session_date < today THEN RETURN NEW; END IF;
        IF TG_OP = 'UPDATE' AND OLD.status = NEW.status AND OLD.class_id = NEW.class_id
           AND OLD.session_date = NEW.session_date AND OLD.start_time = NEW.start_time
           AND OLD.end_time = NEW.end_time THEN
            RETURN NEW;
        END IF;
        SELECT EXISTS (
            SELECT 1
            FROM (
                SELECT b.member_id FROM session_bookings b WHERE b.session_id = NEW.id AND b.status = 'booked'
                UNION
                SELECT e.member_id FROM class_enrollments e WHERE e.class_id = NEW.class_id AND e.status = 'booked'
            ) attendees
            WHERE scms_member_session_overlaps(attendees.member_id, NEW.id, today)
        ) INTO has_conflict;
    END IF;

    IF has_conflict THEN
        RAISE EXCEPTION 'trg_member_schedule_conflict'
            USING ERRCODE = '23P01', CONSTRAINT = 'trg_member_schedule_conflict';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_overlap_session_booking ON session_bookings;
CREATE TRIGGER trg_member_overlap_session_booking
AFTER INSERT OR UPDATE OF session_id, member_id, status ON session_bookings
FOR EACH ROW EXECUTE FUNCTION scms_guard_member_class_overlap();
DROP TRIGGER IF EXISTS trg_member_overlap_enrollment ON class_enrollments;
CREATE TRIGGER trg_member_overlap_enrollment
AFTER INSERT OR UPDATE OF class_id, member_id, status ON class_enrollments
FOR EACH ROW EXECUTE FUNCTION scms_guard_member_class_overlap();
DROP TRIGGER IF EXISTS trg_member_overlap_session ON class_sessions;
CREATE TRIGGER trg_member_overlap_session
AFTER INSERT OR UPDATE OF class_id, session_date, start_time, end_time, status ON class_sessions
FOR EACH ROW EXECUTE FUNCTION scms_guard_member_class_overlap();
