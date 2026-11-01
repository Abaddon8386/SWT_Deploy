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

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sessions_check_conflict ON class_sessions;
CREATE TRIGGER trg_sessions_check_conflict
AFTER INSERT OR UPDATE OF class_id, session_date, start_time, end_time, status ON class_sessions
FOR EACH ROW EXECUTE FUNCTION scms_check_session_conflict();

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

CREATE OR REPLACE FUNCTION scms_require_active_membership_for_checkin()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF (NEW.status IS NULL OR NEW.status = 'GRANTED') AND NOT EXISTS (
        SELECT 1
        FROM membership_subscriptions subscription
        WHERE subscription.member_id = NEW.member_id
          AND subscription.status = 'active'
          AND subscription.start_date <= CURRENT_DATE
          AND subscription.end_date >= CURRENT_DATE
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
CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_active ON class_waitlists (class_id, member_id) WHERE status = 'waiting';

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
