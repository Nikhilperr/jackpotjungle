--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'user',
    'admin',
    'super_admin'
);


--
-- Name: call_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.call_status AS ENUM (
    'ringing',
    'active',
    'ended',
    'missed',
    'declined',
    'canceled'
);


--
-- Name: call_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.call_type AS ENUM (
    'voice',
    'video'
);


--
-- Name: accept_friend_request(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_friend_request() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE a UUID; b UUID;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status <> 'accepted' THEN
    IF NEW.sender_id < NEW.receiver_id THEN a := NEW.sender_id; b := NEW.receiver_id;
    ELSE a := NEW.receiver_id; b := NEW.sender_id; END IF;
    INSERT INTO public.friendships (user_a, user_b) VALUES (a, b) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: adjust_credits(uuid, numeric, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.adjust_credits(_user_id uuid, _amount numeric, _type text, _note text) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE new_bal NUMERIC;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.user_credits(user_id, balance) VALUES (_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.user_credits SET balance = balance + _amount, updated_at = now()
    WHERE user_id = _user_id RETURNING balance INTO new_bal;
  INSERT INTO public.credit_transactions(user_id, admin_id, amount, type, note)
    VALUES (_user_id, auth.uid(), _amount, _type, _note);
  RETURN new_bal;
END $$;


--
-- Name: bump_page_conv(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_page_conv() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.page_conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;


--
-- Name: friend_requests_lock_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.friend_requests_lock_identity() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.sender_id <> OLD.sender_id OR NEW.receiver_id <> OLD.receiver_id THEN
    RAISE EXCEPTION 'sender_id and receiver_id are immutable';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: gen_code(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gen_code(prefix text) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE c TEXT;
BEGIN
  c := prefix || '-' || lpad((floor(random()*900000)+100000)::int::text, 6, '0');
  RETURN c;
END $$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uname TEXT;
BEGIN
  uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1));
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = uname) THEN
    uname := uname || '_' || substr(NEW.id::text,1,4);
  END IF;
  INSERT INTO public.profiles (id, username, email, friend_code, referral_code)
  VALUES (NEW.id, uname, NEW.email, public.gen_code('JJM'), public.gen_code('JJREF'));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  INSERT INTO public.page_conversations (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;


--
-- Name: touch_calls_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_calls_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action text NOT NULL,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: auto_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auto_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid NOT NULL,
    minutes integer DEFAULT 15 NOT NULL,
    message text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: broadcasts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.broadcasts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid NOT NULL,
    content text NOT NULL,
    target_type text NOT NULL,
    target_tag_id uuid,
    target_user_ids uuid[],
    sent_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    caller_id uuid NOT NULL,
    callee_id uuid,
    call_type public.call_type DEFAULT 'voice'::public.call_type NOT NULL,
    status public.call_status DEFAULT 'ringing'::public.call_status NOT NULL,
    context text DEFAULT 'friend'::text NOT NULL,
    page_conversation_id uuid,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    answered_at timestamp with time zone,
    ended_at timestamp with time zone,
    duration_seconds integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.calls REPLICA IDENTITY FULL;


--
-- Name: credit_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    admin_id uuid,
    amount numeric NOT NULL,
    type text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: followups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.followups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    admin_id uuid NOT NULL,
    days_after integer NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    message text NOT NULL,
    sent boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: friend_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friend_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid NOT NULL,
    receiver_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT friend_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text])))
);

ALTER TABLE ONLY public.friend_requests REPLICA IDENTITY FULL;


--
-- Name: friendships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friendships (
    user_a uuid NOT NULL,
    user_b uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT friendships_check CHECK ((user_a < user_b))
);


--
-- Name: login_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    user_agent text,
    success boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid NOT NULL,
    receiver_id uuid NOT NULL,
    content text,
    seen boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    image_url text,
    audio_url text,
    delivered boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.messages REPLICA IDENTITY FULL;


--
-- Name: page_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.page_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_spam boolean DEFAULT false NOT NULL
);


--
-- Name: page_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.page_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    from_page boolean DEFAULT false NOT NULL,
    content text,
    seen boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    image_url text,
    audio_url text
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    admin_id uuid,
    amount_due numeric DEFAULT 0 NOT NULL,
    amount_paid numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    username text NOT NULL,
    email text,
    friend_code text NOT NULL,
    referral_code text NOT NULL,
    avatar_url text,
    online boolean DEFAULT false NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notif_enabled boolean DEFAULT true NOT NULL,
    is_blocked boolean DEFAULT false NOT NULL,
    referred_by uuid
);


