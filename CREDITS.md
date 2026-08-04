# Credits

## Gallery photography

The example scenes on the Gallery page (`/gallery.html`) are real stock
photos from [Pexels](https://www.pexels.com), used under the
[Pexels License](https://www.pexels.com/license/) (free for any use, no
attribution required). They are hotlinked directly from Pexels' CDN rather
than bundled into the repository, which is the pattern Pexels' own site
uses for embedding.

**They illustrate the kind of scene PoseForge can produce — they are not
actual PoseForge-generated outputs**, and the people pictured have no
association with this project. This is called out on the Gallery page
itself for the same reason.

Photos used (by [Pexels](https://www.pexels.com) photo ID):

| ID | Used for | Photo |
|---|---|---|
| [7880399](https://www.pexels.com/photo/7880399/) | Family, matching outfits | pexels.com/photo/7880399 |
| [8457717](https://www.pexels.com/photo/8457717/) | Siblings, playground | pexels.com/photo/8457717 |
| [30680355](https://www.pexels.com/photo/30680355/) | Instagram square, golden hour | pexels.com/photo/30680355 |
| [6115919](https://www.pexels.com/photo/6115919/) | Holiday card | pexels.com/photo/6115919 |
| [32842395](https://www.pexels.com/photo/32842395/) | Multi-generational family portrait | pexels.com/photo/32842395 |
| [36090195](https://www.pexels.com/photo/36090195/) | Siblings, sunset walk | pexels.com/photo/36090195 |
| [27659170](https://www.pexels.com/photo/27659170/) | Instagram grid opener | pexels.com/photo/27659170 |
| [15648183](https://www.pexels.com/photo/15648183/) | Backyard golden-hour portrait | pexels.com/photo/15648183 |

If you swap these out or add your own, keep the same disclosure pattern —
gallery examples should never be presented as if they were real generated
output unless they actually are.

## Pose library starter photos

The starter poses seeded into the pose library (`db/migrations/005_pose_references_seed.sql`,
shown in `/gallery.html` and picked from in `/studio.html`) are also real,
free-to-use [Pexels](https://www.pexels.com) photos under the same
[Pexels License](https://www.pexels.com/license/). They're hotlinked via
`source_url` until a pose is actually used in a generation, at which point
the app downloads and caches a local copy (see `lib/poseLibrary.js`).

Their titles/categories/tags describe the general *type* of pose (standing,
sitting, action, portrait, candid) rather than claiming verified scene
detail — swap them for your own curated set anytime, or let the AI
auto-tagger (`lib/poseTagger.js`) retag anything you add through "+ Add
pose" in the Gallery.

Photo IDs used (by [Pexels](https://www.pexels.com) photo ID): 16277445,
37218533, 14666379, 8188775, 34134058, 5861289, 32163232, 15813831,
10339049, 6668809, 7276013, 8217535.

Any pose photo *you* upload through Studio or the Gallery's "+ Add pose"
is saved locally under `storage/pose-library/` and is yours — it's never
sent anywhere except to whichever AI tagging engine you've configured (if
any), the same way generation itself works.

## Mascot artwork

The painter-dog mascot (`public/images/mascot-painter-dog.svg` and the
Codex-generated `.png` counterpart) was created for this project — see
`README.md`'s "Mascot artwork" section for how to regenerate it.
