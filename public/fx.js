// Эффекты под музыку: разбираем звук на полосы (бас, середина) и ловим сильные доли.
// Источники: музыка прокрута (наш Web Audio) и, по желанию, звук этой вкладки (общая музыка YouTube) —
// звук чужого плеера браузер не отдаёт напрямую, поэтому его нужно «расшарить» через getDisplayMedia.
(() => {
  let enabled = true;
  try { enabled = JSON.parse(localStorage.getItem('kk_fx') ?? 'true'); } catch {}
  let capture = null;
  let listeners = [];
  const level = { bass: 0, mid: 0 };
  const hist = [];
  let lastBeat = 0;
  let buf = null;

  function bands(an) {
    const n = an.frequencyBinCount;
    if (!buf || buf.length !== n) buf = new Uint8Array(n);
    an.getByteFrequencyData(buf);
    const hzPer = an.context.sampleRate / 2 / n;
    const avg = (a, b) => {
      let s = 0, c = 0;
      for (let i = Math.max(1, Math.floor(a / hzPer)); i <= Math.min(n - 1, Math.floor(b / hzPer)); i++) { s += buf[i]; c++; }
      return c ? s / c / 255 : 0;
    };
    return { bass: avg(35, 160), mid: avg(300, 2500) };
  }

  function frame(now) {
    requestAnimationFrame(frame);
    let bass = 0, mid = 0;
    if (enabled) {
      for (const an of [window.Sfx?.analyser?.(), capture?.analyser]) {
        if (!an) continue;
        const b = bands(an);
        bass = Math.max(bass, b.bass); mid = Math.max(mid, b.mid);
      }
    }
    // сильная доля: бас заметно выше своего среднего за последние ~0,7 с
    hist.push(bass);
    if (hist.length > 42) hist.shift();
    const avg = hist.reduce((a, b) => a + b, 0) / hist.length;
    let beat = 0;
    if (bass > 0.22 && bass > avg * 1.3 + 0.02 && now - lastBeat > 230) {
      lastBeat = now;
      beat = Math.min(1, 0.45 + (bass - avg) * 3);
    }
    level.bass += (bass - level.bass) * (bass > level.bass ? 0.5 : 0.12);
    level.mid += (mid - level.mid) * 0.2;
    window.setBackdropFx?.({ level: level.bass, mid: level.mid, beat });
  }
  requestAnimationFrame(frame);

  async function startCapture() {
    const ctx = window.Sfx.unlock();
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true, audio: true, preferCurrentTab: true, selfBrowserSurface: 'include', systemAudio: 'include',
    });
    const tracks = stream.getAudioTracks();
    if (!tracks.length) {
      stream.getTracks().forEach(t => t.stop());
      throw new Error('noaudio');
    }
    // картинка не нужна, но если остановить видеодорожку, браузер может закрыть и звук
    stream.getVideoTracks().forEach(t => { t.enabled = false; });
    const src = ctx.createMediaStreamSource(new MediaStream(tracks));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    src.connect(analyser); // в динамики не подключаем, иначе будет эхо
    tracks[0].addEventListener('ended', stopCapture);
    capture = { stream, analyser };
    listeners.forEach(f => f());
  }
  function stopCapture() {
    if (!capture) return;
    capture.stream.getTracks().forEach(t => t.stop());
    capture = null;
    listeners.forEach(f => f());
  }

  window.Fx = {
    get enabled() { return enabled; },
    setEnabled(on) { enabled = on; try { localStorage.setItem('kk_fx', JSON.stringify(on)); } catch {} },
    canCapture: Boolean(navigator.mediaDevices?.getDisplayMedia),
    get capturing() { return Boolean(capture); },
    startCapture, stopCapture,
    onChange(f) { listeners.push(f); },
  };
})();
