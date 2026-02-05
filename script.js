const GRID = document.getElementById('grid');
const input = document.getElementById('guessInput');
const datalist = document.getElementById('names');
const submitBtn = document.getElementById('submitBtn');
const newBtn = document.getElementById('newBtn');
const message = document.getElementById('message');
const answerReveal = document.getElementById('answerReveal');

let characters = []; // array of objects with fields
let target = null;
let currentGuess = 0;
let guessesHistory = []; // newest-first: array of arrays of cls strings per column
let gameDifficulty = 'blademaster';
let isDailyMode = false; // true for novice/dedicated/blademaster, false for beta random
let seedData = {};
let guessedCharacters = new Set(); // track already-guessed character names
let gameEnded = false; // true when user wins or gives up
let gaveUp = false; // true if gave up; false if won

function cleanNameLetters(s){ return String(s||'').toUpperCase().replace(/[^A-Z]/g,''); }
function normalizeToken(t){ return String(t||'').replace(/\[.*?\]/g,'').trim().toUpperCase(); }
function tokensFromString(s){ if(!s) return []; return s.split(',').map(normalizeToken).filter(x=>x.length>0); }

function buildEmptyGrid(){
  // Preserve header-row if present; otherwise create it
  const header = GRID.querySelector('.header-row');
  if(header){
    // remove all nodes after header (existing guesses)
    let node = header.nextSibling;
    while(node){
      const next = node.nextSibling;
      GRID.removeChild(node);
      node = next;
    }
  } else {
    const titles = ['Character','Species, Gender, Nationality','Born','First Appeared','Last Appeared','Rank, Affiliation, etc.'];
    GRID.innerHTML = '';
    const hdr = document.createElement('div'); hdr.className = 'header-row';
    for(const t of titles){ const d = document.createElement('div'); d.className='col-title'; d.textContent = t; hdr.appendChild(d); }
    GRID.appendChild(hdr);
  }
  // reset history and disable share until solved
  guessesHistory = [];
  guessedCharacters.clear();
  gameEnded = false;
  gaveUp = false;
  fillDatalist();
  addNextGuessPreview();
  const shareBtn = document.getElementById('shareBtn'); if(shareBtn) shareBtn.disabled = true;
}

function setMessage(txt){ message.textContent = txt; }

function fillDatalist(){
  datalist.innerHTML = '';
  for(const ch of characters){
    // Skip already-guessed characters
    if(guessedCharacters.has(ch.Character.toUpperCase())) continue;
    const opt = document.createElement('option'); opt.value = ch.Character; datalist.appendChild(opt);
  }
}

function pickTarget(){ target = characters[Math.floor(Math.random()*characters.length)]; }

function addNextGuessPreview(){
  // Add a row of gray tiles with ? to show next guess placeholder
  if(gameEnded) return; // Don't add if game is over
  const cols = ['Character','Species, Gender, Nationality','Born','First Appeared','Last Appeared','Rank, Affiliation, etc.'];
  const row = document.createElement('div'); row.className='row preview-row';
  for(let i=0;i<cols.length;i++){
    const box = document.createElement('div'); box.className='box gray';
    const val = document.createElement('div'); val.className='value'; val.textContent = '?';
    box.appendChild(val);
    row.appendChild(box);
  }
  const header = GRID.querySelector('.header-row');
  if(header && header.nextSibling) GRID.insertBefore(row, header.nextSibling);
  else GRID.appendChild(row);
  requestAnimationFrame(()=>{
    const boxes = row.querySelectorAll('.box');
    boxes.forEach(b=> adjustTileText(b));
  });
}

function extractNumber(s){
  if(!s) return null;
  const str = String(s).toUpperCase();
  if(str.includes('AGE OF LEGENDS')) return 100;
  const m = str.match(/-?\d+/);
  if(!m) return null;
  const n = parseInt(m[0],10);
  return Number.isFinite(n) ? n : null;
}

function compareColumn(guessVal, targetVal, isCharacter, key){
  const g = String(guessVal||'').trim();
  const t = String(targetVal||'').trim();
  if(g.length===0 && t.length===0) return {cls:'gray',count:0};

  // Character exact match by letters
  if(isCharacter){
    if(cleanNameLetters(g) === cleanNameLetters(t)) return {cls:'green',count:0};
  }

  // exact match after trimming (case-insensitive)
  if(g.toUpperCase() === t.toUpperCase()) return {cls:'green',count:0};

  // Special handling for Born: numeric comparison
  if(key === 'Born'){
    const gn = extractNumber(g);
    const tn = extractNumber(t);
    if(gn !== null && tn !== null){
      if(gn === tn) return {cls:'green',count:0};
      // both numeric but different -> yellow with arrow
      // arrow convention switched: 'up' means guess is lower than answer (increase), 'down' means guess is higher than answer (decrease)
      const arrow = gn < tn ? 'up' : 'down';
      return {cls:'yellow',count:0,arrow};
    }
    // fall through to token overlap if not numeric
  }

  const gTokens = new Set(tokensFromString(g));
  const tTokens = new Set(tokensFromString(t));
  let matches = 0;
  for(const tok of gTokens) if(tTokens.has(tok)) matches++;
  if(matches>0) return {cls:'yellow',count:matches};
  return {cls:'gray',count:0};
}

