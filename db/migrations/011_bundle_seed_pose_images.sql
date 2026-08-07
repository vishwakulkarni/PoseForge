-- Keep a representative starter collection available offline. These files
-- are committed under storage/pose-library/seed; match by the stable source
-- URL because IDs in the earlier seed migrations are generated per database.
UPDATE pose_references AS pose
SET file_path = bundled.file_path
FROM (VALUES
  ('https://images.pexels.com/photos/14666379/pexels-photo-14666379.jpeg?auto=compress&cs=tinysrgb&w=600&h=750&fit=crop', 'pose-library/seed/standing-three-quarter.png'),
  ('https://images.pexels.com/photos/37218533/pexels-photo-37218533.jpeg?auto=compress&cs=tinysrgb&w=600&h=750&fit=crop', 'pose-library/seed/standing-casual.png'),
  ('https://images.pexels.com/photos/35838611/pexels-photo-35838611.jpeg?auto=compress&cs=tinysrgb&w=700&h=875&fit=crop', 'pose-library/seed/group-matching-outfits.png'),
  ('https://images.pexels.com/photos/32842408/pexels-photo-32842408.jpeg?auto=compress&cs=tinysrgb&w=700&h=875&fit=crop', 'pose-library/seed/group-studio-trio.png'),
  ('https://images.pexels.com/photos/18649763/pexels-photo-18649763.jpeg?auto=compress&cs=tinysrgb&w=700&h=875&fit=crop', 'pose-library/seed/group-family-beach.png'),
  ('https://images.unsplash.com/photo-1656005947951-8f0c08be9db3?auto=format&fit=crop&w=700&h=875&q=82', 'pose-library/seed/male-stone-stairs.png'),
  ('https://images.unsplash.com/photo-1627964464837-6328f5931576?auto=format&fit=crop&w=700&h=875&q=82', 'pose-library/seed/couple-outdoor-kiss.png'),
  ('https://images.unsplash.com/photo-1576993537667-c6d2386f90a2?auto=format&fit=crop&w=700&h=875&q=82', 'pose-library/seed/female-athletic-stance.png'),
  ('https://images.unsplash.com/photo-1576299657860-bd5eb28ceca7?auto=format&fit=crop&w=700&h=875&q=82', 'pose-library/seed/couple-hand-hold.png'),
  ('https://images.unsplash.com/photo-1557862921-37829c790f19?auto=format&fit=crop&w=700&h=875&q=82', 'pose-library/seed/male-arms-crossed.png'),
  ('https://images.unsplash.com/photo-1503443207922-dff7d543fd0e?auto=format&fit=crop&w=700&h=875&q=82', 'pose-library/seed/male-editorial-lean.png'),
  ('https://images.unsplash.com/photo-1543084951-1650d1468e2d?auto=format&fit=crop&w=700&h=875&q=82', 'pose-library/seed/male-blue-wall.png'),
  ('https://images.unsplash.com/photo-1599725728689-f5c3cbb086ae?auto=format&fit=crop&w=700&h=875&q=82', 'pose-library/seed/male-chair-sit.png'),
  ('https://images.unsplash.com/photo-1710250199738-f48ce3cda927?auto=format&fit=crop&w=700&h=875&q=82', 'pose-library/seed/female-power-squat.png'),
  ('https://images.unsplash.com/photo-1676577475176-062dcce44e47?auto=format&fit=crop&w=700&h=875&q=82', 'pose-library/seed/female-wide-stance.png'),
  ('https://images.unsplash.com/photo-1692851127387-2a775fc33142?auto=format&fit=crop&w=700&h=875&q=82', 'pose-library/seed/couple-piggyback.png')
) AS bundled(source_url, file_path)
WHERE pose.source_url = bundled.source_url;
