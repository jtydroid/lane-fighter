// The rules panel under the device: pick a preset, then change any rule.
//
// Edits are a draft until Apply, which restarts the game with the new rules.
// The applied preset + changes are kept in the URL (see custom-rules.js).

import { VARIANTS, resolveVariant } from './variants.js';
import { RULE_TABS, RULE_INFO } from './rule-meta.js';
import { parseRuleValue, buildRules, rulesToSearch } from './custom-rules.js';

const TAB_KEY = 'lanefighter.rulesTab';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// Shown and typed as a whole-number percentage; stored as 0..1.
const toField = (info, v) => (info.type === 'chance' ? String(Math.round(v * 100)) : String(v));
const fromField = (info, text) => (info.type === 'chance' ? String(Number(text) / 100) : text);
const display = (info, v) => (info.type === 'bool' ? (v ? 'on' : 'off') : info.type === 'chance' ? `${Math.round(v * 100)}%` : String(v));

export function setupRulesPanel({ variant, overrides, errors = [], onApply, onFocus }) {
  let applied = { variant, overrides: { ...overrides } };
  let draft = { ...overrides };
  const fieldErrors = {}; // key -> message for fields that don't parse

  const presetSelect = $('variant-select');
  const desc = $('variant-desc');
  const status = $('rules-status');
  const tabList = $('rule-tabs');
  const panels = $('rule-tabpanels');
  const errorBox = $('rules-errors');
  const applyBtn = $('rules-apply');
  const revertBtn = $('rules-revert');
  const resetBtn = $('rules-reset');
  const shareBtn = $('rules-share');

  // --- Preset picker ---
  for (const [id, v] of Object.entries(VARIANTS)) presetSelect.add(new Option(v.name, id));
  presetSelect.value = variant.id;
  presetSelect.addEventListener('change', () => {
    // A preset replaces everything, including unapplied edits.
    apply(resolveVariant(presetSelect.value), {});
  });

  // --- Tabs ---
  let activeTab = RULE_TABS[0].id;
  try {
    const saved = localStorage.getItem(TAB_KEY);
    if (RULE_TABS.some((t) => t.id === saved)) activeTab = saved;
  } catch {}

  const inputs = {}; // key -> { input, row, hint, reset }
  const tabButtons = {};
  for (const tab of RULE_TABS) {
    const btn = el('button', {
      type: 'button',
      id: `tab-${tab.id}`,
      role: 'tab',
      className: 'tab',
    });
    btn.setAttribute('aria-controls', `panel-${tab.id}`);
    btn.append(el('span', { textContent: tab.label }), el('span', { className: 'tab-count' }));
    btn.addEventListener('click', () => selectTab(tab.id, true));
    tabButtons[tab.id] = btn;
    tabList.append(btn);

    const panel = el('div', { id: `panel-${tab.id}`, role: 'tabpanel', className: 'rule-grid' });
    panel.setAttribute('aria-labelledby', btn.id);
    for (const info of tab.rules) panel.append(ruleRow(info));
    panels.append(panel);
  }

  tabList.addEventListener('keydown', (e) => {
    const ids = RULE_TABS.map((t) => t.id);
    const i = ids.indexOf(activeTab);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: ids.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    selectTab(ids[(next + ids.length) % ids.length], true);
  });

  function selectTab(id, focus = false) {
    activeTab = id;
    try { localStorage.setItem(TAB_KEY, id); } catch {}
    for (const tab of RULE_TABS) {
      const on = tab.id === id;
      tabButtons[tab.id].setAttribute('aria-selected', String(on));
      tabButtons[tab.id].tabIndex = on ? 0 : -1;
      $(`panel-${tab.id}`).hidden = !on;
    }
    if (focus) {
      tabButtons[id].focus();
      tabButtons[id].scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
  }

  function ruleRow(info) {
    const id = `rule-${info.key}`;
    let input;
    if (info.type === 'bool') {
      input = el('input', { type: 'checkbox', id, className: 'switch' });
      input.addEventListener('change', () => edit(info, input.checked ? 'true' : 'false'));
    } else {
      input = el('input', {
        type: 'number',
        id,
        inputMode: 'numeric',
        min: info.type === 'chance' ? 0 : info.min,
        max: info.type === 'chance' ? 100 : info.max,
        step: info.type === 'chance' ? 5 : 1,
      });
      input.addEventListener('input', () => edit(info, fromField(info, input.value)));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); applyDraft(); }
      });
    }
    const unit = info.type === 'chance' ? el('span', { className: 'unit', textContent: '%' }) : '';
    const reset = el('button', { type: 'button', className: 'rule-reset', textContent: '↺', title: 'Back to the preset value' });
    reset.setAttribute('aria-label', `Reset ${info.label} to the preset value`);
    reset.addEventListener('click', () => {
      delete draft[info.key];
      delete fieldErrors[info.key];
      refresh(true);
    });
    const hint = el('span', { className: 'rule-hint' });
    const row = el(
      'div',
      { className: 'rule' },
      el('label', { htmlFor: id, className: 'rule-label', textContent: info.label }),
      el('span', { className: 'rule-input' }, input, unit, reset),
      el('p', { className: 'rule-help', textContent: info.help }, ' ', hint),
    );
    inputs[info.key] = { input, row, hint, reset };
    return row;
  }

  function edit(info, text) {
    try {
      const v = parseRuleValue(info.key, text);
      delete fieldErrors[info.key];
      if (v === applied.variant.rules[info.key]) delete draft[info.key];
      else draft[info.key] = v;
    } catch (err) {
      fieldErrors[info.key] = err.message;
    }
    refresh(false);
  }

  // --- Actions ---
  applyBtn.addEventListener('click', applyDraft);
  revertBtn.addEventListener('click', () => {
    draft = { ...applied.overrides };
    for (const k of Object.keys(fieldErrors)) delete fieldErrors[k];
    refresh(true);
  });
  resetBtn.addEventListener('click', () => apply(applied.variant, {}));
  shareBtn.addEventListener('click', async () => {
    const url = location.origin + location.pathname + rulesToSearch(applied.variant.id, applied.overrides);
    try {
      await navigator.clipboard.writeText(url);
      flash(shareBtn, 'Link copied');
    } catch {
      window.prompt('Copy this link to share these rules:', url);
    }
  });

  function applyDraft() {
    const bad = Object.values(fieldErrors);
    if (bad.length) return showErrors(bad);
    apply(applied.variant, draft);
  }

  function apply(v, o) {
    const built = buildRules(v, o);
    if (built.error) return showErrors([built.error]);
    applied = { variant: v, overrides: { ...o } };
    draft = { ...o };
    for (const k of Object.keys(fieldErrors)) delete fieldErrors[k];
    presetSelect.value = v.id;
    onApply(v, applied.overrides, built.rules);
    showErrors([]);
    refresh(true);
    document.activeElement?.blur?.(); // hand the keyboard back to the game
  }

  function showErrors(list) {
    errorBox.replaceChildren(...list.map((m) => el('span', { textContent: m })));
    errorBox.hidden = !list.length;
  }

  function flash(btn, text) {
    const old = btn.textContent;
    btn.textContent = text;
    setTimeout(() => { btn.textContent = old; }, 1500);
  }

  // Sync every field, badge and button with the draft. `values` also rewrites
  // the input boxes (skipped while typing, so the cursor isn't disturbed).
  function refresh(values) {
    const preset = applied.variant.rules;
    for (const [key, { input, row, hint, reset }] of Object.entries(inputs)) {
      const info = RULE_INFO[key];
      const value = Object.hasOwn(draft, key) ? draft[key] : preset[key];
      if (values) {
        if (info.type === 'bool') input.checked = value;
        else input.value = toField(info, value);
      }
      const changed = Object.hasOwn(draft, key);
      const pending = changed !== Object.hasOwn(applied.overrides, key) || (changed && draft[key] !== applied.overrides[key]);
      row.classList.toggle('changed', changed);
      row.classList.toggle('pending', pending);
      row.classList.toggle('invalid', Boolean(fieldErrors[key]));
      input.setAttribute('aria-invalid', String(Boolean(fieldErrors[key])));
      reset.hidden = !changed && !fieldErrors[key];
      hint.textContent = fieldErrors[key] ?? (changed ? `${applied.variant.name}: ${display(info, preset[key])}` : '');
    }
    for (const tab of RULE_TABS) {
      const n = tab.rules.filter((r) => Object.hasOwn(draft, r.key)).length;
      const badge = tabButtons[tab.id].querySelector('.tab-count');
      badge.textContent = n ? String(n) : '';
      badge.hidden = !n;
    }
    const dirty =
      Object.keys(fieldErrors).length > 0 ||
      JSON.stringify(rulesToSearch('x', draft)) !== JSON.stringify(rulesToSearch('x', applied.overrides));
    const changedCount = Object.keys(applied.overrides).length;
    applyBtn.disabled = !dirty;
    revertBtn.hidden = !dirty;
    resetBtn.disabled = !changedCount && !Object.keys(draft).length;
    desc.textContent = applied.variant.description;
    status.textContent = dirty
      ? 'Unapplied changes. Apply restarts the game.'
      : changedCount
        ? `${applied.variant.name} with ${changedCount} rule${changedCount === 1 ? '' : 's'} changed`
        : `${applied.variant.name} rules`;
  }

  // Pause the game while the player works in the panel.
  $('rules-panel').addEventListener('focusin', onFocus);

  selectTab(activeTab);
  refresh(true);
  showErrors(errors);
}