function renderGuessRow(guessObj){
  if(!target) return;
  const cols = ['Character','Species, Gender, Nationality','Born','First Appeared','Last Appeared','Rank, Affiliation, etc.'];
  const row = document.createElement('div'); row.className='row';
  const rowResult = [];
  for(let i=0;i<cols.length;i++){
    const key = cols[i];
    const box = document.createElement('div'); box.className='box';
    const valDiv = document.createElement('div'); valDiv.className='value'; 
    // Use innerHTML with formatted text breaks instead of plain textContent
    valDiv.innerHTML = formatTextWithBreaks(guessObj[key] || '');
    const cnt = document.createElement('div'); cnt.className='count hidden';
    box.appendChild(valDiv); box.appendChild(cnt);
    const res = compareColumn(guessObj[key]||'', target[key]||'', key==='Character', key);
    box.classList.add(res.cls);
    if(res.cls==='yellow'){
      // show count for general token overlap
      if(res.count && res.count>0){ cnt.classList.remove('hidden'); cnt.textContent = res.count; }
      else { cnt.classList.add('hidden'); cnt.textContent = ''; }
    } else { cnt.classList.add('hidden'); cnt.textContent = ''; }
    // For Born column numeric arrow hint, append arrow to value
    if(key==='Born' && res.arrow){
      const arrowSpan = document.createElement('span'); arrowSpan.className='arrow ' + res.arrow; arrowSpan.textContent = res.arrow==='up' ? ' ↑' : ' ↓';
      valDiv.appendChild(arrowSpan);
    }
    rowResult.push(res.cls || 'gray');
    box.appendChild(valDiv);
    row.appendChild(box);
  }
  // Prepend newest guess so newest at top (below header)
  const header = GRID.querySelector('.header-row');
  if(header && header.nextSibling) GRID.insertBefore(row, header.nextSibling);
  else GRID.appendChild(row);
  // track history newest-first
  guessesHistory.unshift(rowResult);
  // adjust text size to fit each tile
  requestAnimationFrame(()=>{
    const boxes = row.querySelectorAll('.box');
    boxes.forEach(b=> adjustTileText(b));
  });
}

// Auto-scale tile text to fit inside square box without changing box size.
function adjustTileText(box){
  if(!box) return;
  const val = box.querySelector('.value');
  if(!val) return;
  // start with no-wrap to prefer single-line
  val.classList.remove('wrap-allowed');
  val.style.whiteSpace = 'nowrap';
  const computed = window.getComputedStyle(val);
  let fontSize = parseFloat(computed.fontSize) || 16;
  const minFont = 8;
  // reset inline styles that could affect measurement
  val.style.fontSize = fontSize + 'px';
  // measure available space inside the box
  const availW = box.clientWidth - 6; // small padding allowance
  const availH = box.clientHeight - 6;
  // reduce font until it fits or reaches min
  let fits = (val.scrollWidth <= availW + 1) && (val.scrollHeight <= availH + 1);
  while(!fits && fontSize > minFont){
    fontSize = Math.max(minFont, Math.floor(fontSize - 1));
    val.style.fontSize = fontSize + 'px';
    fits = (val.scrollWidth <= availW + 1) && (val.scrollHeight <= availH + 1);
  }
  // If it still doesn't fit, allow wrapping as a fallback and keep font at min
  if(!fits){
    val.style.fontSize = minFont + 'px';
    val.classList.add('wrap-allowed');
    val.style.whiteSpace = 'normal';
  }
}

function adjustAllTiles(){
  const boxes = document.querySelectorAll('.box');
  boxes.forEach(b=> adjustTileText(b));
}

// Format text to break after commas and slashes for better vertical space usage
function formatTextWithBreaks(text){
  if(!text) return '';
  text = String(text);
  // Replace ", " with ",<br>" to break after commas
  text = text.replace(/,\s+/g, ',<br>');
  // Replace " / " with "<br>/" to break before slashes
  text = text.replace(/\s+\/\s+/g, '<br>/');
  return text;
}

// Add semi-transparent backdrops to prominent text elements that lack a background
function applyTextBackdrops(){
  // No longer needed - main background handles contrast now
}

