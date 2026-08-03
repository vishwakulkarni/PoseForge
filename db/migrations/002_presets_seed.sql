INSERT INTO presets (type, name, prompt_fragment) VALUES
('background', 'Studio white', 'Set the scene in a professional photo studio with a seamless white background and soft even lighting.'),
('background', 'Outdoor golden hour', 'Set the scene outdoors during warm golden-hour light with a natural environment.'),
('background', 'Urban street', 'Set the scene on a believable urban street with cinematic natural daylight.'),
('background', 'Plain gray backdrop', 'Set the scene against a simple neutral gray studio backdrop.'),
('style', 'Photorealistic', 'Use a highly photorealistic photographic treatment with natural skin texture.'),
('style', 'Editorial fashion lighting', 'Use polished editorial fashion lighting with controlled contrast and refined composition.'),
('style', 'Soft natural light', 'Use soft natural window light and gentle shadows for an approachable photograph.')
ON CONFLICT (type, name) DO NOTHING;
