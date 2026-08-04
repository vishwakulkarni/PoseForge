-- Group/family pose references, sourced from Pexels (Pexels License — free
-- for any use, no attribution required), hotlinked via source_url the same
-- way as the other seeded poses — see CREDITS.md. Unlike the earlier
-- single-subject seed batch (005), these are all multi-person poses
-- (2-4 people), picked to pair with Studio's multi-character generation
-- support. Each photo's own page was checked individually (not just
-- search-result thumbnails) before inclusion.
INSERT INTO pose_references (title, category, tags, tag_status, source_url, is_custom) VALUES
  ('Studio trio portrait', 'group', ARRAY['group','studio','three-people','portrait'], 'tagged', 'https://images.pexels.com/photos/32842408/pexels-photo-32842408.jpeg?auto=compress&cs=tinysrgb&w=700&h=875&fit=crop', false),
  ('Group hug, outdoors', 'group', ARRAY['group','hugging','outdoor','candid'], 'tagged', 'https://images.pexels.com/photos/15463925/pexels-photo-15463925.jpeg?auto=compress&cs=tinysrgb&w=700&h=875&fit=crop', false),
  ('Studio portrait, matching outfits', 'group', ARRAY['group','studio','matching-outfits','portrait'], 'tagged', 'https://images.pexels.com/photos/35838611/pexels-photo-35838611.jpeg?auto=compress&cs=tinysrgb&w=700&h=875&fit=crop', false),
  ('Three generations, studio', 'group', ARRAY['group','studio','multi-generational','portrait'], 'tagged', 'https://images.pexels.com/photos/9479569/pexels-photo-9479569.jpeg?auto=compress&cs=tinysrgb&w=700&h=875&fit=crop', false),
  ('Parents and child, candid', 'group', ARRAY['group','candid','outdoor','affectionate'], 'tagged', 'https://images.pexels.com/photos/12750677/pexels-photo-12750677.jpeg?auto=compress&cs=tinysrgb&w=700&h=875&fit=crop', false),
  ('Family embrace, beach', 'group', ARRAY['group','beach','embrace','outdoor'], 'tagged', 'https://images.pexels.com/photos/18649763/pexels-photo-18649763.jpeg?auto=compress&cs=tinysrgb&w=700&h=875&fit=crop', false),
  ('Family posed together, festive', 'group', ARRAY['group','festive','indoor','seasonal'], 'tagged', 'https://images.pexels.com/photos/6388343/pexels-photo-6388343.jpeg?auto=compress&cs=tinysrgb&w=700&h=875&fit=crop', false),
  ('Three generations, studio brick wall', 'group', ARRAY['group','studio','multi-generational','casual'], 'tagged', 'https://images.pexels.com/photos/9385084/pexels-photo-9385084.jpeg?auto=compress&cs=tinysrgb&w=700&h=875&fit=crop', false)
ON CONFLICT DO NOTHING;
