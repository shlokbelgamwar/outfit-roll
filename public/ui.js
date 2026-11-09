// Presentation helpers: pill chips that drive the hidden selects, and the closet count.
for (const id of ['occasion', 'weather']) {
  const select = document.getElementById(id);
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
    };
    buttons.push(button);
    group.append(button);
  }
}

const grid = document.getElementById('closet-grid');
const count = document.getElementById('closet-count');
const updateCount = () => {
  const total = grid.children.length;
  count.textContent = total ? total + (total === 1 ? ' piece' : ' pieces') : 'Empty';
};
new MutationObserver(updateCount).observe(grid, { childList: true });
updateCount();

const roll = document.getElementById('roll');
roll.addEventListener('click', () => {
  roll.classList.remove('spin');
  void roll.offsetWidth;
  roll.classList.add('spin');
});
