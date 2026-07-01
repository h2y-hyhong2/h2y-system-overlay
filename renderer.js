// Element references
const cpuValEl = document.getElementById('cpu-val');
const ramValEl = document.getElementById('ram-val');
const netDownEl = document.getElementById('net-down');
const netUpEl = document.getElementById('net-up');
const appContainer = document.getElementById('app');

// Drag State
let isDragging = false;
let isLocked = false;

// Entire container is draggable now
appContainer.addEventListener('mousedown', (e) => {
  if (isLocked) return;
  isDragging = true;
  window.electronAPI.dragStart({ x: e.clientX, y: e.clientY });
});

window.addEventListener('mousemove', () => {
  if (isDragging) {
    window.electronAPI.dragWindow();
  }
});

window.addEventListener('mouseup', () => {
  isDragging = false;
});

// Double click to toggle layout mode
appContainer.addEventListener('dblclick', (e) => {
  e.stopPropagation();
  window.electronAPI.toggleLayout();
});

// Close Button
const closeBtn = document.getElementById('close-btn');
closeBtn.addEventListener('mousedown', (e) => {
  e.stopPropagation(); // Prevents dragging on close button click
});
closeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  window.electronAPI.closeWindow();
});

// Mode Button
const modeBtn = document.getElementById('mode-btn');
modeBtn.addEventListener('mousedown', (e) => {
  e.stopPropagation(); // Prevents dragging on mode button click
});
modeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  window.electronAPI.toggleLayout();
});

// App State Badges (No visual badge in text-only mode, but lock state variable updated)
window.electronAPI.onClickThroughChanged((isThrough) => {
  // Can add custom text indicators on hover if needed, currently no-op
});

window.electronAPI.onPositionLockChanged((locked) => {
  isLocked = locked;
});

// Layout Mode changed listener
window.electronAPI.onLayoutModeChanged((mode) => {
  appContainer.className = `overlay-container ${mode}`;
});

// Format Network Speed to fit in small space
function formatBytesCompact(bytes, prefix) {
  if (!bytes || bytes < 0) return `${prefix}0.0K`;
  const k = 1024;
  const m = k * k;
  if (bytes >= m) {
    return `${prefix}${(bytes / m).toFixed(1)}M`;
  } else {
    return `${prefix}${(bytes / k).toFixed(1)}K`;
  }
}

function getUsageColor(usage, startR, startG, startB) {
  const endR = 255;
  const endG = 8;
  const endB = 68; // #ff0844 (Red)
  
  // 10단계 구분 (0 ~ 10 단계)
  const step = Math.min(10, Math.max(0, Math.round(usage / 10)));
  const factor = step / 10;
  
  const r = Math.round(startR + (endR - startR) * factor);
  const g = Math.round(startG + (endG - startG) * factor);
  const b = Math.round(startB + (endB - startB) * factor);
  
  return `rgb(${r}, ${g}, ${b})`;
}

// Receive system metrics updates
window.electronAPI.onStatsUpdate((stats) => {
  // Update CPU
  cpuValEl.textContent = `${stats.cpu.usage}%`;
  cpuValEl.style.color = getUsageColor(stats.cpu.usage, 0, 242, 254);

  // Update RAM
  ramValEl.textContent = `${stats.ram.usage}%`;
  ramValEl.style.color = getUsageColor(stats.ram.usage, 177, 118, 255);


  // Update Network
  netDownEl.textContent = formatBytesCompact(stats.network.rx, '↓');
  netUpEl.textContent = formatBytesCompact(stats.network.tx, '↑');
});
