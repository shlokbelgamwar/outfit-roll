import { samples, rollOutfit } from './wardrobe.js';

const $ = id => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};
const paths = {
  top: 'M48 31 66 23 Q80 43 94 23 L112 31 140 49 125 74 111 66 111 112 49 112 49 66 35 74 20 49Z',
  bottom: 'M52 19H108L119 117H93L80 60 67 117H41Z',
  shoes: 'M22 85Q33 83 42 65L54 54 65 71 75 75 75 94H22ZM85 85Q96 83 105 65L117 54 128 71 138 75 138 94H85Z',
  outerwear: 'M48 30 66 22 80 38 94 22 112 30 135 95 115 102 106 76 106 115 54 115 54 76 45 102 25 95Z',
  accessory: 'M40 50H120L128 106H32Z M62 52V40a18 18 0 0 1 36 0v12'
};
let db;
let closet = [];
let active;
let revision = 0;
const notes = new Map();
const searches = new Map();
let photoCooldown = 0;

function openCloset() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('outfit-roll', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('items', { keyPath: 'id' });
    request.onsuccess = () => resolve(request?.result);
    request.onerror = () => reject(request.error);
  });
}

function dbRequest(mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('items', mode);
    const request = operation(transaction.objectStore('items'));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onabort = () => reject(transaction.error || new Error('Could not save to this browser.'));
  });
}

async function refresh() {
  closet = (await dbRequest('readonly', store => store.getAll())).filter(item => !item.removed);
  $('closet-grid').replaceChildren(...closet.map(item => card(item, true)));
  $('roll').disabled = closet.length === 0;
}

function garmentArt(item) {
  if (item.image) {
    const img = make('img', 'art');
    img.src = item.image;
    img.alt = item.tags.subtype;
    img.loading = 'lazy';
    return img;
  }
  const art = make('div', 'art');
  art.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 160 134');
  const garment = document.createElementNS(svg.namespaceURI, 'path');
  garment.setAttribute('d', paths[item.tags.type]);
  garment.setAttribute('fill', item.hex);
  garment.setAttribute('stroke', '#23221d');
  garment.setAttribute('stroke-width', '1.2');
  garment.setAttribute('stroke-linejoin', 'round');
  svg.append(garment);
  art.append(svg);
  return art;
}

function card(item, removable) {
  const node = make('article', 'piece');
  const info = make('div', 'piece-info');
  const meta = make('div', 'piece-meta');
  const swatch = make('span', 'swatch');
  swatch.style.backgroundColor = item.hex;
  meta.append(swatch, item.tags.primary_color + ' · ' + item.tags.formality);
  info.append(make('div', 'piece-name', item.tags.subtype), meta);
  node.append(garmentArt(item), info);
  if (removable) {
    const button = make('button', 'remove', '×');
    button.setAttribute('aria-label', 'Remove ' + item.tags.subtype);
    button.onclick = async () => {
      const status = $('closet-status');
      try {
        await dbRequest('readwrite', store => store.put({ ...item, image: undefined, removed: true }));
        kept.delete(item.id);
        await refresh();
        if (active?.items.some(piece => piece.id === item.id)) clearLook();
        const undo = make('button', 'undo', 'Undo');
        undo.type = 'button';
        undo.onclick = async () => {
          try {
            await dbRequest('readwrite', store => store.put({ ...item }));
            await refresh();
            status.textContent = item.tags.subtype + ' is back in your closet.';
          } catch {
            status.textContent = "We couldn't bring that back. Try adding the photo again.";
          }
        };
        status.replaceChildren('Removed ' + item.tags.subtype + '. ', undo);
      } catch {
        status.textContent = "We couldn't update your closet. Please try again.";
      }
    };
    node.append(button);
  }
  return node;
}

async function api(path, body) {
  const response = await fetch('/api/' + path, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  } : undefined);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'The service is temporarily unavailable.');
    error.status = response.status;
    const retryAfter = response.headers.get('Retry-After');
    error.wait = retryAfter && Number.isNaN(Number(retryAfter))
      ? Date.parse(retryAfter) - Date.now() : Number(retryAfter) * 1000;
    throw error;
  }
  return result;
}

