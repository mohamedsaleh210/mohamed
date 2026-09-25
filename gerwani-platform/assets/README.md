# Asset intake — El Gerwany

Put original files here. They are processed by the `media-asset-pipeline` skill: inspection, quality check, usage recommendation, then web variants. Nothing is edited silently.

```
assets/incoming/
├── logo/      SVG preferred (also AI/EPS/PDF); PNG accepted temporarily
├── people/    founder, partners, team: one folder per person if possible
├── office/    office, reception, meeting rooms, building exterior
└── work/      real work moments: filing, signing, site visits (no client faces without consent)
```

Before uploading photos of people, confirm:
- Each identifiable person agreed to appear on the website.
- The name and job title for each person, exactly as they should appear.
- Any photo that must not be used publicly.

What will be done with them: crop per placement, resize, AVIF/WebP variants, remove EXIF/GPS, apply one consistent color grade, and background removal where it helps (checked visually). **No face or body reshaping, no beautification, and no identity change.** Anything beyond that (retouching, relighting) needs an external tool and will be flagged, not faked.

⚠️ Privacy: the repository is private, but keep originals of people out of the public site folder. Only processed, approved variants get published.