--
-- Name: push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    platform text DEFAULT 'android'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: quick_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quick_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    shared boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referrer_id uuid NOT NULL,
    referred_id uuid NOT NULL,
    bonus_amount numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: spam_list; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spam_list (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    spammed_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#6366f1'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_credits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_credits (
    user_id uuid NOT NULL,
    balance numeric DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    admin_id uuid NOT NULL,
    note text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_tags (
    user_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: auto_responses auto_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_responses
    ADD CONSTRAINT auto_responses_pkey PRIMARY KEY (id);


--
-- Name: broadcasts broadcasts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT broadcasts_pkey PRIMARY KEY (id);


--
-- Name: calls calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_pkey PRIMARY KEY (id);


--
-- Name: credit_transactions credit_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_pkey PRIMARY KEY (id);


--
-- Name: followups followups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followups
    ADD CONSTRAINT followups_pkey PRIMARY KEY (id);


--
-- Name: friend_requests friend_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_pkey PRIMARY KEY (id);


--
-- Name: friend_requests friend_requests_sender_id_receiver_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_sender_id_receiver_id_key UNIQUE (sender_id, receiver_id);


--
-- Name: friendships friendships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_pkey PRIMARY KEY (user_a, user_b);


--
-- Name: login_logs login_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_logs
    ADD CONSTRAINT login_logs_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: page_conversations page_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_conversations
    ADD CONSTRAINT page_conversations_pkey PRIMARY KEY (id);


--
-- Name: page_conversations page_conversations_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_conversations
    ADD CONSTRAINT page_conversations_user_id_key UNIQUE (user_id);


--
-- Name: page_messages page_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_messages
    ADD CONSTRAINT page_messages_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_friend_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_friend_code_key UNIQUE (friend_code);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_referral_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_referral_code_key UNIQUE (referral_code);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: push_tokens push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_pkey PRIMARY KEY (id);


--
-- Name: push_tokens push_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_token_key UNIQUE (token);


--
-- Name: quick_replies quick_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quick_replies
    ADD CONSTRAINT quick_replies_pkey PRIMARY KEY (id);


--
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);


--
-- Name: referrals referrals_referred_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referred_id_key UNIQUE (referred_id);


--
-- Name: spam_list spam_list_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spam_list
    ADD CONSTRAINT spam_list_pkey PRIMARY KEY (id);


--
-- Name: spam_list spam_list_user_id_spammed_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spam_list
    ADD CONSTRAINT spam_list_user_id_spammed_user_id_key UNIQUE (user_id, spammed_user_id);


--
-- Name: tags tags_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_name_key UNIQUE (name);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: user_credits user_credits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_credits
    ADD CONSTRAINT user_credits_pkey PRIMARY KEY (user_id);


--
-- Name: user_notes user_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notes
    ADD CONSTRAINT user_notes_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: user_tags user_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tags
    ADD CONSTRAINT user_tags_pkey PRIMARY KEY (user_id, tag_id);


--
-- Name: calls_callee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calls_callee_idx ON public.calls USING btree (callee_id, created_at DESC);


--
-- Name: calls_caller_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calls_caller_idx ON public.calls USING btree (caller_id, created_at DESC);


--
-- Name: calls_page_conv_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calls_page_conv_idx ON public.calls USING btree (page_conversation_id, created_at DESC);


--
-- Name: messages_pair_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_pair_idx ON public.messages USING btree (sender_id, receiver_id, created_at DESC);


--
-- Name: messages_receiver_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_receiver_idx ON public.messages USING btree (receiver_id, created_at DESC);


--
-- Name: page_conversations_is_spam_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX page_conversations_is_spam_idx ON public.page_conversations USING btree (is_spam);


--
-- Name: push_tokens_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX push_tokens_user_idx ON public.push_tokens USING btree (user_id);


--
-- Name: spam_list_spammed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX spam_list_spammed_idx ON public.spam_list USING btree (spammed_user_id);


--
-- Name: spam_list_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX spam_list_user_idx ON public.spam_list USING btree (user_id);


--
-- Name: calls calls_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER calls_updated_at BEFORE UPDATE ON public.calls FOR EACH ROW EXECUTE FUNCTION public.touch_calls_updated_at();


--
-- Name: friend_requests friend_requests_lock_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER friend_requests_lock_identity BEFORE UPDATE ON public.friend_requests FOR EACH ROW EXECUTE FUNCTION public.friend_requests_lock_identity();


--
-- Name: friend_requests on_friend_request_accept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_friend_request_accept AFTER UPDATE ON public.friend_requests FOR EACH ROW EXECUTE FUNCTION public.accept_friend_request();


--
-- Name: page_messages trg_bump_page_conv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_page_conv AFTER INSERT ON public.page_messages FOR EACH ROW EXECUTE FUNCTION public.bump_page_conv();


--
-- Name: activity_logs activity_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: auto_responses auto_responses_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_responses
    ADD CONSTRAINT auto_responses_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: broadcasts broadcasts_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT broadcasts_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: broadcasts broadcasts_target_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT broadcasts_target_tag_id_fkey FOREIGN KEY (target_tag_id) REFERENCES public.tags(id) ON DELETE SET NULL;


--
-- Name: calls calls_callee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_callee_id_fkey FOREIGN KEY (callee_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: calls calls_caller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_caller_id_fkey FOREIGN KEY (caller_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: calls calls_page_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_page_conversation_id_fkey FOREIGN KEY (page_conversation_id) REFERENCES public.page_conversations(id) ON DELETE SET NULL;


--
-- Name: credit_transactions credit_transactions_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: credit_transactions credit_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: followups followups_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followups
    ADD CONSTRAINT followups_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: followups followups_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followups
    ADD CONSTRAINT followups_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: friend_requests friend_requests_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: friend_requests friend_requests_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_user_a_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user_a_fkey FOREIGN KEY (user_a) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_user_b_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user_b_fkey FOREIGN KEY (user_b) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: login_logs login_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_logs
    ADD CONSTRAINT login_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: messages messages_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: page_conversations page_conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_conversations
    ADD CONSTRAINT page_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: page_messages page_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_messages
    ADD CONSTRAINT page_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.page_conversations(id) ON DELETE CASCADE;


--
-- Name: payments payments_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: payments payments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_referred_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: push_tokens push_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: quick_replies quick_replies_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quick_replies
    ADD CONSTRAINT quick_replies_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: referrals referrals_referred_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referred_id_fkey FOREIGN KEY (referred_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: referrals referrals_referrer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_credits user_credits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_credits
    ADD CONSTRAINT user_credits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_notes user_notes_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notes
    ADD CONSTRAINT user_notes_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_notes user_notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notes
    ADD CONSTRAINT user_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_tags user_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tags
    ADD CONSTRAINT user_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: user_tags user_tags_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tags
    ADD CONSTRAINT user_tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: page_conversations Admins can update page conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update page conversations" ON public.page_conversations FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: calls Caller can create call; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caller can create call" ON public.calls FOR INSERT TO authenticated WITH CHECK ((auth.uid() = caller_id));


--
-- Name: spam_list Spammed user can see entries about themselves; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Spammed user can see entries about themselves" ON public.spam_list FOR SELECT USING ((auth.uid() = spammed_user_id));


--
-- Name: calls Update calls (participant or admin claim); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Update calls (participant or admin claim)" ON public.calls FOR UPDATE USING (((auth.uid() = caller_id) OR (auth.uid() = callee_id) OR ((context = 'page_broadcast'::text) AND (callee_id IS NULL) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))))) WITH CHECK (((auth.uid() = caller_id) OR (auth.uid() = callee_id) OR ((context = 'page_broadcast'::text) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))));


--
-- Name: spam_list Users manage own spam entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own spam entries" ON public.spam_list USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: calls View calls (participant or admin broadcast); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View calls (participant or admin broadcast)" ON public.calls FOR SELECT USING (((auth.uid() = caller_id) OR (auth.uid() = callee_id) OR ((context = 'page_broadcast'::text) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))));


--
-- Name: activity_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: page_messages admin replies as page; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin replies as page" ON public.page_messages FOR INSERT TO authenticated WITH CHECK (((sender_id = auth.uid()) AND (from_page = true) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


--
-- Name: quick_replies admins delete own quick replies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins delete own quick replies" ON public.quick_replies FOR DELETE TO authenticated USING (((admin_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: auto_responses admins manage auto_responses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage auto_responses" ON public.auto_responses TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: broadcasts admins manage broadcasts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage broadcasts" ON public.broadcasts TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: followups admins manage followups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage followups" ON public.followups TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: user_notes admins manage notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage notes" ON public.user_notes TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: tags admins manage tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage tags" ON public.tags TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: user_tags admins manage user_tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage user_tags" ON public.user_tags TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: activity_logs admins read activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read activity" ON public.activity_logs FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: login_logs admins read login_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read login_logs" ON public.login_logs FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: quick_replies admins read quick replies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read quick replies" ON public.quick_replies FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: page_messages admins unsend page msgs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins unsend page msgs" ON public.page_messages FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: quick_replies admins update own quick replies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins update own quick replies" ON public.quick_replies FOR UPDATE TO authenticated USING (((admin_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: credit_transactions admins write credit tx; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins write credit tx" ON public.credit_transactions TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: user_credits admins write credits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins write credits" ON public.user_credits TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: quick_replies admins write own quick replies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins write own quick replies" ON public.quick_replies FOR INSERT TO authenticated WITH CHECK (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)) AND (admin_id = auth.uid())));


--
-- Name: payments admins write payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins write payments" ON public.payments TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: referrals admins write referrals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins write referrals" ON public.referrals TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: activity_logs auth insert activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth insert activity" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: login_logs auth insert login_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth insert login_logs" ON public.login_logs FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: auto_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auto_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: broadcasts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

--
-- Name: calls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

--
-- Name: friend_requests cancel own request; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cancel own request" ON public.friend_requests FOR DELETE TO authenticated USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));


--
-- Name: credit_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: followups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.followups ENABLE ROW LEVEL SECURITY;

--
-- Name: friend_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: friendships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

--
-- Name: login_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: messages mark seen as receiver; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mark seen as receiver" ON public.messages FOR UPDATE TO authenticated USING ((auth.uid() = receiver_id)) WITH CHECK ((auth.uid() = receiver_id));


--
-- Name: page_messages mark seen page; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mark seen page" ON public.page_messages FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.page_conversations c
  WHERE ((c.id = page_messages.conversation_id) AND (c.user_id = auth.uid())))) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.page_conversations c
  WHERE ((c.id = page_messages.conversation_id) AND (c.user_id = auth.uid())))) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: push_tokens own tokens delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own tokens delete" ON public.push_tokens FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: push_tokens own tokens insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own tokens insert" ON public.push_tokens FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: push_tokens own tokens select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own tokens select" ON public.push_tokens FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: push_tokens own tokens update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own tokens update" ON public.push_tokens FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: page_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.page_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: page_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.page_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles readable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);


--
-- Name: push_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: quick_replies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

--
-- Name: referrals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

--
-- Name: friendships remove own friendships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "remove own friendships" ON public.friendships FOR DELETE TO authenticated USING (((auth.uid() = user_a) OR (auth.uid() = user_b)));


--
-- Name: friend_requests respond to requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "respond to requests" ON public.friend_requests FOR UPDATE TO authenticated USING ((auth.uid() = receiver_id)) WITH CHECK ((auth.uid() = receiver_id));


--
-- Name: messages send messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "send messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (((auth.uid() = sender_id) AND (NOT (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_blocked = true)))))));


--
-- Name: friend_requests send requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "send requests" ON public.friend_requests FOR INSERT TO authenticated WITH CHECK ((auth.uid() = sender_id));


--
-- Name: spam_list; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.spam_list ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles super admin manages roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin manages roles" ON public.user_roles TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: credit_transactions user reads own credit tx; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user reads own credit tx" ON public.credit_transactions FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: user_credits user reads own credits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user reads own credits" ON public.user_credits FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: payments user reads own payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user reads own payments" ON public.payments FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: referrals user reads own referrals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user reads own referrals" ON public.referrals FOR SELECT TO authenticated USING (((referrer_id = auth.uid()) OR (referred_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: page_messages user sends to page; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user sends to page" ON public.page_messages FOR INSERT TO authenticated WITH CHECK (((sender_id = auth.uid()) AND (from_page = false) AND (EXISTS ( SELECT 1
   FROM public.page_conversations c
  WHERE ((c.id = page_messages.conversation_id) AND (c.user_id = auth.uid())))) AND (NOT (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_blocked = true)))))));


--
-- Name: user_credits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

--
-- Name: user_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles users update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: friendships view own friendships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view own friendships" ON public.friendships FOR SELECT TO authenticated USING (((auth.uid() = user_a) OR (auth.uid() = user_b)));


--
-- Name: messages view own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view own messages" ON public.messages FOR SELECT TO authenticated USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));


--
-- Name: page_conversations view own or admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view own or admin" ON public.page_conversations FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: friend_requests view own requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view own requests" ON public.friend_requests FOR SELECT TO authenticated USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));


--
-- Name: user_roles view own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view own roles" ON public.user_roles FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: page_messages view page msgs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view page msgs" ON public.page_messages FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.page_conversations c
  WHERE ((c.id = page_messages.conversation_id) AND (c.user_id = auth.uid())))) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- PostgreSQL database dump complete
--