async function prepare(file) {
  if (!file.type.startsWith('image/')) throw new Error('Choose a photo file.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose a photo under 25 MB.');
  const id = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())),
    byte => byte.toString(16).padStart(2, '0')).join('');
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    const ratio = Math.min(1, 900 / Math.max(img.width, img.height));
    const canvas = make('canvas');
    canvas.width = Math.max(1, Math.round(img.width * ratio));
    canvas.height = Math.max(1, Math.round(img.height * ratio));
    const context = canvas.getContext('2d');
    context.fillStyle = '#f4f1e9';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    const region = { x: .2, y: .2, width: .6, height: .6 };
    let color;
    try {
      color = window.ColorThief?.getColorSync(canvas, { region });
    } catch {
      // Keep photo upload available if extraction is blocked or the image has no usable palette.
    }
    const [r, g, b] = context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
    const hex = color?.hex() || '#' + [r, g, b].map(value => value.toString(16).padStart(2, '0')).join('');
    return { id, hex, image: canvas.toDataURL('image/jpeg', .8) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function addPhoto(file) {
  const item = await prepare(file);
  const save = async () => {
    const existing = await dbRequest('readonly', store => store.get(item.id));
    if (existing && !existing.removed) return false;
    const tags = existing?.tags || (await api('analyze', { image: item.image })).tags;
    await dbRequest('readwrite', store => store.put({ ...item, tags }));
    return true;
  };
  return navigator.locks ? navigator.locks.request('outfit-roll:' + item.id, save) : save();
}

$('upload').onclick = () => $('photos').click();
$('photos').onchange = async event => {
  const files = Array.from(event.target.files);
  event.target.value = '';
  if (!files.length) return;
  $('upload').disabled = true;
  let added = 0;
  let duplicates = 0;
  const errors = [];
  try {
    for (const [index, file] of files.entries()) {
      $('closet-status').textContent = 'Reading photo ' + (index + 1) + ' of ' + files.length + '…';
      try {
        if (await addPhoto(file)) added++;
        else duplicates++;
      } catch (error) {
        errors.push(error.message);
        if ([429, 503].includes(error.status)) break;
      }
    }
    await refresh();
  } catch {
    errors.push("We couldn't reload your closet. Try refreshing the page.");
  } finally {
    $('upload').disabled = false;
    $('closet-status').textContent = [
      added ? added + (added === 1 ? ' piece added to your closet.' : ' pieces added to your closet.') : '',
      duplicates ? 'Skipped photos you already added.' : '',
      ...new Set(errors)
    ].filter(Boolean).join(' ');
  }
};

$('sample').onclick = async () => {
  $('sample').disabled = true;
  try {
    await dbRequest('readwrite', store => {
      for (const sample of samples) store.put(sample);
    });
    await refresh();
    $('closet-status').textContent = 'Sample closet added. 13 pieces, ready to roll.';
  } catch {
    $('closet-status').textContent = "We couldn't save the sample closet in this browser. Try again?";
  } finally {
    $('sample').disabled = false;
  }
};

// Empty state: faint slots that show where each piece of the outfit will land.
const slots = [['top', 'Top'], ['bottom', 'Bottom'], ['shoes', 'Shoes'], ['outerwear', 'Layer']];
function renderGhosts() {
  const ghosts = slots.map(([type, label]) => {
    const node = make('div', 'piece slot');
    node.setAttribute('aria-hidden', 'true');
    const art = make('div', 'art');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 160 134');
    const shape = document.createElementNS(svg.namespaceURI, 'path');
    shape.setAttribute('d', paths[type]);
    svg.append(shape);
    art.append(svg);
    const info = make('div', 'piece-info');
    info.append(make('div', 'piece-name', label));
    node.append(art, info);
    return node;
  });
  $('look').classList.remove('rolling');
  $('look').classList.add('empty');
  $('look').replaceChildren(...ghosts, make('p', 'empty-look', 'Nothing rolled yet. Add a few clothes, then tap Roll.'));
}

function clearLook() {
  revision++;
  active = undefined;
  kept.clear();
  $('roll-label').textContent = 'Roll an outfit';
  renderGhosts();
  $('rule').textContent = 'Not rolled yet';
  $('stylist').hidden = true;
  $('inspo-grid').replaceChildren();
  $('inspo-status').textContent = 'Roll an outfit and real photos of similar looks show up here.';
}

function inspirationQuery(outfit, occasion) {
  const colors = [...new Set(outfit.items.map(item =>
    item.tags.primary_color.toLowerCase().replace(/[^a-z -]/g, '').trim()).filter(Boolean))].slice(0, 2);
  return [...colors, occasion, 'street style outfit'].filter(Boolean).join(' ').slice(0, 95);
}

function credit(text, href) {
  const link = make('a', '', text);
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

async function inspiration(query, version) {
  $('inspo-grid').replaceChildren();
  $('inspo-status').textContent = 'Looking for similar outfits…';
  try {
    let pending = searches.get(query);
    if (!pending) {
      if (Date.now() < photoCooldown) throw new Error('Unsplash has reached its photo limit. Try again later.');
      if (searches.size >= 25) searches.delete(searches.keys().next().value);
      pending = api('inspiration?q=' + encodeURIComponent(query)).catch(error => {
        searches.delete(query);
        if (error.status === 429) photoCooldown = Date.now() + Math.max(error.wait || 0, 60000);
        throw error;
      });
      searches.set(query, pending);
    }
    const { photos } = await pending;
    if (version !== revision) return;
    $('inspo-status').textContent = photos.length ? '' : "We couldn't find close matches for this one. Roll again for new ideas.";
    for (const photo of photos) {
      const figure = make('figure');
      const link = credit('', photo.page);
      const img = make('img');
      img.src = photo.image;
      img.alt = photo.alt;
      img.loading = 'lazy';
      link.append(img);
      const caption = make('figcaption');
      caption.append('Photo by ', credit(photo.author, photo.profile), ' on ',
        credit('Unsplash', 'https://unsplash.com/?utm_source=outfit_roll&utm_medium=referral'));
      figure.append(link, caption);
      $('inspo-grid').append(figure);
    }
  } catch (error) {
    if (version === revision) $('inspo-status').textContent = error.message;
  }
}

const kept = new Set();
const todayKey = 'outfit-roll:today';
const stamp = () => new Date().toDateString();
const readToday = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(todayKey));
    return saved?.date === stamp() ? saved : null;
  } catch {
    return null;
  }
};
const writeToday = value => {
  try {
    if (value) localStorage.setItem(todayKey, JSON.stringify(value));
    else localStorage.removeItem(todayKey);
  } catch {
    // Saving today's pick is a nice-to-have. Skip quietly if storage is blocked.
  }
};
const names = items => {
  const list = items.map(item => item.tags.subtype.toLowerCase());
  return list.length < 2 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list.at(-1);
};

