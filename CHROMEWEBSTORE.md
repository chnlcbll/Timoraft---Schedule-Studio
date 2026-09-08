# Chrome Web Store Listing — Timoraft — Schedule Studio

> Last updated: 2026-09-08

## Store listing

**Extension name:** Timoraft — Schedule Studio

**Short description:** Build, merge, save, and turn class schedules into custom wallpapers.

**Detailed description:**

Timoraft is a local-first schedule studio for assembling class schedules and keeping them easy to compare.

Build conflict-free combinations from courses and sections, select or deselect sections in bulk, optionally include Sundays, import available classes from Archer's Hub while signed in, and save schedules on your device. Enrollment meters show how many students are in each imported section, full sections stay selectable, and unlimited pins keep preferred choices first. Large catalogs remain responsive and course cards can be minimized.

Merge two saved schedules with a separate color for each person. Classes that happen at the same time are placed side by side instead of covering one another, and only clashes within the same saved schedule are flagged. Turn any schedule or current merged view into a customized desktop, standard phone, tall phone, extra-tall phone, tablet, or square wallpaper using seven layouts, ten typeface choices, palette presets, image-derived colors, labeled breaks, and an optional brand mark. Phone exports include adjustable clear space for the lock-screen clock and notifications. Wallpaper cards automatically adapt to schedule density and keep course, section, time, room, professor, and title details organized inside the design. Repeated sections can be edited meeting by meeting, allowing separate days to use different times, rooms or online modes, and professors. Short Sunday classes remain readable across every wallpaper style. Choose a neon weekly grid or a charcoal pastel grid with a shared time rail, fixed-position course cards, highlighted breaks, a units footer, and legible grouped day grids on smaller exports. The icon-based navigation can also collapse to leave more room for the active workspace. Correct imported schedule text before export without changing the saved schedule.

Open Timoraft from its toolbar icon. Add classes manually or use the Archer's Hub search, generate combinations, then save the schedules you want to keep. The Merge Lab and Wallpaper Studio use those local saves.

Schedule data, preferences, and uploaded wallpaper backgrounds stay in the browser's local extension storage. Timoraft contacts only Archer's Hub when the user chooses to search its catalog and uses the user's existing signed-in session for that request. It has no analytics, ads, or developer-operated server.

**Category:** Productivity

**Single purpose:** Create, compare, save, and export personal class schedules.

**Primary language:** English

## Graphics and assets

| Asset | Dimensions | Status | Filename |
|---|---:|---|---|
| Store icon | 128×128 PNG | Ready | `extension/icons/icon128.png` |
| Screenshot 1 — Builder | 1280×800 PNG | Ready | `store-assets/screenshots/01-build-your-schedule.png` |
| Screenshot 2 — Merge Lab | 1280×800 PNG | Ready | `store-assets/screenshots/02-merge-two-schedules.png` |
| Screenshot 3 — Wallpaper Studio | 1280×800 PNG | Ready | `store-assets/screenshots/03-customize-wallpapers.png` |
| Screenshot 4 — Time grid | 1280×800 PNG | Ready | `store-assets/screenshots/04-time-grid-and-breaks.png` |
| Screenshot 5 — Responsive cards | 1280×800 PNG | Ready | `store-assets/screenshots/05-responsive-readable-layouts.png` |
| Small promo tile | 440×280 | Optional / not created | |

The five screenshots use current Timoraft interface captures with consistent store-safe framing and feature-specific captions. Regenerate them with `store-assets/create-screenshots.ps1` if the interface changes.

## Permissions justification

| Permission | Type | Justification |
|---|---|---|
| `storage` | permissions | Saves schedules, course inputs, preferences, and wallpaper settings locally on the user's device. |
| `unlimitedStorage` | permissions | Lets users keep locally uploaded wallpaper images and multiple saved schedule designs without the normal extension storage quota interrupting the feature. |
| `tabs` | permissions | Reuses and focuses the existing Timoraft app tab instead of opening duplicate tabs whenever the toolbar icon is clicked. |
| `cookies` | permissions | Detects the user's existing Archer's Hub sign-in session only when using catalog search; Timoraft does not store the cookie. |
| `https://archershub.dlsu.edu.ph/*` | host_permissions | Loads campus, term, course, and section results from Archer's Hub at the user's request. No other site is accessible. |

## Privacy and data use

Timoraft does not transmit schedule data, preferences, or uploaded images to a developer-operated service. Those items remain in `chrome.storage.local` and can be removed by deleting saved schedules, clearing the extension's data, or uninstalling it.

When a user explicitly searches Archer's Hub, the selected campus, term, or course query is sent to `archershub.dlsu.edu.ph` using the user's existing authenticated session. Authentication cookies are read for that request but are not retained by Timoraft. This interaction is necessary to provide the requested catalog search and is subject to the site's own policies.

- [x] Data is not sold to third parties.
- [x] Data is not used for purposes unrelated to the extension's single purpose.
- [x] Data is not used for creditworthiness or lending purposes.
- [x] No analytics or advertising identifiers are collected.

### Developer Dashboard privacy-form answers

**Single purpose description:**

Create, compare, save, merge, and export personal class schedules as customizable wallpapers.

