const RETRIEVED_ON = "2026-08-03";

const sharedDisclaimer = "PoseForge crops, resizes, and formats a best-effort photo locally. Government acceptance is not guaranteed. Do not use AI assistance where the authority requires an unaltered photograph; always verify the final file against the linked official source.";

const profiles = [
  {
    id: "us-passport", countryCode: "US", country: "United States", documentType: "passport", label: "U.S. passport",
    retrievedOn: RETRIEVED_ON, sourceVersionLabel: "Official source version: DS-11 04-2025", sourceUpdatedOn: "2025-04",
    officialLinks: [
      { label: "State Department passport photo guidance", url: "https://travel.state.gov/en/passports/apply/help/photos.html" },
      { label: "Official U.S. photo crop tool", url: "https://tsg.phototool.state.gov/photo" },
      { label: "Official DS-11 form", url: "https://eforms.state.gov/Forms/ds11_pdf.PDF" },
    ],
    requirements: ["Color photo taken within the last 6 months", "Exactly 2 × 2 inches (51 × 51 mm) when printed", "Head measures 1–1⅜ inches (25–35 mm) from chin to top of head", "Plain white or off-white background", "Full-face view directly toward the camera", "Eyes open; neutral expression or natural smile", "No eyeglasses; limited religious or medical head-covering exceptions", "No software alteration that changes appearance"],
    output: { widthPx: 600, heightPx: 600, format: "jpeg", printWidthMm: 51, printHeightMm: 51, sheet: true },
    prompt: "U.S. passport-style portrait, 2 by 2 inch square, plain white or off-white background, full face directly toward camera, neutral expression, even light, exact identity and natural appearance",
    disclaimer: sharedDisclaimer,
  },
  {
    id: "us-visa", countryCode: "US", country: "United States", documentType: "visa", label: "U.S. visa",
    retrievedOn: RETRIEVED_ON, sourceVersionLabel: "Official FAM Photo Standards revision: July 29, 2024", sourceUpdatedOn: "2024-07-29",
    officialLinks: [
      { label: "9 FAM visa photo standards", url: "https://fam.state.gov/FAM/09FAM/09FAM030306.html#M303_6_2_A_1" },
      { label: "State Department visa photo guidance", url: "https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos.html" },
    ],
    requirements: ["Recent photo taken within the last 6 months", "Square digital image; PoseForge exports 600 × 600 pixels", "Hard copy should measure 2 × 2 inches", "Head height 1–1⅜ inches (25–35 mm)", "White or off-white background", "Full frontal view, eyes open, neutral expression", "No eyeglasses except rare documented medical circumstances", "Photo must be untouched and represent current appearance"],
    output: { widthPx: 600, heightPx: 600, format: "jpeg", maxBytes: 240000, printWidthMm: 51, printHeightMm: 51, sheet: true },
    prompt: "U.S. visa-style portrait, square, white or off-white background, full frontal view, eyes open, neutral expression, current exact appearance, no eyeglasses",
    disclaimer: sharedDisclaimer,
  },
  {
    id: "in-passport", countryCode: "IN", country: "India", documentType: "passport", label: "Indian passport",
    retrievedOn: RETRIEVED_ON, sourceVersionLabel: "ICAO photo rules effective September 1, 2025", sourceUpdatedOn: "2025-09-01",
    officialLinks: [
      { label: "Embassy of India passport photo guidance", url: "https://eoivienna.gov.in/pages/NjQ," },
      { label: "Official ICAO-compliant photo PDF", url: "https://eoivienna.gov.in/public_files/assets/pdf/Guidelines_29_08_2025.pdf" },
      { label: "Passport Seva photo guidance", url: "https://passportindia.gov.in/AppOnlineProject/pdf/GUIDELINES%20FOR%20CAPTURING%20PHOTOGRAPHS%20FOR%20MINORS_v2.1.pdf" },
    ],
    requirements: ["35 × 45 mm portrait format", "630 × 810 pixel digital output", "White background", "Face occupies approximately 80–85%", "Straight, centered full-face view", "Eyes open and visible; mouth closed; natural expression", "Uniform light with no shadows, reflections, blur, or red-eye", "Photo must be unaltered by computer software"],
    output: { widthPx: 630, heightPx: 810, format: "jpeg", printWidthMm: 35, printHeightMm: 45, sheet: true },
    prompt: "Indian ICAO passport portrait, 35 by 45 millimeter composition, white background, face 80 to 85 percent, straight centered full face, eyes open, mouth closed, natural expression",
    disclaimer: sharedDisclaimer,
  },
  {
    id: "in-visa", countryCode: "IN", country: "India", documentType: "visa", label: "India regular visa",
    retrievedOn: RETRIEVED_ON, sourceVersionLabel: "Official source does not state a page-update date", sourceUpdatedOn: null,
    officialLinks: [
      { label: "Indian Visa Online instructions", url: "https://indianvisaonline.gov.in/visa/instruction.html" },
      { label: "Official visa image specification PDF", url: "https://indianvisaonline.gov.in/visa/VSS_IMAGE.pdf" },
    ],
    requirements: ["Square JPEG upload", "PoseForge exports 600 × 600 pixels within the official 350–1000 px range", "File size 10–300 KB", "Physical mission photo 51 × 51 mm", "Recent photo taken within the last 6 months", "Full-face front view with eyes open", "Plain light or white background; no shadows or border", "Head height approximately 25–35 mm"],
    output: { widthPx: 600, heightPx: 600, format: "jpeg", minBytes: 10000, maxBytes: 300000, printWidthMm: 51, printHeightMm: 51, sheet: true },
    prompt: "India visa portrait, square, light or white background, full-face front view, eyes open, full head centered, no shadow or border, current exact appearance",
    disclaimer: sharedDisclaimer,
  },
  {
    id: "in-evisa", countryCode: "IN", country: "India", documentType: "visa", label: "India e-Visa",
    retrievedOn: RETRIEVED_ON, sourceVersionLabel: "Official page states: Updated May 16, 2019", sourceUpdatedOn: "2019-05-16",
    officialLinks: [{ label: "Indian e-Visa official guidance", url: "https://indianvisaonline.gov.in/evisa/tvoa.html" }],
    requirements: ["Square JPEG image", "File size 10 KB–1 MB", "Recent front-facing photograph", "Full face, eyes open, without spectacles", "Full head centered in frame", "Plain light or white background", "No shadows or borders", "Must remain a current true likeness"],
    output: { widthPx: 600, heightPx: 600, format: "jpeg", minBytes: 10000, maxBytes: 1000000, printWidthMm: 51, printHeightMm: 51, sheet: false },
    prompt: "India e-Visa portrait, square, plain light or white background, full face front view, eyes open, no spectacles, full head centered, no shadow or border",
    disclaimer: sharedDisclaimer,
  },
  {
    id: "in-oci", countryCode: "IN", country: "India", documentType: "oci", label: "India OCI application",
    retrievedOn: RETRIEVED_ON, sourceVersionLabel: "Central OCI source does not state a page-update date", sourceUpdatedOn: null,
    officialLinks: [
      { label: "Central OCI application FAQ", url: "https://ociservices.gov.in/onlineOCI/faq" },
      { label: "Official OCI photo specification PDF", url: "https://ociservices.gov.in/Photo-Spec-FINAL.pdf" },
    ],
    requirements: ["Square JPEG/JPG image", "PoseForge exports 600 × 600 pixels within the official 200–900 px range", "Maximum file size 200 KB", "At least 51 × 51 mm for print", "Face occupies approximately 80%", "Front view with head, shoulders, and full face centered", "Plain light-colored background that is not white", "No retouching, enhancement, or softening"],
    output: { widthPx: 600, heightPx: 600, format: "jpeg", maxBytes: 200000, printWidthMm: 51, printHeightMm: 51, sheet: true },
    prompt: "India OCI application portrait, square, plain light-colored non-white background, face approximately 80 percent, front view, head and shoulders centered, current exact appearance",
    disclaimer: sharedDisclaimer,
  },
];

const DOCUMENT_PHOTO_PROFILES = Object.freeze(Object.fromEntries(profiles.map((profile) => [profile.id, Object.freeze(profile)])));
const USA_PASSPORT_GUIDELINE = DOCUMENT_PHOTO_PROFILES["us-passport"];

module.exports = { RETRIEVED_ON, DOCUMENT_PHOTO_PROFILES, USA_PASSPORT_GUIDELINE };
