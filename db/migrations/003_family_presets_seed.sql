INSERT INTO presets (type, name, prompt_fragment) VALUES
('background', 'Playground golden hour', 'Set the scene at an outdoor playground during warm golden-hour light, with a natural, candid family atmosphere.'),
('background', 'Beach sunset', 'Set the scene on a beach at sunset, with warm natural light and soft sand and water in the background.'),
('background', 'Backyard family gathering', 'Set the scene in a cozy backyard with warm natural light, evoking a relaxed family gathering.'),
('background', 'Instagram square minimal', 'Frame the composition as a square, feed-ready Instagram post with a clean, minimal, softly lit backdrop.'),
('style', 'Family portrait, matching outfits', 'Style the family in coordinated, complementary outfit tones as if dressed for a planned family portrait session.'),
('style', 'Holiday keepsake', 'Use warm, festive styling appropriate for a holiday card, with cozy lighting and a cheerful mood.'),
('style', 'Candid family moment', 'Use a natural, candid photographic style that feels like an unposed, joyful family moment rather than a formal shoot.')
ON CONFLICT (type, name) DO NOTHING;
