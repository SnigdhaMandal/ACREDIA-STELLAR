-- Seed data for local development

-- 1. Create a dummy institution user in auth.users (if using Supabase Auth locally)
-- Note: Supabase local auth can be complex to mock purely in SQL without pgjwt, 
-- but we can insert the public profile records for testing reads.

INSERT INTO public.profiles (id, email, full_name, avatar_url)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'admin@acredia.io', 'Acredia Admin', NULL),
    ('00000000-0000-0000-0000-000000000002', 'tech@university.edu', 'Tech University', NULL),
    ('00000000-0000-0000-0000-000000000003', 'student@example.com', 'Alice Student', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.institutions (id, auth_user_id, name, wallet_address, verified, status, settings)
VALUES
    ('inst_001', '00000000-0000-0000-0000-000000000002', 'Tech University', 'GBLX6X...DUMMY', true, 'verified', '{"theme": "dark"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.students (id, auth_user_id, wallet_address, email)
VALUES
    ('stu_001', '00000000-0000-0000-0000-000000000003', 'GDQW2...DUMMY', 'student@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.credentials (
    token_id, 
    student_id, 
    student_wallet_address, 
    institution_id, 
    issuer_wallet_address, 
    ipfs_hash, 
    blockchain_hash, 
    metadata, 
    revoked
) VALUES (
    '1',
    'stu_001',
    'GDQW2...DUMMY',
    'inst_001',
    'GBLX6X...DUMMY',
    'QmDummyHash12345',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    '{"degree": "Bachelor of Science", "major": "Computer Science"}',
    false
) ON CONFLICT (token_id) DO NOTHING;

INSERT INTO public.api_keys (
    id,
    institution_id,
    name,
    key_prefix,
    key_hash,
    revoked
) VALUES (
    'key_001',
    'inst_001',
    'Demo API Key',
    'sk_acredia_demo...',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', -- dummy hash
    false
) ON CONFLICT (id) DO NOTHING;

-- Seed indexer state
INSERT INTO public.indexer_state (id, last_ledger)
VALUES ('main', 0)
ON CONFLICT (id) DO NOTHING;
