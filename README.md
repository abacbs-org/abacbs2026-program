# ABACBS 2026 — interactive program

A small, dependency-free web app for the ABACBS 2026 conference
(RMIT Melbourne, 16–20 November 2026). Attendees browse the program,
tap ☆ on the talks and posters they want, and get their own schedule —
with clash warnings — saved on their phone and working offline.

No build step, no framework, no backend. Plain HTML/CSS/JS plus one JSON file.

## What's in it

- **Program** — every day (Mon satellites → Fri workshops), grouped by time slot,
  with rooms, chairs, speakers and affiliations. Parallel streams sit side by side
  on a wide screen so clashes are obvious.
- **My program** — ☆ anything (a talk, a poster, a keynote, the dinner). Saved in
  `localStorage` on that device. Overlapping picks are flagged, both in the list
  and on the item itself.
- **Posters** — all 190 posters (95 Tue + 95 Wed), searchable by number, presenter
  or title, with the odd/even morning- vs afternoon-tea split.
- **Info** — venue, transport, registration desk, poster logistics, accessibility,
  social, and the 21 workshop abstracts.
- **Search** — one box across talks, posters, people and rooms.
- **Export** — `.ics` download of your picks (straight into Apple/Google Calendar)
  and a share code so you can copy a program between devices or send it to a friend.
- **Offline** — a service worker caches the whole app; the program data is
  network-first so updates land when there's signal.
- Light/dark, keyboard-navigable, and sized for a phone first.

## Run it locally

It must be served over HTTP (the app fetches `data/program.json`; opening
`index.html` from the filesystem will fail).

```bash
python3 -m http.server 8787
```

Then open <http://localhost:8787>.

## Put it on GitHub Pages

```bash
git init && git add . && git commit -m "ABACBS 2026 interactive program"
```

```bash
gh repo create abacbs2026-program --public --source=. --push
```

Then in the repo: **Settings → Pages → Build and deployment → Source: Deploy from a
branch → Branch: `main` / `(root)` → Save.**

A minute later it's live at `https://<user>.github.io/abacbs2026-program/`.
All paths are relative, so it works from a project subpath without changes.

If you'd rather deploy from an action, Netlify, or Cloudflare Pages, just publish
the folder as-is — there is nothing to build.

## Install it on a phone (it becomes an app)

This is a PWA, so it installs from the browser — no app store.

**iPhone / iPad (must be Safari):** open the page → tap the **Share** button →
**Add to Home Screen** → **Add**. It then opens full-screen with its own icon.

**Android (Chrome):** open the page → **⋮** menu → **Add to Home screen** /
**Install app**.

**Desktop Chrome/Edge:** the install icon in the address bar.

Tell people to install *first* and then star their sessions: picks are stored per
browser, and on iOS the home-screen app has its own storage separate from the Safari tab.

## Updating the program

Everything the app shows lives in `data/program.json`:

- `meta` — dates, venue, day tabs, info panels
- `events` — one entry per session; `talks[]` for parallel sessions,
  `items[]` for the lightning-talk running order
- `posters` — `{day, number, presenter, title}`
- `workshops` — title, presenters, duration, audience, prerequisites

Edit the JSON, then **bump `VERSION` in `sw.js`** (e.g. `abacbs2026-v2`) so
installed copies pick up the new files instead of serving the cached ones.

Pick IDs are stable strings (`tue-transcriptomics-3`, `poster-Tue-42`,
`wed-kn2`). Keep them stable across edits or people's saved programs will
lose those items.

## Where the data came from

Built from the official ABACBS 2026 combined program PDF and the program
spreadsheet dated 17 Oct 2026, plus the satellite/workshop pages on
abacbs.org. Where the PDF and the spreadsheet disagreed (talk order in the
Women's Health session, two late title changes), the PDF was treated as the
newer source. The program is provisional and subject to change — the footer
and the Info tab both say so and link back to abacbs.org/2026.

## Credits

ABACBS logo used with permission of the ABACBS Executive Committee
(`icons/logo-folded.png`, `icons/logo-glow.png`). Colours are taken from it:
red `#DD0C15`, blue `#007AB1`, black, white.
