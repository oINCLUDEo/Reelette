// Звук: щелчки колеса, сигналы отсчёта и музыка прокрута (генерируется на лету).
// Всё на Web Audio, без файлов. Браузер разрешает звук только после первого клика по странице.
(() => {
  let ctx = null, master = null, noise = null, analyser = null;
  function ac() {
    if (!ctx) {
      ctx = new AudioContext();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 4;
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(comp).connect(ctx.destination);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      master.connect(analyser);
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  addEventListener('pointerdown', () => ac(), { once: true });

  const env = (g, t, peak, attack, decay) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  };
  function noiseHit(t, { freq, q = 3, peak, decay, type = 'bandpass', dest = master }) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    env(g, t, peak, 0.002, decay);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.4); src.stop(t + decay + 0.05);
  }
  function tone(t, { freq, type = 'triangle', peak, attack = 0.005, decay, dest = master, glide }) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + attack + decay);
    const g = ctx.createGain();
    env(g, t, peak, attack, decay);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + attack + decay + 0.05);
  }
  const hz = n => 440 * Math.pow(2, (n - 69) / 12); // номер MIDI-ноты → частота

  // ---- щелчок колеса: мягкий «деревянный» стук ----
  let lastTick = 0;
  function tick() {
    if (!ctx) return;
    const t = ctx.currentTime;
    if (t - lastTick < 0.03) return;
    lastTick = t;
    noiseHit(t, { freq: 2100 + Math.random() * 500, q: 5, peak: 0.22, decay: 0.035 });
    tone(t, { freq: 340 + Math.random() * 40, type: 'sine', peak: 0.12, attack: 0.002, decay: 0.05, glide: 220 });
  }

  // ---- отсчёт: короткий мягкий сигнал, на старте выше ----
  function beep(go) {
    ac();
    const t = ctx.currentTime;
    tone(t, { freq: go ? hz(84) : hz(76), type: 'sine', peak: 0.16, decay: go ? 0.45 : 0.18 });
    tone(t, { freq: go ? hz(96) : hz(88), type: 'sine', peak: 0.04, decay: go ? 0.3 : 0.12 });
  }

  // ---- музыка прокрута: арпеджио + бас + хэт, темп от скорости колеса ----
  const CHORDS = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 52, 55, 60], [55, 59, 62, 67]]; // Am F C G
  const ARP = [0, 1, 2, 3, 2, 1, 2, 3];
  let spin = null;
  function spinStart(getSpeed) {
    ac();
    spinStop(true);
    const bus = ctx.createGain();
    bus.gain.value = 0.0001;
    bus.gain.exponentialRampToValueAtTime(0.55, ctx.currentTime + 0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 3200;
    bus.connect(lp).connect(master);
    spin = { bus, lp, getSpeed, step: 0, next: ctx.currentTime + 0.05, timer: null };
    spin.timer = setInterval(schedule, 25);
  }
  function schedule() {
    if (!spin) return;
    const speed = Math.max(0, spin.getSpeed()); // оборотов в секунду
    const bpm = Math.min(190, 78 + speed * 45);
    const sixteenth = 60 / bpm / 4;
    spin.lp.frequency.setTargetAtTime(900 + Math.min(1, speed / 2) * 3000, ctx.currentTime, 0.2);
    while (spin.next < ctx.currentTime + 0.12) {
      const s = spin.step, t = spin.next;
      const chord = CHORDS[Math.floor(s / 16) % CHORDS.length];
      tone(t, { freq: hz(chord[ARP[s % 8]] + 12), type: 'triangle', peak: 0.09, decay: sixteenth * 1.6, dest: spin.bus });
      if (s % 4 === 0) tone(t, { freq: hz(chord[0] - 12), type: 'sine', peak: 0.2, attack: 0.01, decay: sixteenth * 3, dest: spin.bus });
      if (s % 4 === 2) noiseHit(t, { freq: 8000, type: 'highpass', q: 0.7, peak: 0.05, decay: 0.04, dest: spin.bus });
      if (s % 16 === 8) noiseHit(t, { freq: 1800, q: 1, peak: 0.08, decay: 0.12, dest: spin.bus });
      spin.step++;
      spin.next += sixteenth;
    }
  }
  function spinStop(now) {
    if (!spin) return;
    const s = spin;
    spin = null;
    clearInterval(s.timer);
    const t = ctx.currentTime;
    s.bus.gain.cancelScheduledValues(t);
    s.bus.gain.setValueAtTime(Math.max(0.0001, s.bus.gain.value), t);
    s.bus.gain.exponentialRampToValueAtTime(0.0001, t + (now ? 0.05 : 0.6));
  }

  // ---- победа и вылет ----
  function win() {
    ac();
    const t = ctx.currentTime + 0.05;
    [60, 64, 67, 72].forEach((n, i) => tone(t + i * 0.09, { freq: hz(n + 12), type: 'triangle', peak: 0.16, decay: 0.5 }));
    [60, 64, 67, 72, 76].forEach(n => tone(t + 0.4, { freq: hz(n + 12), type: 'triangle', peak: 0.07, attack: 0.02, decay: 1.6 }));
    tone(t + 0.4, { freq: hz(48), type: 'sine', peak: 0.2, attack: 0.02, decay: 1.4 });
    noiseHit(t + 0.4, { freq: 6000, type: 'highpass', q: 0.5, peak: 0.06, decay: 0.8 });
  }
  function out() {
    ac();
    const t = ctx.currentTime;
    tone(t, { freq: hz(67), type: 'triangle', peak: 0.1, decay: 0.18, glide: hz(64) });
    tone(t + 0.16, { freq: hz(62), type: 'triangle', peak: 0.1, decay: 0.4, glide: hz(55) });
  }

  window.Sfx = {
    unlock: ac, tick, beep, win, out,
    analyser: () => analyser,
    spinStart, spinStop: () => spinStop(false),
  };
})();
