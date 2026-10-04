// Эффекты под музыку прокрута: бас, середина и сильные доли из нашего Web Audio (audio.js).
(() => {
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
    const an = window.Sfx?.analyser?.();
    const { bass, mid } = an ? bands(an) : { bass: 0, mid: 0 };
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
})();
