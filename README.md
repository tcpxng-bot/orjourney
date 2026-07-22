# OR Journey

Real-time, **privacy-first** patient-journey tracking for the operating-room workflow.
Mobile-first (iPhone), also responsive on tablet and desktop.

> **This is not a medical record system.** It stores *no* patient name, HN, citizen ID,
> diagnosis, procedure name, or clinical notes. A journey is identified only by a cute
> **avatar + a random case code** (e.g. `น้องเมฆ · K7P4`). The avatar represents the
> *journey*, never the patient, and expires when the journey completes.

---

## What's in this repo

```
or-journey/
├── index.html              # Full working front-end prototype (mock data, all 6 roles)
├── css/                    # (extract styles here when splitting the single file)
├── js/                     # (extract modules here: store, statuses, avatars, screens)
├── sql/
│   ├── 01_schema.sql       # Tables, enums, triggers, Realtime publication
│   ├── 02_rls.sql          # Row Level Security + public lookup RPC
│   └── 03_seed.sql         # Wards, OR rooms, avatars (fictional)
├── docs/
│   ├── SECURITY.md         # Threat model, tokens, PDPA notes
│   └── ENV.example         # Environment variables
└── README.md
```

The prototype in `index.html` runs standalone in a browser with **mock data** — open it
and pick any role. It simulates Supabase Realtime (the boards live-update as statuses
change) so you can demo the whole flow before wiring the backend.

---

## The journey (main visible flow)

```
หน่วยเปลรับผู้ป่วยแล้ว → ถึงหน้า OR รอส่งมอบ → รอเข้าห้องผ่าตัด → กำลังผ่าตัด
→ ผ่าตัดเสร็จ → อยู่ห้องพักฟื้น RR → รอหน่วยเปลรับกลับ → กำลังส่งกลับวอร์ด → กลับถึงวอร์ดแล้ว
```

Each transition is **owned by exactly one role**, enforced both in the UI and in RLS:

| Stage | Actor | Action |
|-------|-------|--------|
| create → `WAITING_PORTER` | **WARD** | สร้าง Journey ก่อนส่งผู้ป่วย (แตะเดียว) → ยื่นบัตรอวตาร์ให้ญาติ |
| → `PORTER_TO_OR` | PORTER | รับผู้ป่วย + **เลือกห้อง OR ปลายทาง** |
| → `OR_VERIFY_1` | OR (nurse #1) | ยืนยันตัวครั้งที่ 1 (แก้ห้องได้หากสลับ) |
| → `IN_OR` | OR (nurse #2) | ยืนยันตัวครั้งที่ 2 · เริ่มผ่าตัด |
| → `SURGERY_FINISHED` | OR | ผ่าตัดเสร็จ |
| → `IN_RR` | RR | รับผู้ป่วยเข้าห้องพักฟื้น |
| → `COMPLETED` | RR | ส่งกลับหอผู้ป่วย → tokens revoked |

**The ward starts the journey.** The ward creates the journey *before* the patient
leaves, which is the moment the family is still present — so staff can hand them the
avatar + tracking code straight away (on-screen card or printed slip). Creation is
one tap: ward comes from the logged-in profile, avatar and code are generated, and
**no OR room is chosen** — the porter picks the destination room when accepting the job,
since the porter is the one who has to know where to take the patient.

**Wristband checks at every handoff.** Identity is re-confirmed each time custody
changes: porter collecting from the ward, both OR nurses before surgery, and RR
receiving from OR. Each check records only *that* it passed and *who* confirmed
(plus a server timestamp) — never the patient's name or HN. The journey detail sheet
shows the full chain of custody.

**Two-nurse identity verification.** Entering the OR requires **two independent
confirmations by two *different* nurses** that the patient's wristband matches this
journey. The system records only *that* each check passed and *which* nurse did it
(`verify1_by` / `verify2_by`) plus timestamps — **never the patient's name or HN**.
This is enforced by a DB `CHECK` (the two confirmers must differ) and in the UI.

**Emergency cases.** Emergencies come from the *same* wards as everything else —
most often the labour room, or an admitted patient who deteriorates — not from a
separate emergency department. OR opens the case immediately (`is_emergency`)
because the ward has no time, picks the source location and reserves a room. The
patient is still collected by a porter, so the journey enters the **same pickup
queue**, flagged so it sorts to the top under a "ด่วน · รับทันที" heading.
Identity is still verified, but **one nurse is enough** — and the record says so
(`solo`), rather than faking a second confirmation. Emergency cases are excluded from
the average-duration stats (so they don't distort elective timings) but are still
included in the over-time alerts.

**The app is never on the critical path.** If there is no time even to open an
emergency case, staff treat the patient first and log it afterwards. This is a
process-status board, not a medical record, so retrospective entry costs nothing
clinically.

**RR closes the journey.** There is no separate porter return trip: once recovery is
done, RR sends the patient back to the ward directly (`IN_RR → COMPLETED`), which
revokes the avatar/case code and staff token.

---

## Roles at a glance

- **PORTER** — creates journeys, moves patients to/from OR. Minimal input: source ward + destination + confirm.
- **OR** — receives from porter, updates the surgery stages only.
- **RR** — recovery stages + calls porter for the return trip.
- **WARD** — **view-only**, sees only its *own* ward's journeys, live.
- **PR** — looks up a public-safe status by **avatar + code**; every lookup is audited.
- **ADMIN** — manages users, wards, rooms, avatars, status labels, audit log. No automatic access to sensitive journey detail.

---

## Setup (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, run the files in order: `sql/01_schema.sql`, then
   `sql/02_rls.sql`, then `sql/03_seed.sql`.
3. **Auth** → enable Email (or your SSO). New sign-ups get a `profiles` row with role
   `WARD` by default (via the `handle_new_user` trigger).
4. An **ADMIN** assigns real roles and wards:
   ```sql
   update profiles set role='PORTER' where id='<user-uuid>';
   update profiles set role='WARD', ward_id=(select id from wards where name='สูตินรีเวชกรรม')
     where id='<user-uuid>';
   ```
5. **Realtime** is enabled on `journeys`, `journey_events`, `transport_jobs` by the schema.
   In the front end, subscribe with RLS-aware channels so each role only receives rows it may see.

### Wiring the front end
Replace the in-memory `Store` in `index.html` with the Supabase client:
```js
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)

// realtime board
supabase.channel('journeys')
  .on('postgres_changes', { event:'*', schema:'public', table:'journeys' }, render)
  .subscribe()

// public lookup (PR / relatives) — RPC, never a direct table read
const { data } = await supabase.rpc('public_status_lookup', { p_avatar:'cloud', p_code:'K7P4' })
```

---

## Environment variables

See `docs/ENV.example`. Only the **anon** key ever ships to the browser — the
**service-role** key stays server-side (Vercel serverless / Edge functions) and is used
for token issuance, QR validation, and writing audit rows.

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<server-only, never in client bundle>
```

---

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, **Import Project** → select the repo.
3. If served as static, no build step is needed (the prototype is a single HTML file).
   For a bundled build, set the framework preset and add the `VITE_*` env vars under
   **Settings → Environment Variables**. Keep `SUPABASE_SERVICE_ROLE_KEY` unchecked for
   the client and only expose it to serverless functions.
4. Deploy. Add your custom domain and confirm HTTPS.

---

## Security & PDPA

See `docs/SECURITY.md` for the full write-up. Highlights:

- **Data minimization** — the schema physically cannot hold patient identifiers; there
  are no columns for them. This is PDPA *"collect only what's necessary"* by design.
- **Tokens are hashed** — only `sha256` hashes of staff QR tokens and public codes are
  stored. Tokens support expiry, revocation, reissue, one active journey binding, and
  are revoked automatically on `COMPLETED`/`CANCELLED`.
- **Staff QR ≠ public code** — separate tables, separate lifecycles.
- **Least-privilege RLS** — every role sees and edits only its stage; PR never reads the
  `journeys` table directly, only the audited `public_status_lookup` RPC.
- **Server time only** — all timestamps are `now()` in Postgres; the client clock is
  never trusted.
- **Append-only audit** — logins, status changes, QR events, and every public lookup are
  recorded; history is preserved even after a journey closes.

---

## Accessibility & UX floor

Built to a quality floor: 4.5:1 text contrast, 44×44px touch targets, visible keyboard
focus rings, `prefers-reduced-motion` respected, and status is **never conveyed by color
alone** — every status shows an icon + Thai label + color + timestamp together.