function syncWear() {
  const saved = readToday();
  const wearing = Boolean(active && saved?.key === active.key);
  $('wear').setAttribute('aria-pressed', String(wearing));
  $('wear-label').textContent = wearing ? 'Wearing this today' : 'Wear this today';
}

function lookCard(item) {
  const node = card(item, false);
  const keep = make('button', 'keep');
  keep.type = 'button';
  const paint = on => {
    keep.setAttribute('aria-pressed', String(on));
    keep.setAttribute('aria-label', (on ? 'Stop keeping ' : 'Keep ') + item.tags.subtype + ' on the next roll');
    keep.textContent = on ? 'Kept' : 'Keep';
    node.classList.toggle('kept', on);
  };
  paint(kept.has(item.id));
  keep.onclick = () => {
    const on = !kept.has(item.id);
    if (on) kept.add(item.id);
    else kept.delete(item.id);
    paint(on);
    const keeping = active.items.filter(piece => kept.has(piece.id));
    $('roll-status').textContent = keeping.length
      ? 'Keeping your ' + names(keeping) + '. Everything else changes on the next roll.'
      : 'Nothing kept. The next roll starts fresh.';
  };
  node.append(keep);
  return node;
}

function showOutfit(outfit, occasion, message) {
  active = outfit;
  for (const id of [...kept]) if (!outfit.items.some(item => item.id === id)) kept.delete(id);
  const version = ++revision;
  $('look').classList.remove('rolling', 'empty');
  $('look').replaceChildren(...outfit.items.map(lookCard));
  void $('look').offsetWidth;
  $('look').classList.add('rolling');
  $('rule').textContent = outfit.rule.name;
  $('roll-status').textContent = message;
  $('roll-label').textContent = 'Roll again';
  $('stylist').hidden = false;
  $('why').disabled = false;
  $('note').textContent = notes.has(outfit.key) ? 'Looking at your colors…' : '';
  if (notes.has(outfit.key)) showNote(outfit, version);
  syncWear();
  void inspiration(inspirationQuery(outfit, occasion), version);
}

