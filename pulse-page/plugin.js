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
      e(Btn, { label: 'Not now', disabled: busy, onClick: () => setPick(pick === 'later' ? null : 'later') }),
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

function PulsePage() {
  const [state, setState] = React.useState({ loading: true, error: null, cards: [] })
  const [day, setDay] = React.useState(null)
  const [view, setView] = React.useState('open')

  const load = React.useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }))
    call(FEED, 'GET')
      .then((data) => setState({ loading: false, error: null, cards: (data && data.cards) || [] }))
      .catch((err) => setState({ loading: false, error: String((err && err.message) || err), cards: [] }))
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

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
        e(Btn, { label: 'Refresh', onClick: load })
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
