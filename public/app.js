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
      try {
        await dbRequest('readwrite', store => store.put({ ...item, image: undefined, removed: true }));
        await refresh();
        if (active?.items.some(piece => piece.id === item.id)) clearLook();
      } catch {
        $('closet-status').textContent = 'This browser could not update your closet.';
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
      $('closet-status').textContent = 'Checking photo ' + (index + 1) + ' of ' + files.length + '…';
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
    errors.push('This browser could not reload your closet.');
  } finally {
    $('upload').disabled = false;
    $('closet-status').textContent = [
      added ? added + (added === 1 ? ' piece added.' : ' pieces added.') : '',
      duplicates ? 'Duplicate photos were skipped.' : '',
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
    $('closet-status').textContent = 'Sample closet added.';
  } catch {
    $('closet-status').textContent = 'This browser could not save the sample closet.';
  } finally {
    $('sample').disabled = false;
  }
};

function clearLook() {
  revision++;
  active = undefined;
  $('look').replaceChildren(make('p', 'empty-look', 'Nothing rolled yet. Add a few clothes, then tap Roll.'));
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
    $('inspo-status').textContent = photos.length ? '' : 'No close matches on Unsplash for this look.';
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

$('roll').onclick = () => {
  const occasion = $('occasion').value;
  const weather = $('weather').value;
  const outfit = rollOutfit(closet, occasion, weather, active?.key);
  if (!outfit) {
    clearLook();
    $('roll-status').textContent = weather === 'cold'
      ? 'No color match for these filters. Cold rolls need a top, bottom, shoes, and outerwear.'
      : 'No color match for these filters. Try a different filter or add more pieces.';
    return;
  }
  active = outfit;
  const version = ++revision;
  $('look').classList.remove('rolling');
  $('look').replaceChildren(...outfit.items.map(item => card(item, false)));
  $('look').classList.add('rolling');
  $('rule').textContent = outfit.rule.name;
  $('roll-status').textContent = 'Rolled ' + outfit.items.map(item => item.tags.subtype).join(', ') + '.';
  $('stylist').hidden = false;
  $('why').disabled = false;
  $('note').textContent = notes.has(outfit.key) ? 'Finding the styling details…' : '';
  if (notes.has(outfit.key)) showNote(outfit, version);
  void inspiration(inspirationQuery(outfit, occasion), version);
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
  $('note').textContent = 'Finding the styling details…';
  notes.set(outfit.key, api('stylist', {
    items: outfit.items.map(item => item.tags), rule: outfit.rule.name
  }).catch(error => {
    notes.delete(outfit.key);
    throw error;
  }));
  void showNote(outfit, revision);
};

try {
  db = await openCloset();
  await refresh();
  $('upload').disabled = false;
  $('sample').disabled = false;
} catch {
  $('closet-status').textContent = 'Closet storage is unavailable. Open Outfit Roll in a browser that allows site storage.';
}