function onSubmit(){
  const val = input.value.trim();
  if(!val){ setMessage('Select a character from the dropdown.'); return; }
  const guessObj = characters.find(c=>c.Character.toUpperCase()===val.toUpperCase());
  if(!guessObj){ setMessage('Character not found in list.'); return; }

  // Check if already guessed
  if(guessedCharacters.has(guessObj.Character.toUpperCase())){
    setMessage('You already guessed that character.');
    input.value = '';
    input.focus();
    return;
  }

  // Add to guessed set and update dropdown
  guessedCharacters.add(guessObj.Character.toUpperCase());
  renderGuessRow(guessObj);
  fillDatalist();

  // check win if name matches exactly
  if(cleanNameLetters(guessObj.Character) === cleanNameLetters(target.Character)){
    setMessage(`You found the character: ${target.Character}`);
    submitBtn.disabled = true;
    gameEnded = true;
    gaveUp = false;
    // Remove the preview row
    const previewRow = GRID.querySelector('.preview-row');
    if(previewRow) previewRow.remove();
    input.value = '';
    input.focus();
    // enable share button
    const shareBtn = document.getElementById('shareBtn'); if(shareBtn) shareBtn.disabled = false;
    return;
  }
  currentGuess++;
  setMessage(`Guesses made: ${currentGuess}`);
  // Remove the preview row specifically and add a new one
  const previewRow = GRID.querySelector('.preview-row');
  if(previewRow) previewRow.remove();
  addNextGuessPreview();
  input.value = '';
  input.focus();
}

function newGame(){
  currentGuess = 0; setMessage(''); answerReveal.classList.add('hidden'); answerReveal.textContent=''; submitBtn.disabled=false; input.value='';
  buildEmptyGrid();
  if(characters.length>0){ pickTarget(); setMessage(`New game started.`); addNextGuessPreview(); }
}

function giveUp(){
  if(!target) return;
  gameEnded = true;
  gaveUp = true;
  submitBtn.disabled = true;
  
  // Render target as all-green row (correct answer)
  const cols = ['Character','Species, Gender, Nationality','Born','First Appeared','Last Appeared','Rank, Affiliation, etc.'];
  const row = document.createElement('div'); row.className='row';
  const rowResult = [];
  for(let i=0;i<cols.length;i++){
    const key = cols[i];
    const box = document.createElement('div'); box.className='box green';
    const val = document.createElement('div'); val.className='value'; 
    // Use innerHTML with formatted text breaks
    val.innerHTML = formatTextWithBreaks(target[key] || '');
    box.appendChild(val);
    row.appendChild(box);
    rowResult.push('green');
  }
  // Prepend to history
  const header = GRID.querySelector('.header-row');
  if(header && header.nextSibling) GRID.insertBefore(row, header.nextSibling);
  else GRID.appendChild(row);
  guessesHistory.unshift(rowResult);
  
  // Remove preview row
  const previewRow = GRID.querySelector('.preview-row');
  if(previewRow) previewRow.remove();
  
  answerReveal.classList.remove('hidden');
  answerReveal.textContent = `Answer: ${target.Character}`;
  setMessage('You gave up.');
  
  // enable share button
  const shareBtn = document.getElementById('shareBtn'); if(shareBtn) shareBtn.disabled = false;
  // adjust text size for the revealed answer row
  requestAnimationFrame(()=>{
    const boxes = row.querySelectorAll('.box');
    boxes.forEach(b=> adjustTileText(b));
  });
}

