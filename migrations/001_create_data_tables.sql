-- ═══════════════════════════════════════════
-- CRM Data Tables — Alle Tabellen für das Frontend
-- Ausführen im Supabase SQL Editor
-- ═══════════════════════════════════════════

-- 1. MEMBERS — Haupttabelle
CREATE TABLE IF NOT EXISTS public.members (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL,
    skool_username text,
    bio text,
    city text,
    country text,
    membership_type text DEFAULT 'free',
    membership_status text DEFAULT 'active',
    activity_status text DEFAULT 'active',
    progress_level text DEFAULT 'beginner',
    funnel_stage text,
    assigned_to bigint REFERENCES public.crm_users(id) ON DELETE SET NULL,
    join_date timestamptz DEFAULT now(),
    renewal_date timestamptz,
    last_active timestamptz DEFAULT now(),
    join_source text,
    notes text,
    is_premium boolean DEFAULT false,
    is_admin boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_members_activity ON public.members(activity_status);
CREATE INDEX IF NOT EXISTS idx_members_funnel ON public.members(funnel_stage);
CREATE INDEX IF NOT EXISTS idx_members_assigned ON public.members(assigned_to);
CREATE INDEX IF NOT EXISTS idx_members_name ON public.members(name);

-- 2. POSTS — Beiträge der Mitglieder
CREATE TABLE IF NOT EXISTS public.posts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id bigint NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    post_title text,
    post_content text,
    post_url text,
    posted_at timestamptz DEFAULT now(),
    likes integer DEFAULT 0,
    comments integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_member ON public.posts(member_id);

-- 3. TIMELINE_ENTRIES — Verlauf/Aktivitäten
CREATE TABLE IF NOT EXISTS public.timeline_entries (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id bigint NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    user_id bigint REFERENCES public.crm_users(id) ON DELETE SET NULL,
    user_name text,
    entry_type text NOT NULL DEFAULT 'note',
    content text,
    channel text,
    audio_url text,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_member ON public.timeline_entries(member_id);
CREATE INDEX IF NOT EXISTS idx_timeline_created ON public.timeline_entries(created_at DESC);

-- 4. TEAM_MESSAGES — Nachrichten zwischen Mitarbeitern
CREATE TABLE IF NOT EXISTS public.team_messages (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    from_user_id bigint NOT NULL REFERENCES public.crm_users(id) ON DELETE CASCADE,
    to_user_id bigint NOT NULL REFERENCES public.crm_users(id) ON DELETE CASCADE,
    content text NOT NULL,
    member_id bigint REFERENCES public.members(id) ON DELETE SET NULL,
    is_read boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_to ON public.team_messages(to_user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_messages_from ON public.team_messages(from_user_id);

-- 5. MEMBER_LABELS — Labels/Tags für Mitglieder
CREATE TABLE IF NOT EXISTS public.member_labels (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id bigint NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    label text NOT NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE(member_id, label)
);

CREATE INDEX IF NOT EXISTS idx_labels_member ON public.member_labels(member_id);

-- ═══════════════════════════════════════════
-- RLS Policies — Alle auth. Benutzer dürfen alles
-- ═══════════════════════════════════════════

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeline_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_all" ON public.members FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "posts_all" ON public.posts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "timeline_all" ON public.timeline_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "messages_all" ON public.team_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "labels_all" ON public.member_labels FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Updated_at Trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS members_updated_at ON public.members;
CREATE TRIGGER members_updated_at
    BEFORE UPDATE ON public.members
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