**Permission justifications:**

- **cookies:** Reads Archer's Hub cookies only to detect the user's existing sign-in and authenticate course-catalog requests the user starts. Timoraft does not save the cookies or send them anywhere other than Archer's Hub.
- **storage:** Saves courses, section selections, pinned choices, schedules, preferences, and wallpaper designs locally so they remain available after Timoraft is closed.
- **tabs:** Opens Timoraft in one reusable browser tab, focuses that tab on later toolbar clicks, and opens the Archer's Hub sign-in page when the user requests it. Timoraft does not inspect general browsing history.
- **unlimitedStorage:** Allows users to keep multiple local schedules and user-selected wallpaper background images without the normal local storage quota interrupting saves.
- **Host permission:** Access to `https://archershub.dlsu.edu.ph/*` is used only when the user searches or refreshes Archer's Hub. It retrieves campuses, academic terms, courses, sections, schedules, instructors, rooms, capacity, and enrollment data for the schedule builder. Timoraft cannot access any other website.

**Remote code:** Select **No, I am not using remote code.** All executable JavaScript is included in the extension package. Archer's Hub responses are processed only as course data and are never executed as code.

**Data-usage selections:**

- [x] Personally identifiable information — instructor names may be imported or entered and stored locally as part of a schedule.
- [x] Authentication information — Archer's Hub authentication cookies are read temporarily for user-requested catalog access and are not stored by Timoraft.
- [x] Website content — course, section, schedule, room, instructor, capacity, and enrollment information is retrieved from Archer's Hub; user-selected wallpaper images and schedule text are also processed locally.
- [ ] Health information
- [ ] Financial and payment information
- [ ] Personal communications
- [ ] Location
- [ ] Web history
- [ ] User activity

**Certifications:** Check all three certification boxes. Timoraft does not sell user data, use it for unrelated purposes, or use it for creditworthiness or lending.

**Privacy policy URL:** Required. Use a publicly accessible HTTPS page whose text matches these disclosures; a local file path is not accepted.

## Privacy policy

The public-ready policy is available at `PRIVACY.md`. After publishing this repository, verify that the policy opens without signing in and use `https://github.com/chnlcbll/Timoraft---Schedule-Studio/blob/main/PRIVACY.md` in the Developer Dashboard. A monitored support email should also be added to the policy when available.

## Distribution

**Visibility:** To be decided by publisher
**Regions:** To be decided by publisher

## Developer info

**Publisher name:** Required before submission
**Contact email:** Required before submission
**Support URL or email:** Recommended before submission

## Version history

| Version | Date | Changes | Status |
|---|---|---|---|
| 1.6.1 | 2026-09-08 | Made course codes protected, high-contrast labels in both dark-grid layouts, with card-level responsive sizing that preserves the full code before shortening titles or other secondary text. | Draft |
| 1.6.0 | 2026-09-08 | Added per-meeting wallpaper editing for day, time, room or online mode, and professor; kept time and room visible on every card; and fixed short BIOLRES-style Sunday cards across all layouts and device sizes. | Draft |
| 1.5.1 | 2026-09-08 | Expanded short-class cards in both dark time-grid layouts, condensed their detail hierarchy, and added collision-safe responsive sizing so section, time, room, and professor remain visible across every export ratio. | Draft |
| 1.5.0 | 2026-09-08 | Added a responsive pastel dark-grid wallpaper with dotted day headings, solid course-color cards, amber break bands, and shared hour rails, plus locally remembered collapsible icon navigation. | Draft |
| 1.4.0 | 2026-09-08 | Redesigned all wallpaper presets, added tall 9:19.5 and extra-tall 9:21 phone exports, adjustable lock-screen clock spacing and content scale, and adaptive detail-preserving cards for dense and merged schedules. | Draft |
| 1.3.0 | 2026-09-08 | Added a neon weekly-grid wallpaper option with shared hour rails, fixed time-positioned course cards, highlighted break bands, units footer, and responsive grouped grids for phone, tablet, square, and desktop PNGs. | Draft |
| 1.2.0 | 2026-09-08 | Added Hub enrollment/fullness meters, unlimited top-choice pins, minimized course cards, course refresh and reconnect states, default deselection, labeled breaks, side-by-side couple schedule merging, two new wallpaper layouts, and editable export text across all device sizes. | Draft |
| 1.1.1 | 2026-09-07 | Added global and per-course bulk section selection, expanded the wallpaper typeface menu to ten options, and kept schedule searches responsive with large catalogs. | Draft |
| 1.1.0 | 2026-09-07 | Introduced the minimalist visual system, responsive phone exports, three wallpaper layouts, expanded color tools, image palette extraction, more fonts and card styles, an optional watermark, and a new icon. | Draft |
| 1.0.1 | 2026-09-07 | Fixed modal dismissal and added an in-editor shortcut to Archer's Hub search. | Draft |
| 1.0.0 | 2026-09-07 | Initial local-first builder, merge, wallpaper, saves, Sundays, and Hub import. | Draft |

## Known limitations

- Archer's Hub import requires the user to already be signed in and depends on that site's current endpoints and response formats.
- A hosted privacy policy, publisher identity, and contact information remain to be supplied before publication.
