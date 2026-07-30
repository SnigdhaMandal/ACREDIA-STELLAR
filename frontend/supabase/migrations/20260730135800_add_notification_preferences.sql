-- Add notification preferences to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"email_issued": true, "email_revoked": true, "email_verified": true}'::jsonb;

-- Comment for the new column
COMMENT ON COLUMN public.profiles.notification_preferences IS 'Stores user preferences for transactional emails';
