// Pulse desktop plugin for Hermes (id 'pulse-page', route /pulse).
// Install: <hermes home>\desktop-plugins\pulse-page\plugin.js (the folder name must equal the id).
// Then run "Reload desktop plugins" or restart the app.
//
// Reads the Pulse feed from the Hermes dashboard (plugin conduit_push) and writes back
// Done / rate / dismiss through the same endpoints the Conduit app and the Hermes web UI use.
// Status: checked for syntax only. Report problems as issues.

import React from 'react'
import { host, PALETTE_AREA, ROUTES_AREA, SIDEBAR_NAV_AREA } from '@hermes/plugin-sdk'

const e = React.createElement
const ID = 'pulse-page'
const PATH = '/pulse'
const BASE = '/api/plugins/conduit_push/pulse'
const FEED = BASE + '/feed'

const KIND_LABEL = {
  followup: 'Follow-up',
  deadline: 'Deadline',
  next: 'Next step',
  brief: 'Morning brief',
  noticed: 'Noticed',
  report: 'Report',
}
const LEVEL_LABEL = { push: 'notification', screen: 'in Pulse', brief: 'brief', off: 'off' }
const REASONS = [
  ['not_relevant', 'Not relevant'],
  ['already_knew', 'Already knew'],
  ['too_late', 'Too late'],
  ['too_often', 'Too often'],
  ['wrong_time', 'Wrong time'],
]
const LATER = [
  ['later_today', 'Later today'],
  ['tomorrow', 'Tomorrow'],
  ['next_week', 'Next week'],
  ['', 'Forever'],
]

