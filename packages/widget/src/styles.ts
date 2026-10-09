export const CSS = `
:host { all: initial; }
:host([hidden]) { display: none !important; }
* { box-sizing: border-box; font: inherit; }
:host, .panel, .toolbar, .bar, .pin { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 15px; line-height: 1.4; color: #1c1f1f; }
[hidden] { display: none !important; }
button { cursor: pointer; }
button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 3px solid #4c8dff; outline-offset: 2px; }

/* Toolbar */
.toolbar { position: fixed; z-index: 2147483002; left: 50%; bottom: 16px; transform: translateX(-50%); user-select: none; display: flex; align-items: center; gap: 2px; height: 48px; padding: 0 4px; background: #1c1f1f; color: #fff; border-radius: 999px; box-shadow: 0 8px 28px rgba(0,0,0,.35); max-width: calc(100vw - 16px); }
.sep { width: 1px; height: 22px; background: #4a5252; flex: none; }
.tb { display: flex; align-items: center; gap: 7px; height: 40px; padding: 0 12px; border: 0; border-radius: 999px; background: none; color: #fff; font-weight: 600; font-size: 14px; white-space: nowrap; }
.tb:hover, .tb.on { background: #38403f; }
.tb:focus-visible { outline: 3px solid #4c8dff; outline-offset: -2px; }
.cnt { background: #fff; color: #1c1f1f; border-radius: 999px; min-width: 22px; padding: 0 6px; text-align: center; font-size: 13px; }
.tb-hide, .tb-min { padding: 0 11px; }
.tb-grip { padding: 0 6px 0 10px; cursor: grab; color: #9aa3a3; touch-action: none; }
.toolbar.dragging, .toolbar.dragging * { cursor: grabbing; }
.toolbar.dragging { box-shadow: 0 14px 36px rgba(0,0,0,.45); }
.bubble { display: none; position: relative; width: 48px; height: 48px; margin: 0 -4px; padding: 0; border: 0; border-radius: 999px; background: none; color: #fff; place-items: center; cursor: grab; touch-action: none; }
.bubble:focus-visible { outline: 3px solid #4c8dff; outline-offset: -3px; }
.bcnt { position: absolute; top: -2px; right: -2px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; background: #2f6bff; color: #fff; border: 2px solid #fff; font-size: 11px; font-weight: 700; line-height: 16px; text-align: center; }
.ficon { display: none; }
.toolbar.vertical { flex-direction: column; height: auto; width: 56px; padding: 4px 0; border-radius: 28px; }
.toolbar.vertical .sep { width: 24px; height: 1px; }
.toolbar.vertical .tb { position: relative; width: 48px; height: 44px; padding: 0; justify-content: center; }
.toolbar.vertical .lbl, .toolbar.vertical .ftxt { display: none; }
.toolbar.vertical .ficon { display: inline-flex; }
.toolbar.vertical .tb-grip svg { transform: rotate(90deg); }
.toolbar.vertical .cnt { position: absolute; top: 2px; right: 0; min-width: 18px; padding: 0 4px; font-size: 11px; }
.toolbar.collapsed { padding: 0; width: 48px; }
.toolbar.collapsed > :not(.bubble) { display: none; }
.toolbar.collapsed .bubble { display: grid; }

/* Pins */
.pins { position: fixed; inset: 0; z-index: 2147482990; pointer-events: none; }
.pin { position: fixed; pointer-events: auto; width: 28px; height: 28px; padding: 0; border-radius: 14px 14px 14px 2px; background: #1c1f1f; color: #fff; border: 2px solid #fff; font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,.35); }
.pin.selected, .pin.pending { background: #2f6bff; }
.pin.pending { pointer-events: none; }
.hl { position: fixed; z-index: 2147482999; pointer-events: none; border: 2px solid #4c8dff; background: rgba(76,141,255,.14); border-radius: 4px; transition: all .08s; }
.bar { position: fixed; z-index: 2147483003; top: 12px; left: 50%; transform: translateX(-50%); width: max-content; max-width: calc(100vw - 24px); background: #1c1f1f; color: #fff; padding: 8px 8px 8px 16px; border-radius: 999px; display: flex; align-items: center; gap: 12px; box-shadow: 0 4px 16px rgba(0,0,0,.3); }
.bar .ghost { min-height: 36px; padding: 0 12px; }

/* Panel: a popover on desktop (placed by script), a bottom sheet on phones */
.panel { position: fixed; z-index: 2147483001; left: 0; bottom: 72px; width: 360px; max-height: min(640px, calc(100vh - 96px)); overflow: auto; background: #fff; border: 1px solid #d5d9d9; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.22); padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.panel > .err { margin: 0; }
header { display: flex; align-items: center; gap: 4px; }
h2 { margin: 0; font-size: 16px; font-weight: 700; flex: 1; }
header .back { font-size: 20px; text-decoration: none; color: #1c1f1f; padding: 0 8px 0 0; }
header .x { font-size: 24px; text-decoration: none; color: #1c1f1f; padding: 0 6px; line-height: 1; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid #d5d9d9; }
.tab { flex: 1; background: none; border: 0; border-bottom: 3px solid transparent; padding: 8px 4px; font-weight: 600; color: #5a6262; }
.tab[aria-selected="true"] { color: #1c1f1f; border-bottom-color: #1c1f1f; }
.seg { display: flex; gap: 6px; }
.seg button { border: 1px solid #b9bfbf; background: #fff; border-radius: 999px; padding: 4px 12px; font-size: 13px; }
.seg button[aria-pressed="true"] { background: #1c1f1f; color: #fff; border-color: #1c1f1f; }
.group h3 { margin: 8px 0 6px; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #5a6262; display: flex; gap: 8px; align-items: center; }
.here { background: #e8f0ff; color: #1c1f1f; text-transform: none; letter-spacing: 0; border-radius: 999px; padding: 1px 8px; font-size: 12px; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.item { display: flex; align-items: flex-start; gap: 0; background: #f4f6f6; border-radius: 10px; }
.item.is-resolved { opacity: .75; }
.item .row-btn { flex: 1; min-width: 0; }
.num { flex: none; width: 24px; height: 24px; margin: 12px 0 0 8px; border-radius: 12px; background: #1c1f1f; color: #fff; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.num.none { background: none; width: 4px; margin-left: 4px; }
.row-btn { display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left; background: none; border: 0; padding: 10px 12px; border-radius: 10px; color: inherit; }
.row-btn:hover { background: #eaeeee; }
.snip { overflow-wrap: anywhere; }
.sub { font-size: 13px; color: #5a6262; }
.acts { display: flex; gap: 2px; align-items: center; flex: none; padding: 6px 4px 0 0; }
.icon { width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: 8px; background: none; color: #3b4343; padding: 0; }
.icon:hover { background: #e2e7e7; }
.icon.ok:hover { color: #1b6b3a; }
.icon.bad { color: #a11; }
.confirm { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.empty { margin: 0; color: #5a6262; }
.meta { font-size: 13px; color: #5a6262; }
.form, .msgs { display: flex; flex-direction: column; gap: 8px; }
input, textarea { width: 100%; padding: 10px 12px; border: 1px solid #b9bfbf; border-radius: 8px; background: #fff; color: inherit; font-size: 16px; }
textarea { resize: vertical; }
.row { display: flex; gap: 8px; justify-content: space-between; }
.row.end { justify-content: flex-end; }
.primary, .ghost, .danger { min-height: 44px; padding: 0 16px; border-radius: 8px; font-weight: 600; border: 1px solid #1c1f1f; }
.primary { background: #1c1f1f; color: #fff; }
.primary:disabled { opacity: .6; cursor: default; }
.ghost { background: #fff; color: #1c1f1f; }
.danger { background: #a11; color: #fff; border-color: #a11; }
.small { min-height: 36px; padding: 0 12px; }
.block { width: 100%; }
.link { background: none; border: 0; padding: 4px 0; color: #1d4fa8; text-align: left; text-decoration: underline; font-size: 13px; }
.chip { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #e8f0ff; border-radius: 8px; padding: 6px 10px; font-size: 13px; }
.chip .link { text-decoration: none; font-size: 18px; color: #1c1f1f; }
.err { margin: 0; color: #a11; font-size: 14px; }
.note { margin: 0; font-size: 13px; color: #5a6262; }
.thead { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.where { margin: 0; font-size: 13px; color: #5a6262; }
.warn { margin: 0; font-size: 13px; background: #fff4d6; border-radius: 8px; padding: 6px 10px; }
.msg { background: #f4f6f6; border-radius: 10px; padding: 10px 12px; }
.msg p { margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.status { margin: 0; font-size: 13px; color: #5a6262; }
.status.ok { color: #1b6b3a; font-weight: 600; }
.namerow { display: flex; gap: 8px; }
.who { margin: 0; font-size: 13px; color: #5a6262; }
.inline { display: flex; flex-direction: column; gap: 8px; background: #f4f6f6; border-radius: 10px; padding: 10px; }

@media (max-width: 480px) {
  .tb .lbl { display: none; }
  .tb { padding: 0 11px; }
}
@media (max-width: 640px) {
  .panel { left: 0; right: 0; bottom: 0; width: auto; max-height: 85vh; border-radius: 16px 16px 0 0; border-width: 1px 0 0; padding-bottom: calc(76px + env(safe-area-inset-bottom)); }
}
@media (prefers-reduced-motion: reduce) { .hl { transition: none; } }
`;
