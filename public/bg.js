// Туманность внутри листа: domain-warped fbm, ~35% разрешения, размытие в CSS. Цвета по палитре.
(() => {
  const NEB = {
    night: [[.02, .015, .045], [.30, .22, .78], [.80, .74, 1.0], [.10, .55, .75]],
    mono:  [[.01, .01, .012], [.20, .20, .22], [.86, .86, .9], [.35, .35, .38]],
    ember: [[.02, .012, .008], [.55, .16, .02], [1.0, .62, .38], [.28, .22, .2]],
  };
  const fs = [
    'precision highp float;uniform vec2 r;uniform float t;uniform vec3 c0;uniform vec3 c1;uniform vec3 c2;uniform vec3 c3;',
    'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}',
    'float fb(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<5;i++){v+=a*n(p);p=m*p;a*=.5;}return v;}',
    'void main(){vec2 p=(gl_FragCoord.xy-vec2(.5*r.x,.55*r.y))/r.y*1.35;float T=t*.55;',
    'vec2 q=vec2(fb(p+T*.02),fb(p+vec2(5.2,1.3)-T*.015));',
    'vec2 w=vec2(fb(p+3.*q+vec2(1.7,9.2)+T*.03),fb(p+3.*q+vec2(8.3,2.8)));float f=fb(p+3.*w);',
    'vec3 c=mix(c0,c1,smoothstep(.28,.74,f));',
    'c=mix(c,c3,smoothstep(.65,1.,length(w))*.3);',
    'c=mix(c,c2,pow(smoothstep(.6,1.,f),2.5)*.5);',
    'c=mix(c0,c,smoothstep(1.9,.3,length(p*vec2(.75,1.05))));gl_FragColor=vec4(c,1.);}',
  ].join('\n');

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const setters = [];

  function init(cv) {
    const gl = cv.getContext('webgl', { antialias: false });
    if (!gl) return;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(pr); gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = k => gl.getUniformLocation(pr, k), uR = U('r'), uT = U('t'), uC = ['c0', 'c1', 'c2', 'c3'].map(U);
    const t0 = performance.now();
    const size = () => {
      cv.width = Math.max(1, Math.round(cv.clientWidth * .35));
      cv.height = Math.max(1, Math.round(cv.clientHeight * .35));
      gl.viewport(0, 0, cv.width, cv.height);
    };
    const draw = t => { gl.uniform2f(uR, cv.width, cv.height); gl.uniform1f(uT, t); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
    const now = () => (reduce ? 20 : (performance.now() - t0) / 1000);
    setters.push(name => { (NEB[name] || NEB.night).forEach((c, i) => gl.uniform3f(uC[i], c[0], c[1], c[2])); draw(now()); });
    new ResizeObserver(() => { size(); draw(now()); }).observe(cv);
    size();
    let vis = true;
    new IntersectionObserver(e => { vis = e[0].isIntersecting; }).observe(cv);
    let last = 0;
    if (!reduce) (function loop(t) {
      requestAnimationFrame(loop);
      if (!vis || t - last < 33) return;
      last = t; draw(now());
    })(0);
  }

  document.querySelectorAll('canvas.neb').forEach(init);
  window.setNebulaColors = () => setters.forEach(s => s(document.documentElement.dataset.pal));
  window.setNebulaColors();
})();