$('roll').onclick = () => {
  const occasion = $('occasion').value;
  const weather = $('weather').value;
  const keeping = active ? active.items.filter(item => kept.has(item.id)) : [];
  const keptTypes = new Set(keeping.map(item => item.tags.type));
  const pool = closet.filter(item => !keptTypes.has(item.tags.type) || kept.has(item.id));
  const outfit = rollOutfit(pool, occasion, weather, active?.key);
  if (!outfit) {
    if (keeping.length) {
      $('roll-status').textContent = 'Nothing else matches your ' + names(keeping)
        + ' with these filters. Let go of a kept piece or loosen the filters.';
      return;
    }
    clearLook();
    $('roll-status').textContent = weather === 'cold'
      ? "We couldn't build a cold-weather look. It needs a top, bottom, shoes, and a jacket or coat."
      : 'No color match with these filters yet. Try "Any", or add a few more pieces.';
    return;
  }
  navigator.vibrate?.(8);
  showOutfit(outfit, occasion, keeping.length
    ? 'Kept your ' + names(keeping) + ' and rolled the rest.'
    : 'Here\'s ' + names(outfit.items) + '.');
};

$('wear').onclick = () => {
  if (!active) return;
  const saved = readToday();
  if (saved?.key === active.key) {
    writeToday(null);
    $('roll-status').textContent = 'Unpicked. Roll again whenever you like.';
  } else {
    writeToday({ date: stamp(), key: active.key, ids: active.items.map(item => item.id),
      rule: active.rule.name, occasion: $('occasion').value });
    $('roll-status').textContent = 'Saved as today\'s outfit. Have a good one.';
  }
  syncWear();
};

async function showNote(outfit, version) {
  try {
    const { note } = await notes.get(outfit.key);
    if (version === revision) {
      $('note').textContent = note;
      $('why').disabled = false;
    }
  } catch (error) {
    if (version === revision) {
      $('note').textContent = error.message;
      $('why').disabled = false;
    }
  }
}

$('why').onclick = () => {
  if (!active) return;
  const outfit = active;
  if (notes.has(outfit.key)) {
    void showNote(outfit, revision);
    return;
  }
  $('why').disabled = true;
  $('note').textContent = 'Looking at your colors…';
  notes.set(outfit.key, api('stylist', {
    items: outfit.items.map(item => item.tags), rule: outfit.rule.name
  }).catch(error => {
    notes.delete(outfit.key);
    throw error;
  }));
  void showNote(outfit, revision);
};

renderGhosts();

try {
  db = await openCloset();
  await refresh();
  const saved = readToday();
  const pick = saved?.ids.map(id => closet.find(item => item.id === id));
  if (pick?.length && pick.every(Boolean)) {
    showOutfit({ items: pick, rule: { name: saved.rule }, key: saved.key }, saved.occasion || '',
      'Here\'s what you picked for today.');
  }
  $('upload').disabled = false;
  $('sample').disabled = false;
} catch {
  $('closet-status').textContent = "This browser is blocking storage, so we can't save your closet. Try another browser or turn off private mode.";
}
