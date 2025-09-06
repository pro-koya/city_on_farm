document.addEventListener('DOMContentLoaded', () => {
  // 売上スパークライン
  const cvs = document.getElementById('revSpark');
  if (cvs) {
    const ctx = cvs.getContext('2d');
    const points = JSON.parse(cvs.dataset.points || '[]'); // [1000,1200,900,...]

    const W = cvs.width = cvs.clientWidth * window.devicePixelRatio;
    const H = cvs.height = cvs.height * window.devicePixelRatio; // 高さは attribute を基準
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const pad = 8;
    const w = cvs.clientWidth - pad*2;
    const h = (H / window.devicePixelRatio) - pad*2;

    if (points.length >= 2) {
      const min = Math.min(...points);
      const max = Math.max(...points);
      const norm = v => (max === min) ? 0.5 : (v - min) / (max - min);
      const step = w / (points.length - 1);

      // ガイド（下地）
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(76,107,92,0.2)';
      ctx.beginPath();
      ctx.moveTo(pad, pad + h);
      ctx.lineTo(pad + w, pad + h);
      ctx.stroke();

      // 線
      ctx.strokeStyle = '#4C6B5C';
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach((v, i) => {
        const x = pad + step * i;
        const y = pad + (1 - norm(v)) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // 塗りつぶし
      const grad = ctx.createLinearGradient(0, pad, 0, pad + h);
      grad.addColorStop(0, 'rgba(76,107,92,0.25)');
      grad.addColorStop(1, 'rgba(76,107,92,0.02)');
      ctx.fillStyle = grad;
      ctx.lineTo(pad + w, pad + h);
      ctx.lineTo(pad, pad + h);
      ctx.closePath();
      ctx.fill();
    }
  }
});