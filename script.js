/* Random Song Lyrics Searcher
   - uses iTunes Search API to fetch songs by artist
   - uses lyrics.ovh to request lyrics for a given artist/title
   - picks a random lyric line and shows a shareable / downloadable quote card
*/

const $ = id => document.getElementById(id);
const searchBtn = document.getElementById('searchBtn');
const anotherBtn = document.getElementById('anotherBtn');
const status = document.getElementById('status');
const artistInput = document.getElementById('artistInput');
const preferLong = document.getElementById('preferLong');
const resultArea = document.getElementById('resultArea');
const quoteText = document.getElementById('quoteText');
const songMeta = document.getElementById('songMeta');
const rawSource = document.getElementById('rawSource');
const downloadBtn = document.getElementById('downloadBtn');
const shareBtn = document.getElementById('shareBtn');
const themeToggle = document.getElementById('themeToggle');

let current = { artist:'', title:'', line:'' };

// Theme toggle
themeToggle.onclick = () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark':'light');
};
if(localStorage.getItem('theme')==='dark') document.body.classList.add('dark');

// Helper: show status
function setStatus(msg, isError){
  status.textContent = msg;
  status.style.color = isError ? 'crimson' : '';
}

// Utility: fetch JSON
async function fetchJSON(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// 1) Search songs for an artist via iTunes API
async function fetchTracksByArtist(artist, limit=50){
  const q = encodeURIComponent(artist);
  const url = `https://itunes.apple.com/search?term=${q}&entity=song&limit=${limit}`;
  const data = await fetchJSON(url);
  const tracks = (data.results || []).map(r => r.trackName).filter(Boolean);
  // unique
  return [...new Set(tracks)];
}

// 2) Try to get lyrics for a given artist & title via lyrics.ovh
async function fetchLyrics(artist, title){
  const a = encodeURIComponent(artist);
  const t = encodeURIComponent(title);
  const url = `https://api.lyrics.ovh/v1/${a}/${t}`;
  try {
    const data = await fetchJSON(url);
    if(data && data.lyrics) return data.lyrics;
    return null;
  } catch (err){
    // lyrics.ovh returns non-200 for many songs — that's ok
    return null;
  }
}

// Pick random element
const rand = arr => arr[Math.floor(Math.random()*arr.length)];

// Choose a valid lyric line
function pickRandomLine(lyrics, preferLongLines=false){
  if(!lyrics) return null;
  const lines = lyrics.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(lines.length===0) return null;
  // try to pick meaningful lines: prefer length > 20 (and < 200)
  const good = lines.filter(l => l.length >= (preferLongLines ? 30 : 10) && l.length <= 200);
  const pool = good.length ? good : lines;
  // pick random
  return rand(pool);
}

// Core: find a lyric line by trying random tracks
async function findRandomLyricLine(artist){
  setStatus('Searching for songs…');
  let tracks = [];
  try {
    tracks = await fetchTracksByArtist(artist, 60);
  } catch (err){
    setStatus('Failed to fetch songs. Check network.', true);
    throw err;
  }
  if(!tracks.length) { setStatus('No songs found for that artist.', true); return null; }

  setStatus(`Found ${tracks.length} songs. Trying lyrics…`);
  // shuffle tracks
  for(let attempt=0; attempt<Math.min(20, tracks.length); attempt++){
    const title = rand(tracks);
    setStatus(`Trying lyrics for "${title}" (${attempt+1}/${Math.min(20,tracks.length)})`);
    const lyrics = await fetchLyrics(artist, title);
    if(!lyrics) continue;
    const line = pickRandomLine(lyrics, preferLong.checked);
    if(line){
      return { artist, title, line, lyricsRaw: lyrics };
    }
    // if lyrics found but no valid line, continue
  }
  // fallback: try sequentially until exhausted
  for(const title of tracks){
    const lyrics = await fetchLyrics(artist, title);
    if(!lyrics) continue;
    const line = pickRandomLine(lyrics, preferLong.checked);
    if(line) return { artist, title, line, lyricsRaw: lyrics };
  }
  return null;
}

// Render result
function renderResult(obj){
  if(!obj) return;
  current = { artist: obj.artist, title: obj.title, line: obj.line };
  quoteText.textContent = obj.line;
  songMeta.textContent = `${obj.title} — ${obj.artist}`;
  rawSource.textContent = `Source: ${obj.title} (${obj.artist})`;
  resultArea.hidden = false;
  anotherBtn.style.display = 'inline-block';
  setStatus('Found a lyric! You can download or share it.');
  // update URL with shareable text & artist
  const params = new URLSearchParams();
  params.set('artist', obj.artist);
  params.set('text', encodeURIComponent(obj.line));
  const newUrl = `${location.pathname}?${params.toString()}`;
  history.replaceState(null,'',newUrl);
}

// Download card as PNG using html2canvas
downloadBtn.onclick = async () => {
  downloadBtn.disabled = true;
  downloadBtn.textContent = 'Preparing...';
  try {
    const card = document.getElementById('card');
    const canvas = await html2canvas(card, {backgroundColor:null, scale:2});
    const link = document.createElement('a');
    link.download = `${current.artist} — ${current.title}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err){
    alert('Could not generate image.');
    console.error(err);
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.textContent = '⬇ Download PNG';
  }
};

// Share: copies URL with encoded lyric text to clipboard (and updates address)
shareBtn.onclick = () => {
  if(!current.line) return;
  const params = new URLSearchParams();
  params.set('artist', current.artist);
  params.set('text', encodeURIComponent(current.line));
  const shareUrl = `${location.origin}${location.pathname}?${params.toString()}`;
  navigator.clipboard?.writeText(shareUrl).then(()=>{
    setStatus('Share link copied to clipboard!');
    history.replaceState(null,'',`?${params.toString()}`);
  }).catch(()=> {
    prompt('Copy this share URL:', shareUrl);
  });
};

// Search flow handlers
searchBtn.addEventListener('click', async ()=>{
  const artist = artistInput.value.trim();
  if(!artist) { setStatus('Please enter an artist name.', true); return; }
  setStatus('Looking up — this may take a few seconds…');
  resultArea.hidden = true;
  anotherBtn.style.display = 'none';
  try {
    const res = await findRandomLyricLine(artist);
    if(res) renderResult(res);
    else {
      setStatus('Could not find lyrics for the artist after trying multiple songs.', true);
    }
  } catch (err){
    console.error(err);
    setStatus('An error occurred. See console.', true);
  }
});

// "Another" button: try again for same artist
anotherBtn.addEventListener('click', async ()=>{
  if(!current.artist) return;
  setStatus('Trying for another line…');
  try {
    const res = await findRandomLyricLine(current.artist);
    if(res) renderResult(res);
    else setStatus('No other lyric lines found.', true);
  } catch (err){
    console.error(err);
    setStatus('An error occurred while fetching another line.', true);
  }
});

// Support incoming URL ?artist=...&text=...
function tryLoadFromURL(){
  const params = new URLSearchParams(location.search);
  const artist = params.get('artist');
  const textEnc = params.get('text');
  if(artist && textEnc){
    const text = decodeURIComponent(textEnc);
    // show immediately without verifying
    current = { artist, title:'(shared)', line:text };
    quoteText.textContent = text;
    songMeta.textContent = `${current.title} — ${current.artist}`;
    rawSource.textContent = `Shared quote`;
    resultArea.hidden = false;
    anotherBtn.style.display = 'inline-block';
    setStatus('Loaded shared quote from URL.');
  } else if(artist){
    // auto-run a search for convenience
    artistInput.value = artist;
    searchBtn.click();
  }
}

// On load
window.addEventListener('load', ()=>{
  tryLoadFromURL();
});
