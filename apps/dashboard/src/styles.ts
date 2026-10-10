import { css } from "lit";

export const styles = css`
  :host { display: block; position: fixed; inset: 0; background: #fff; font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1c1f1f; }
  * { box-sizing: border-box; }
  button { font: inherit; cursor: pointer; }
  button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible, a:focus-visible { outline: 3px solid #4c8dff; outline-offset: 2px; }
  .meta { font-size: 13px; color: #5a6262; }
  .app { display: flex; height: 100%; min-height: 0; }

  /* Sign in */
  .gate { max-width: 420px; margin: 12vh auto; padding: 0 16px; display: flex; flex-direction: column; gap: 12px; }
  .gate h1 { font-size: 20px; margin: 0; }
  .gate input[type="password"] { min-height: 44px; padding: 0 12px; border: 1px solid #b9bfbf; border-radius: 8px; font: inherit; }
  .gate label.remember { display: flex; gap: 8px; align-items: center; color: #3b4343; }

  /* Sidebar */
  .side { width: 232px; flex: none; border-right: 1px solid #d5d9d9; background: #f7f9f9; padding: 20px 12px; display: flex; flex-direction: column; gap: 4px; overflow: auto; }
  .brand { font-weight: 700; padding: 0 12px 14px; font-size: 15px; }
  .site { display: flex; justify-content: space-between; gap: 8px; align-items: center; width: 100%; text-align: left; padding: 8px 12px; border: 0; border-radius: 8px; background: none; color: #3b4343; }
  .site:hover { background: #eef1f1; }
  .site.on { background: #e8ecec; color: #1c1f1f; font-weight: 600; }
  .badge { background: #1c1f1f; color: #fff; border-radius: 999px; padding: 0 8px; font-size: 12px; font-weight: 600; }
  .badge.zero { background: #c9cfcf; color: #1c1f1f; }
  .grow { flex: 1; }
  .pad { padding: 0 12px; }
  .top { align-items: flex-start; flex-wrap: wrap; }
  .bad { color: #a11; }
  .side .foot { padding: 0 12px; display: flex; flex-direction: column; gap: 8px; }
  .link { border: 0; background: none; padding: 0; color: #1d4fa8; text-decoration: underline; text-align: left; font-size: 13px; }

  /* List */
  .list { width: 460px; flex: none; border-right: 1px solid #d5d9d9; display: flex; flex-direction: column; min-height: 0; }
  .list header { padding: 18px 16px 12px; display: flex; flex-direction: column; gap: 10px; }
  .list h2 { margin: 0; font-size: 17px; }
  .row-between { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .pills { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .pill { border: 1px solid #b9bfbf; border-radius: 999px; padding: 4px 12px; font-size: 13px; background: #fff; color: #1c1f1f; }
  .pill[aria-pressed="true"] { background: #1c1f1f; border-color: #1c1f1f; color: #fff; }
  select { border: 1px solid #b9bfbf; border-radius: 8px; padding: 4px 8px; font: inherit; font-size: 13px; background: #fff; }
  .scroll { flex: 1; overflow: auto; border-top: 1px solid #e4e8e8; }
  .grp { padding: 10px 16px 6px; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: #5a6262; background: #f7f9f9; border-bottom: 1px solid #e4e8e8; position: sticky; top: 0; }
  .li { display: flex; gap: 10px; width: 100%; text-align: left; padding: 10px 16px; border: 0; border-bottom: 1px solid #e4e8e8; background: none; color: inherit; }
  .li:hover { background: #f4f6f6; }
  .li.sel { background: #eef3ff; }
  .li.done { opacity: .7; }
  .dot { flex: none; width: 10px; height: 10px; border-radius: 5px; background: #2f6bff; margin-top: 6px; }
  .done .dot { background: #c9cfcf; }
  .li .t { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .empty { padding: 24px 16px; color: #5a6262; }
  .err { color: #a11; padding: 8px 16px; }
  .err.inline { padding: 0; }

  /* Detail */
  .detail { flex: 1; min-width: 0; padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; overflow: auto; }
  .detail h2 { margin: 0; font-size: 17px; overflow-wrap: anywhere; }
  .actions { display: flex; gap: 8px; flex: none; flex-wrap: wrap; }
  .btn { min-height: 36px; padding: 0 14px; border-radius: 8px; border: 1px solid #1c1f1f; background: #fff; color: #1c1f1f; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; }
  .btn.pri { background: #1c1f1f; color: #fff; }
  .btn.danger { border-color: #a11; color: #a11; }
  .btn[disabled] { opacity: .5; cursor: default; }
  .pinned { background: #f7f9f9; border: 1px solid #e4e8e8; border-radius: 10px; padding: 10px 12px; overflow-wrap: anywhere; }
  .msg { background: #f4f6f6; border-radius: 10px; padding: 10px 12px; }
  .msg p { margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .status { font-weight: 600; color: #1b6b3a; }
  textarea, input[type="text"], input[type="url"] { width: 100%; border: 1px solid #b9bfbf; border-radius: 8px; padding: 10px 12px; font: inherit; }
  textarea { min-height: 84px; resize: vertical; }
  .controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .controls input { flex: 1; min-width: 180px; width: auto; }
  .back { display: none; }
  .none { padding: 48px 24px; color: #5a6262; }
  .settings { display: flex; flex-direction: column; gap: 6px; }

  /* Narrower than a laptop: one column at a time. */
  @media (max-width: 1100px) {
    .side { width: 188px; }
    .list { width: 360px; }
  }
  @media (max-width: 820px) {
    .app { flex-direction: column; }
    .side { width: auto; flex-direction: row; flex-wrap: wrap; border-right: 0; border-bottom: 1px solid #d5d9d9; padding: 10px 12px; align-items: center; gap: 4px; }
    .brand { padding: 0 8px 0 0; }
    .side .foot, .side .grow { display: none; }
    .list { width: auto; flex: 1; border-right: 0; }
    .detail { padding: 16px; }
    .app.reading .list, .app.reading .side { display: none; }
    .app:not(.reading) .detail { display: none; }
    .back { display: inline-flex; }
  }
`;
