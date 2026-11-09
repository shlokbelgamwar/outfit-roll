// App shell: tab routing, bottom sheets, pill chips, and small status helpers.
// app.js owns the closet, rolling, and API logic. This file only handles presentation.
const $ = id => document.getElementById(id);

const now = new Date();
const part = now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening';
$('today').textContent = now.toLocaleDateString(undefined, { weekday: 'long' }) + ' ' + part + ' · '
  + now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/* ---------- Tabs ---------- */
const views = ['roll', 'closet', 'moodboard'];
function show(name) {
  if (!views.includes(name)) name = 'roll';
  for (const view of document.querySelectorAll('.view')) view.hidden = view.dataset.view !== name;
  for (const tab of document.querySelectorAll('.tab')) {
    if (tab.dataset.tab === name) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  if (name === 'moodboard') $('mood-dot').hidden = true;
  document.body.dataset.view = name;
  window.scrollTo({ top: 0 });
}
window.addEventListener('hashchange', () => show(location.hash.slice(1)));
show(location.hash.slice(1));

/* ---------- Sheets ---------- */
function openSheet(id) {
  const sheet = $(id);
  if (!sheet.open) sheet.showModal();
}
function closeSheet(sheet) {
  if (!sheet.open || sheet.classList.contains('closing')) return;
  sheet.classList.add('closing');
  setTimeout(() => {
    sheet.classList.remove('closing');
    sheet.style.transform = '';
    sheet.close();
  }, 220);
}
for (const sheet of document.querySelectorAll('.sheet')) {
  // Tap the dimmed backdrop to close.
  sheet.addEventListener('click', event => { if (event.target === sheet) closeSheet(sheet); });
  sheet.addEventListener('cancel', event => { event.preventDefault(); closeSheet(sheet); });
  for (const button of sheet.querySelectorAll('[data-close]')) button.addEventListener('click', () => closeSheet(sheet));

  // Swipe down on the grabber or header to dismiss.
  let startY = null;
  let delta = 0;
  for (const handle of sheet.querySelectorAll('.grabber, .sheet-head')) {
    handle.addEventListener('pointerdown', event => {
      if (event.target.closest('button')) return;
      startY = event.clientY;
      delta = 0;
      sheet.classList.add('dragging');
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
      if (startY === null) return;
      delta = Math.max(0, event.clientY - startY);
      sheet.style.transform = `translateY(${delta}px)`;
    });
    const end = () => {
      if (startY === null) return;
      sheet.classList.remove('dragging');
      startY = null;
      if (delta > 90) closeSheet(sheet);
      else sheet.style.transform = '';
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
}
for (const opener of document.querySelectorAll('[data-open]')) opener.addEventListener('click', () => openSheet(opener.dataset.open));
$('open-filters').addEventListener('click', () => openSheet('sheet-filters'));
$('open-add').addEventListener('click', () => openSheet('sheet-add'));
$('why').addEventListener('click', () => openSheet('sheet-note'));
$('sample').addEventListener('click', () => closeSheet($('sheet-add')));
$('photos').addEventListener('change', () => closeSheet($('sheet-add')));

/* ---------- Filter chips ---------- */
const summary = () => {
  const label = id => $(id).selectedOptions[0].text;
  $('filter-summary').textContent = label('occasion') + ' · ' + label('weather');
};
for (const id of ['occasion', 'weather']) {
  const select = $(id);
  const group = document.querySelector(`[data-chips="${id}"]`);
  const buttons = [];
  for (const option of select.options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip-btn';
    button.textContent = option.value ? option.text : 'Any';
    button.setAttribute('aria-pressed', String(option.selected));
    button.onclick = () => {
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
      summary();
    };
    buttons.push(button);
    group.append(button);
  }
}
summary();

/* ---------- Closet count + empty states ---------- */
const grid = $('closet-grid');
const updateCount = () => {
  const total = grid.children.length;
  $('closet-count').textContent = total ? total + (total === 1 ? ' item' : ' items') : 'No items yet';
  $('tab-count').textContent = total;
  $('tab-count').hidden = !total;
  $('closet-empty').hidden = total > 0;
  $('go-closet').hidden = total > 0;
};
new MutationObserver(updateCount).observe(grid, { childList: true });
updateCount();

/* ---------- Moodboard "new" dot ---------- */
new MutationObserver(() => {
  if ($('inspo-grid').children.length && document.body.dataset.view !== 'moodboard') $('mood-dot').hidden = false;
}).observe($('inspo-grid'), { childList: true });

/* ---------- Roll die spin ---------- */
$('roll').addEventListener('click', () => {
  $('roll').classList.remove('spin');
  void $('roll').offsetWidth;
  $('roll').classList.add('spin');
  // On phones, bring the fresh look into view.
  if (matchMedia('(max-width: 899px)').matches) {
    setTimeout(() => $('result').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }
});

/* ---------- Idle state for the color-match chip ---------- */
const rule = $('rule');
const syncRule = () => rule.classList.toggle('idle', rule.textContent === 'Not rolled yet');
new MutationObserver(syncRule).observe(rule, { childList: true, characterData: true, subtree: true });
syncRule();

/* ---------- First-open welcome ---------- */
// When the closet is empty, offer the sample closet once per visit.
const seen = () => { try { return sessionStorage.getItem('welcome-seen') === '1'; } catch { return false; } };
const markSeen = () => { try { sessionStorage.setItem('welcome-seen', '1'); } catch {} };
let welcomeChecked = false;
const maybeWelcome = () => {
  // app.js enables the sample button once the closet has loaded from storage.
  if (welcomeChecked || $('sample').disabled) return;
  welcomeChecked = true;
  if (grid.children.length === 0 && !seen()) setTimeout(() => openSheet('sheet-welcome'), 350);
};
new MutationObserver(maybeWelcome).observe($('sample'), { attributes: true, attributeFilter: ['disabled'] });
maybeWelcome();
$('sheet-welcome').addEventListener('close', markSeen);
$('welcome-sample').addEventListener('click', () => {
  $('sample').click();
  closeSheet($('sheet-welcome'));
});
$('welcome-own').addEventListener('click', () => {
  closeSheet($('sheet-welcome'));
  location.hash = 'closet';
  setTimeout(() => openSheet('sheet-add'), 300);
});