// Day key (YYYY-MM-DD) in local time, used to group morning briefs per day.
function dayKey(epoch) {
  const d = new Date(Number(epoch) * 1000)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function dayLabel(key) {
  const today = dayKey(Date.now() / 1000)
  const yesterday = dayKey(Date.now() / 1000 - 86400)
  if (key === today) return 'Today'
  if (key === yesterday) return 'Yesterday'
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
}

function when(epoch) {
  if (!epoch) return ''
  return new Date(Number(epoch) * 1000).toLocaleString('en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function call(path, method, body) {
  const api = window.hermesDesktop && window.hermesDesktop.api
  if (!api) return Promise.reject(new Error('hermesDesktop.api is not available'))
  return api({ path, method, body })
}

// "Do it" text: the same wording the Conduit iPhone app uses.
function doItText(card) {
  return 'Pulse reminded me: ' + (card.title || card.news || '').trim() + "\n\nLet's take care of it now."
}

// The desktop app has no public call to start a chat with a prefilled prompt (yet).
// Fallback: put the prompt on the clipboard and open the chats.
async function doIt(card, setMsg) {
  const text = doItText(card)
  const h = window.hermesDesktop || {}
  if (host && typeof host.startChat === 'function') {
    await host.startChat({ prompt: text, profile: card.profile || undefined })
    return 'New chat started.'
  }
  if (h.newSession && typeof h.newSession === 'function') {
    await h.newSession({ prompt: text, profile: card.profile || undefined })
    return 'New chat started.'
  }
  try {
    await navigator.clipboard.writeText(text)
  } catch (err) {
    // clipboard not available
  }
  if (host && typeof host.navigate === 'function') host.navigate('/')
  setMsg('This app cannot start a chat with a prompt yet. The task is on your clipboard: paste it into a new chat.')
  return null
}

const ICON = {
  done: 'M4 12l5 5L20 6',
  up: 'M7 11v9H4v-9h3zm0 0l4-7c1.2 0 2 .9 2 2v3h5.2c1.1 0 1.9 1 1.7 2.1l-1.3 7.2c-.2 1-1 1.7-2 1.7H7',
  down: 'M17 13V4h3v9h-3zm0 0l-4 7c-1.2 0-2-.9-2-2v-3H5.8c-1.1 0-1.9-1-1.7-2.1l1.3-7.2C5.6 6.7 6.4 6 7.4 6H17',
}

function Icon({ d }) {
  return e(
    'svg',
    { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
    e('path', { d })
  )
}

// Pill button with optional icon.
function Btn({ label, icon, onClick, active, disabled, primary }) {
  const base = 'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors '
  const cls = primary
    ? base + 'bg-(--ui-accent) text-white'
    : base + (active ? 'bg-(--ui-accent) text-white' : 'bg-(--ui-bg-card) text-(--ui-text-secondary) border border-(--ui-stroke-secondary) hover:text-(--ui-text-primary)')
  return e(
    'button',
    { className: cls + (disabled ? ' opacity-50' : ''), disabled: !!disabled, onClick, 'aria-label': label, title: label },
    icon ? e(Icon, { d: icon }) : null,
    label ? e('span', null, label) : null
  )
}

function Dot({ kind }) {
  const color = kind === 'followup' ? 'var(--ui-accent)' : 'var(--ui-text-tertiary)'
  return e('span', { style: { width: 8, height: 8, borderRadius: 999, background: color, display: 'inline-block' } })
}

// Dropdown for the list filter. A custom menu, because the built-in select ignores theme colours.
function ViewMenu({ view, setView, counts }) {
  const [open, setOpen] = React.useState(false)
  const items = [
    ['open', 'Open (' + counts.open + ')'],
    ['done', 'Done (' + counts.done + ')'],
    ['all', 'All'],
  ]
  const current = items.find((i) => i[0] === view)[1]
  return e(
    'div',
    { className: 'relative' },
    e(
      'button',
      {
        onClick: () => setOpen(!open),
        className: 'flex items-center gap-2 rounded-full border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-3.5 py-1.5 text-sm text-(--ui-text-primary)',
      },
      current,
      e('span', { className: 'text-(--ui-text-tertiary)' }, '⌄')
    ),
    open
      ? e(
          'div',
          {
            className: 'absolute right-0 z-50 mt-1 flex w-40 flex-col overflow-hidden rounded-xl border border-(--ui-stroke-secondary) p-1 shadow-2xl',
            // Opaque on purpose: no see-through cards behind the menu.
            style: { background: '#16214a', zIndex: 60, boxShadow: '0 12px 30px rgba(0,0,0,0.55)' },
          },
          items.map(([k, label]) =>
            e(
              'button',
              {
                key: k,
                onClick: () => {
                  setView(k)
                  setOpen(false)
                },
                className:
                  'rounded-lg px-3 py-2 text-left text-sm text-(--ui-text-primary) hover:bg-(--ui-bg-hover, rgba(255,255,255,0.08))' +
                  (k === view ? ' font-semibold' : ''),
              },
              label
            )
          )
        )
      : null
  )
}

function Card({ card, reload }) {
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState(null)
  const [pick, setPick] = React.useState(null) // 'down' | 'later' | null
  const [askDo, setAskDo] = React.useState(false)
  const title = card.title || card.news || '(no text)'
  const meta = [KIND_LABEL[card.kind] || card.kind, LEVEL_LABEL[card.level], card.chat_title, when(card.created_at)]
    .filter(Boolean)
    .join(' · ')

  const act = (path, body) => {
    setBusy(true)
    setErr(null)
    call(BASE + path, 'POST', body)
      .then(() => {
        setPick(null)
        reload()
      })
      .catch((x) => {
        setErr(String((x && x.message) || x))
        setBusy(false)
      })
  }

  return e(
    'div',
    { className: 'flex flex-col gap-3 rounded-2xl border border-(--ui-stroke-secondary) bg-(--ui-bg-card) p-5' },
    e(
      'div',
      { className: 'flex items-center gap-2 text-xs' },
      e(Dot, { kind: card.kind }),
      e(
        'span',
        {
          className: 'font-medium',
          style: { color: card.kind === 'followup' ? 'var(--ui-accent)' : 'var(--ui-text-tertiary)' },
        },
        KIND_LABEL[card.kind] || card.kind
      ),
      e('span', { className: 'text-(--ui-text-tertiary)' }, '· ' + [LEVEL_LABEL[card.level], card.chat_title, when(card.created_at)].filter(Boolean).join(' · '))
    ),
    e('div', { className: 'text-base leading-relaxed text-(--ui-text-primary)' }, title),
    card.news && card.news !== card.title ? e('div', { className: 'text-sm text-(--ui-text-secondary)' }, card.news) : null,
    e(
      'div',
      { className: 'flex flex-wrap items-center gap-2 pt-1' },
      card.kind === 'followup' || card.kind === 'noticed'
        ? e(Btn, { label: 'Do it', icon: 'M5 12h12M13 6l6 6-6 6', primary: true, disabled: busy, onClick: () => setAskDo(!askDo) })
        : null,
      e(Btn, {
        label: card.done_at ? 'Undo' : 'Done',
        icon: ICON.done,
        disabled: busy,
        active: !!card.done_at,
        onClick: () => act('/done', { card: card.id, done: !card.done_at }),
      }),
      e('span', { className: 'grow' }),
      // Morning briefs get no "Not now": they are per day, not something to snooze.
      card.kind === 'brief'
        ? null
        : e(Btn, { label: 'Not now', disabled: busy, onClick: () => setPick(pick === 'later' ? null : 'later') }),
      e(Btn, { icon: ICON.up, label: 'Good', disabled: busy, onClick: () => act('/rate', { card: card.id, rating: 'up' }) }),
      e(Btn, { icon: ICON.down, label: 'Not good', disabled: busy, onClick: () => setPick(pick === 'down' ? null : 'down') })
    ),
    askDo
      ? e(
          'div',
          { className: 'flex flex-col gap-2 rounded-xl border border-(--ui-stroke-secondary) p-3' },
          e('div', { className: 'text-sm text-(--ui-text-secondary)' }, 'Start a new chat to do this task?'),
          e(
            'div',
            { className: 'flex gap-2' },
            e(Btn, {
              label: 'Start',
              primary: true,
              disabled: busy,
              onClick: () => {
                setBusy(true)
                doIt(card, (m) => setErr(m))
                  .then((m) => {
                    setBusy(false)
                    setAskDo(false)
                    if (m) setErr(m)
                  })
                  .catch((x) => {
                    setBusy(false)
                    setErr('Failed: ' + String((x && x.message) || x))
                  })
              },
            }),
            e(Btn, { label: 'Cancel', onClick: () => setAskDo(false) })
          )
        )
      : null,
    pick === 'down'
      ? e(
          'div',
          { className: 'flex flex-wrap gap-2' },
          REASONS.map(([k, l]) =>
            e(Btn, { key: k, label: l, disabled: busy, onClick: () => act('/rate', { card: card.id, rating: 'down', reason: k }) })
          )
        )
      : null,
    pick === 'later'
      ? e(
          'div',
          { className: 'flex flex-wrap gap-2' },
          LATER.map(([k, l]) =>
            e(Btn, {
              key: l,
              label: l,
              disabled: busy,
              onClick: () => (k ? act('/dismiss', { card: card.id, dismissed: true, until: k }) : act('/dismiss', { card: card.id, dismissed: true })),
            })
          )
        )
      : null,
    err ? e('div', { className: 'text-xs text-(--ui-text-secondary)' }, err) : null
  )
}

// ---------- Settings (same options as the Pulse screen in the Conduit app, minus phone-only ones) ----------
const WEEKDAYS = [
  ['Mon', 0],
  ['Tue', 1],
  ['Wed', 2],
  ['Thu', 3],
  ['Fri', 4],
  ['Sat', 5],
  ['Sun', 6],
]
const NUDGE_LABEL = {
  gentle: ['Gentle', 'A heads-up on what is open or coming due: about one reminder a day.'],
  balanced: ['Balanced', 'A heads-up on what is open or coming due: three reminders a day.'],
  eager: ['Eager', 'More reminders and quicker follow-ups: up to six a day.'],
}

function Section({ title, hint, children }) {
  return e(
    'div',
    { className: 'flex flex-col gap-3 rounded-2xl border border-(--ui-stroke-secondary) bg-(--ui-bg-card) p-5' },
    e('div', { className: 'text-sm font-semibold text-(--ui-text-primary)' }, title),
    hint ? e('div', { className: 'text-xs text-(--ui-text-tertiary)' }, hint) : null,
    children
  )
}

function Toggle({ label, desc, checked, onChange, disabled }) {
  return e(
    'label',
    { className: 'flex cursor-pointer flex-col gap-1' },
    e(
      'div',
      { className: 'flex items-center justify-between gap-4' },
      e('span', { className: 'text-sm text-(--ui-text-primary)' }, label),
      e('input', {
        type: 'checkbox',
        checked: !!checked,
        disabled: !!disabled,
        onChange: (ev) => onChange(ev.target.checked),
        className: 'h-5 w-9 cursor-pointer accent-(--ui-accent)',
      })
    ),
    desc ? e('span', { className: 'text-xs text-(--ui-text-tertiary)' }, desc) : null
  )
}

function SettingsPanel({ onBack }) {
  const [st, setSt] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState(null)
  const [note, setNote] = React.useState('')
  const [addTime, setAddTime] = React.useState('')

  const load = React.useCallback(() => {
    call(BASE, 'GET')
      .then((s) => {
        setSt(s)
        setNote(s.note || '')
      })
      .catch((x) => setErr('Failed to load settings: ' + String((x && x.message) || x)))
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  // Each change is saved at once; the server answers with the new state.
  const save = (patch) => {
    setBusy(true)
    setErr(null)
    call(BASE, 'PUT', patch)
      .then((s) => {
        setSt(s)
        setNote(s.note || '')
        setBusy(false)
      })
      .catch((x) => {
        setErr('Not saved: ' + String((x && x.message) || x))
        setBusy(false)
        load()
      })
  }

  if (!st) return e('div', { className: 'p-6 text-sm text-(--ui-text-tertiary)' }, err || 'Loading…')

  const days = Array.isArray(st.quiet_days) ? st.quiet_days : []
  const times = Array.isArray(st.report_times) ? st.report_times : []
  const nightOn = Array.isArray(st.night) && st.night.length === 2
  const nudge = st.nudge || 'balanced'

  const toggleDay = (d) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort()
    save({ quiet_days: next })
  }
  const setNight = (on, from, to) => {
    if (!on) return save({ night: [] })
    save({ night: [from || '22:00', to || '07:00'] })
  }

  return e(
    'div',
    { className: 'mx-auto flex w-full max-w-2xl flex-col gap-4 overflow-y-auto p-6' },
    e(
      'div',
      { className: 'flex items-center justify-between' },
      e('h1', { className: 'text-3xl font-bold tracking-tight text-(--ui-text-primary)' }, 'Pulse settings'),
      e(Btn, { label: 'Back to Pulse', onClick: onBack })
    ),
    err ? e('div', { className: 'text-xs text-(--ui-text-secondary)' }, err) : null,
    e(Section, { title: 'Pulse' },
      e(Toggle, {
        label: 'Pulse',
        desc: 'Off: Pulse makes no cards and sends nothing.',
        checked: st.enabled,
        disabled: busy,
        onChange: (v) => save({ enabled: v }),
      })
    ),
    e(Section, { title: 'When Pulse speaks up', hint: 'How often Pulse brings things up.' },
      e('div', { className: 'flex gap-2' }, Object.keys(NUDGE_LABEL).map((k) =>
        e(Btn, { key: k, label: NUDGE_LABEL[k][0], active: nudge === k, disabled: busy, onClick: () => save({ nudge: k }) })
      )),
      e('div', { className: 'text-xs text-(--ui-text-tertiary)' }, NUDGE_LABEL[nudge] ? NUDGE_LABEL[nudge][1] : '')
    ),
    e(Section, { title: 'Look through your chats', hint: 'Pulse looks through your recent chats at these times.' },
      e(Toggle, {
        label: 'Look through your chats',
        checked: st.look_ahead,
        disabled: busy,
        onChange: (v) => save({ look_ahead: v }),
      }),
      e('div', { className: 'flex flex-col gap-2' },
        times.map((t) =>
          e('div', { key: t, className: 'flex items-center justify-between rounded-xl border border-(--ui-stroke-secondary) px-3 py-2' },
            e('span', { className: 'text-sm text-(--ui-text-primary)' }, t),
            e(Btn, {
              label: 'Remove',
              disabled: busy || times.length <= 1,
              onClick: () => save({ report_times: times.filter((x) => x !== t) }),
            }))
        )
      ),
      e('div', { className: 'flex items-center gap-2' },
        e('input', {
          type: 'time',
          value: addTime,
          onChange: (ev) => setAddTime(ev.target.value),
          className: 'rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-2 py-1 text-sm text-(--ui-text-primary)',
        }),
        e(Btn, {
          label: 'Add a time',
          disabled: busy || !addTime || times.includes(addTime) || times.length >= 12,
          onClick: () => {
            save({ report_times: [...times, addTime].sort() })
            setAddTime('')
          },
        }))
    ),
    e(Section, { title: 'Morning brief', hint: 'Every day at this time: what is still open, today\u2019s calendar and reminders.' },
      e('input', {
        type: 'time',
        value: st.brief_time || '07:00',
        disabled: busy,
        onChange: (ev) => ev.target.value && save({ brief_time: ev.target.value }),
        className: 'w-40 rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-2 py-1 text-sm text-(--ui-text-primary)',
      })
    ),
    e(Section, { title: 'Quiet times', hint: 'On quiet days, Pulse sends nothing on its own. It keeps remembering.' },
      e('div', { className: 'text-sm text-(--ui-text-primary)' }, 'Quiet days'),
      e('div', { className: 'flex flex-wrap gap-2' }, WEEKDAYS.map(([label, n]) =>
        e(Btn, { key: n, label, active: days.includes(n), disabled: busy, onClick: () => toggleDay(n) })
      )),
      e(Toggle, {
        label: 'Quiet until the end of today',
        desc: 'Pulse stays quiet for the rest of today.',
        checked: st.quiet_until === 'today',
        disabled: busy,
        onChange: (v) => save({ quiet_until: v ? 'today' : null }),
      })
    ),
    e(Section, { title: 'Night', hint: 'Between these times Pulse pushes nothing; notifications wait for the morning brief.' },
      e(Toggle, {
        label: 'Night',
        checked: nightOn,
        disabled: busy,
        onChange: (v) => setNight(v, nightOn ? st.night[0] : '22:00', nightOn ? st.night[1] : '07:00'),
      }),
      nightOn
        ? e('div', { className: 'flex flex-wrap gap-4' },
            e('label', { className: 'flex items-center gap-2 text-sm text-(--ui-text-primary)' }, 'Starts',
              e('input', {
                type: 'time',
                value: st.night[0],
                disabled: busy,
                onChange: (ev) => ev.target.value && setNight(true, ev.target.value, st.night[1]),
                className: 'rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-2 py-1 text-sm text-(--ui-text-primary)',
              })),
            e('label', { className: 'flex items-center gap-2 text-sm text-(--ui-text-primary)' }, 'Ends',
              e('input', {
                type: 'time',
                value: st.night[1],
                disabled: busy,
                onChange: (ev) => ev.target.value && setNight(true, st.night[0], ev.target.value),
                className: 'rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-2 py-1 text-sm text-(--ui-text-primary)',
              })))
        : null
    ),
    e(Section, { title: 'What you want from Pulse', hint: 'Pulse reads this before every report, brief and reminder. Max 1500 characters.' },
      e('textarea', {
        value: note,
        maxLength: 1500,
        rows: 4,
        disabled: busy,
        onChange: (ev) => setNote(ev.target.value),
        onBlur: () => { if (note !== (st.note || '')) save({ note }) },
        placeholder: 'What to always bring up, what to leave out',
        className: 'w-full rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-card) p-3 text-sm text-(--ui-text-primary)',
      })
    ),
    e(Section, { title: 'What Pulse reads' },
      e(Toggle, {
        label: 'Memory',
        desc: 'Pulse keeps short notes on promises, plans and dates, so it can bring them up later.',
        checked: st.memory,
        disabled: busy,
        onChange: (v) => save({ memory: v }),
      }),
      e(Toggle, {
        label: 'Deadlines from Shortcuts',
        desc: 'With memory on, Pulse also looks for deadlines in what your Shortcuts automations log.',
        checked: st.inbox_deadlines,
        disabled: busy,
        onChange: (v) => save({ inbox_deadlines: v }),
      }),
      e(Toggle, {
        label: 'Look things up first',
        desc: 'Before Pulse writes to you, it can look things up and search the web when following up on a promise. It never changes anything itself.',
        checked: st.look_first,
        disabled: busy,
        onChange: (v) => save({ look_first: v }),
      })
    )
  )
}

function PulsePage() {
  const [state, setState] = React.useState({ loading: true, error: null, cards: [] })
  const [day, setDay] = React.useState(null)
  const [view, setView] = React.useState('open')
  const [settingsOpen, setSettingsOpen] = React.useState(false)

  const load = React.useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }))
    call(FEED, 'GET')
      .then((data) => setState({ loading: false, error: null, cards: (data && data.cards) || [] }))
      .catch((err) => setState({ loading: false, error: String((err && err.message) || err), cards: [] }))
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  if (settingsOpen) return e(SettingsPanel, { onBack: () => { setSettingsOpen(false); load() } })
  if (state.loading) return e('div', { className: 'p-6 text-sm text-(--ui-text-tertiary)' }, 'Loading…')
  if (state.error) return e('div', { className: 'p-6 text-sm text-(--ui-red)' }, 'Failed to load Pulse: ' + state.error)

  // Morning briefs are grouped per day; one day is shown at a time.
  const isBrief = (c) => c.kind === 'brief'
  const briefDays = [...new Set(state.cards.filter(isBrief).map((c) => dayKey(c.created_at)))].sort().reverse()
  const today = dayKey(Date.now() / 1000)
  const activeDay = day || (briefDays.includes(today) ? today : briefDays[0] || null)
  const pinned = state.cards.filter((c) => isBrief(c) && !c.done_at && (!activeDay || dayKey(c.created_at) === activeDay))

  const open = state.cards.filter((c) => !c.done_at && !isBrief(c))
  const done = state.cards.filter((c) => c.done_at)
  const showOpen = view !== 'done'
  const showDone = view !== 'open'

  const head = (t) => e('div', { className: 'pt-2 text-sm font-medium text-(--ui-text-tertiary)' }, t)
  return e(
    'div',
    { className: 'mx-auto flex w-full max-w-2xl flex-col gap-4 overflow-y-auto p-6' },
    e(
      'div',
      { className: 'flex items-center justify-between' },
      e('h1', { className: 'text-3xl font-bold tracking-tight text-(--ui-text-primary)' }, 'Pulse'),
      e(
        'div',
        { className: 'flex items-center gap-2' },
        e(ViewMenu, { view, setView, counts: { open: open.length, done: done.length } }),
        e(Btn, { label: 'Refresh', onClick: load }),
        e(Btn, { label: 'Settings', onClick: () => setSettingsOpen(true) })
      )
    ),
    briefDays.length
      ? e(
          'div',
          { className: 'flex flex-wrap gap-2' },
          briefDays.map((k) => e(Btn, { key: k, label: dayLabel(k), active: k === activeDay, onClick: () => setDay(k) }))
        )
      : null,
    pinned.length ? head('Pinned') : null,
    pinned.length ? e('div', { className: 'flex flex-col gap-3' }, pinned.map((c) => e(Card, { key: c.id, card: c, reload: load }))) : null,
    showOpen && open.length ? head('New') : null,
    showOpen && open.length
      ? e('div', { className: 'flex flex-col gap-3' }, open.map((c) => e(Card, { key: c.id, card: c, reload: load })))
      : showOpen
      ? e('div', { className: 'text-sm text-(--ui-text-tertiary)' }, 'Nothing open.')
      : null,
    showDone && done.length
      ? e(
          'div',
          { className: 'flex flex-col gap-3 opacity-70' },
          head('Done (' + done.length + ')'),
          done.map((c) => e(Card, { key: c.id, card: c, reload: load }))
        )
      : null
  )
}

export default {
  id: ID,
  name: 'Pulse',
  description: 'Pulse cards in the Hermes desktop app: read, Done, Do it, good / not good, Not now, morning brief per day.',
  register(ctx) {
    ctx.registerMany([
      { id: 'page', area: ROUTES_AREA, data: { path: PATH }, render: () => e(PulsePage) },
      { id: 'nav', area: SIDEBAR_NAV_AREA, data: { path: PATH, label: 'Pulse', codicon: 'pulse' } },
      {
        id: 'palette',
        area: PALETTE_AREA,
        data: {
          id: 'pulse-page.open',
          label: 'Open Pulse',
          keywords: ['pulse', 'cards', 'notifications', 'follow up'],
          run: () => host.navigate(PATH),
        },
      },
    ])
  },
}