async function init(){
  setMessage('Loading data...');
  try{
    const [catRes, seedRes] = await Promise.all([
      fetch('categories.json'),
      fetch('seed.json')
    ]);
    const data = await catRes.json();
    seedData = await seedRes.json();
    const charMap = data['Character'] || {};
    const keys = Object.keys(charMap);
    // other column maps
    const maps = {
      'Species, Gender, Nationality': data['Species, Gender, Nationality'] || {},
      'Born': data['Born'] || {},
      'First Appeared': data['First Appeared'] || {},
      'Last Appeared': data['Last Appeared'] || {},
      'Rank, Affiliation, etc.': data['Rank, Affiliation, etc.'] || {},
      'Index': data['Index'] || {}
    };

    for(const k of keys){
      const obj = {
        Character: String(charMap[k]||'').trim(),
        Index: String(maps['Index'][k]||'').trim(),
        'Species, Gender, Nationality': String(maps['Species, Gender, Nationality'][k]||'').trim(),
        'Born': String(maps['Born'][k]||'').trim(),
        'First Appeared': String(maps['First Appeared'][k]||'').trim(),
        'Last Appeared': String(maps['Last Appeared'][k]||'').trim(),
        'Rank, Affiliation, etc.': String(maps['Rank, Affiliation, etc.'][k]||'').trim()
      };
      if(obj.Character.length>0) characters.push(obj);
    }

    // Deduplicate by cleaned name
    const seen = new Map();
    for(const c of characters){ const key = cleanNameLetters(c.Character); if(!seen.has(key)) seen.set(key,c); }
    characters = Array.from(seen.values());

    // Determine difficulty from URL query
    const params = new URLSearchParams(window.location.search);
    const diff = (params.get('difficulty')||'blademaster').toLowerCase();
    gameDifficulty = diff;
    let maxIndex = 250;
    if(diff === 'novice') maxIndex = 75;
    else if(diff === 'dedicated') maxIndex = 150;
    else if(diff === 'blademaster') maxIndex = 250;
    else if(diff === 'beta') maxIndex = 250;
    
    // filter by Index (numeric)
    const filtered = characters.filter(c=>{
      const idx = parseInt(c.Index,10);
      if(Number.isFinite(idx)) return idx >= 1 && idx <= maxIndex;
      return false;
    });
    characters = filtered;
    
    // Select target character based on difficulty and seed
    isDailyMode = diff !== 'beta';
    if(isDailyMode){
      const today = new Date();
      const dayNum = Math.floor(today.getTime() / (1000 * 60 * 60 * 24));
      const seedIdx = dayNum % 750;
      const seedModeKey = diff.charAt(0).toUpperCase() + diff.slice(1);
      const seedMode = seedData[seedModeKey] || {};
      const charIndex = parseInt(seedMode[seedIdx], 10);
      if(Number.isFinite(charIndex)){
        target = characters.find(c=>parseInt(c.Index,10) === charIndex);
      }
    }

    // populate datalist
    fillDatalist();
    buildEmptyGrid();
    if(!target) pickTarget();
    const label = document.getElementById('difficultyLabel');
    if(label) label.textContent = `Difficulty: ${diff.charAt(0).toUpperCase()+diff.slice(1)} (${characters.length} characters)`;
    const dailyLabel = document.getElementById('dailyLabel');
    if(dailyLabel){
      if(isDailyMode) dailyLabel.textContent = '📅 Today\'s puzzle';
      else dailyLabel.textContent = '🎲 Random puzzle';
    }
    setMessage(`Loaded ${characters.length} characters.`);
  }catch(e){ console.error(e); setMessage('Failed to load categories.json — start a local HTTP server.'); }
}

submitBtn.addEventListener('click', onSubmit);
input.addEventListener('keydown', e=>{
  if(e.key==='Enter'){
    const val = input.value.trim().toLowerCase();
    if(val.length>0){
      // find characters that start with the input (case-insensitive) or equal
      const matches = characters.filter(c=>c.Character.toLowerCase().startsWith(val));
      if(matches.length===1){ input.value = matches[0].Character; onSubmit(); return; }
    }
    onSubmit();
  }
});
newBtn.addEventListener('click', newGame);
const giveupBtn = document.getElementById('giveupBtn');
if(giveupBtn) giveupBtn.addEventListener('click', giveUp);

// Share button: copies formatted result to clipboard (enabled only after solving)
const shareBtn = document.getElementById('shareBtn');
if(shareBtn){
  shareBtn.addEventListener('click', async ()=>{
    if(shareBtn.disabled) return;
    // build share text
    const tries = guessesHistory.length;
    const mode = (gameDifficulty||'blademaster').charAt(0).toUpperCase() + (gameDifficulty||'blademaster').slice(1);
    let lines = [];
    if(gaveUp){
      lines.push(`I gave up on today's Wheeldle after ${tries} tries. (${mode} mode)`);
    } else {
      lines.push(`I got today's Wheeldle in ${tries} tries! (${mode} mode)`);
    }
    for(let i = 0; i < guessesHistory.length; i++){
      const row = guessesHistory[i];
      // For give-up, last row (which is first in newest-first order) should be red X emojis
      if(gaveUp && i === 0){
        const redXs = row.map(c=>'❌').join('');
        lines.push(redXs);
      } else {
        const em = row.map(c=> c==='green' ? '🟩' : c==='yellow' ? '🟨' : '⬜').join('');
        lines.push(em);
      }
    }
    lines.push('try at wheeldle.com');
    const text = lines.join('\n');
    try{
      await navigator.clipboard.writeText(text);
      setMessage('Result copied to clipboard.');
    }catch(e){
      console.error('Copy failed', e);
      setMessage('Failed to copy to clipboard.');
    }
  });
}

init();

// adjust tiles on window resize
window.addEventListener('resize', ()=>{
  requestAnimationFrame(adjustAllTiles);
});

// apply backdrops after initial render and whenever grid changes
document.addEventListener('DOMContentLoaded', ()=>{
  applyTextBackdrops();
  requestAnimationFrame(adjustAllTiles);
});
