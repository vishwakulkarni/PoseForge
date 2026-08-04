-- Curated starter pose references, sourced from Pexels (Pexels License —
-- free for any use, no attribution required). Hotlinked via source_url,
-- the same pattern used for the Gallery showcase photos — see CREDITS.md.
-- These illustrate pose *types* for the picker; exact photo content wasn't
-- hand-verified beyond confirming each ID resolves to a real Pexels photo,
-- so titles/tags describe the pose category rather than claiming specific
-- scene detail. tag_status is 'tagged' because these are pre-curated by a
-- human, not run through the AI auto-tagger.
INSERT INTO pose_references (title, category, tags, tag_status, source_url, is_custom) VALUES
  ('Standing, front-facing', 'standing', ARRAY['standing','portrait','front-facing'], 'tagged', 'https://images.pexels.com/photos/16277445/pexels-photo-16277445.jpeg?auto=compress&cs=tinysrgb&w=600&h=750&fit=crop', false),
  ('Standing, casual portrait', 'standing', ARRAY['standing','portrait','casual'], 'tagged', 'https://images.pexels.com/photos/37218533/pexels-photo-37218533.jpeg?auto=compress&cs=tinysrgb&w=600&h=750&fit=crop', false),
  ('Standing, three-quarter angle', 'standing', ARRAY['standing','three-quarter','studio'], 'tagged', 'https://images.pexels.com/photos/14666379/pexels-photo-14666379.jpeg?auto=compress&cs=tinysrgb&w=600&h=750&fit=crop', false),
  ('Seated, relaxed', 'sitting', ARRAY['sitting','relaxed','candid'], 'tagged', 'https://images.pexels.com/photos/8188775/pexels-photo-8188775.jpeg?auto=compress&cs=tinysrgb&w=600&h=750&fit=crop', false),
  ('Seated on steps', 'sitting', ARRAY['sitting','outdoor','candid'], 'tagged', 'https://images.pexels.com/photos/34134058/pexels-photo-34134058.jpeg?auto=compress&cs=tinysrgb&w=600&h=750&fit=crop', false),
  ('Walking, mid-stride', 'action', ARRAY['action','walking','candid'], 'tagged', 'https://images.pexels.com/photos/5861289/pexels-photo-5861289.jpeg?auto=compress&cs=tinysrgb&w=600&h=750&fit=crop', false),
  ('Jumping, playful', 'action', ARRAY['action','jumping','playful'], 'tagged', 'https://images.pexels.com/photos/32163232/pexels-photo-32163232.jpeg?auto=compress&cs=tinysrgb&w=600&h=750&fit=crop', false),
  ('Laughing, candid close-up', 'portrait', ARRAY['portrait','candid','close-up'], 'tagged', 'https://images.pexels.com/photos/15813831/pexels-photo-15813831.jpeg?auto=compress&cs=tinysrgb&w=600&h=750&fit=crop', false),
  ('Over-the-shoulder look', 'portrait', ARRAY['portrait','over-the-shoulder'], 'tagged', 'https://images.pexels.com/photos/10339049/pexels-photo-10339049.jpeg?auto=compress&cs=tinysrgb&w=600&h=750&fit=crop', false),
  ('Leaning against a wall', 'standing', ARRAY['standing','leaning','urban'], 'tagged', 'https://images.pexels.com/photos/6668809/pexels-photo-6668809.jpeg?auto=compress&cs=tinysrgb&w=600&h=750&fit=crop', false),
  ('Arms crossed, confident', 'standing', ARRAY['standing','confident','studio'], 'tagged', 'https://images.pexels.com/photos/7276013/pexels-photo-7276013.jpeg?auto=compress&cs=tinysrgb&w=600&h=750&fit=crop', false),
  ('Crouching, playground-style', 'action', ARRAY['action','crouching','outdoor'], 'tagged', 'https://images.pexels.com/photos/8217535/pexels-photo-8217535.jpeg?auto=compress&cs=tinysrgb&w=600&h=750&fit=crop', false)
ON CONFLICT DO NOTHING;
