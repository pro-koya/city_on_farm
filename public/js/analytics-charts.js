// /public/js/analytics-charts.js
(function(){
  let chart = null;

  /* -----------------------------
   * helpers
   * ---------------------------*/
  const fmtYen = (n) => '¥' + Number(n || 0).toLocaleString('ja-JP');
  const fmtInt = (n) => Number(n || 0).toLocaleString('ja-JP');

  // 棒の上限を適度に持ち上げる（カード側と同じロジック）
  function suggestedMaxForRevenue(arr){
    const max = Math.max(0, ...(arr || []).map(Number));
    if (!isFinite(max) || max <= 0) return 10;
    const mag = Math.pow(6, String(Math.floor(max)).length - 1);
    const rounded = Math.ceil(max / mag) * mag;
    return Math.ceil(rounded * 1.15);
  }

  // {label, revenue, orders}[] -> series
  function toSeries(buckets){
    const labels = (buckets || []).map(b => b.label);
    return {
      labels,
      bar:  (buckets || []).map(b => Number(b.revenue || 0)),
      line: (buckets || []).map(b => Number(b.orders  || 0))
    };
  }

  // キャンバス幅とラベル数から棒の太さを動的に決定（カード側と同じ）
  function calcBarThickness(labelsCount, canvasEl){
    const w = canvasEl?.clientWidth || 0;
    if (!labelsCount || !w) return undefined;
    const pad = 24; // 左右の総パディング想定
    const perCat = Math.max(1, (w - pad) / labelsCount);
    // その 75% を棒に割り当てつつ、18〜48pxにクランプ
    const px = Math.max(18, Math.min(48, Math.floor(perCat * 0.75)));
    return px;
  }

  /* -----------------------------
   * バー上に金額を描画（カード側と同じデザイン）
   * ---------------------------*/
  const valueLabelPlugin = {
    id: 'valueLabelPlugin',
    afterDatasetsDraw(chart, args, pluginOptions) {
      const {ctx, chartArea} = chart;
      const ds = chart.data.datasets?.[0]; // 先頭（棒）
      if (!ds) return;
      const meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data) return;

      ctx.save();
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'center';
      // Chart.js のフォント設定を尊重
      const font = Chart.helpers?.toFont?.(chart.options.font || {size: 12}) || {string: '12px sans-serif'};
      ctx.font = font.string;
      ctx.fillStyle = '#111';

      meta.data.forEach((elem, i) => {
        const raw = ds.data?.[i] ?? 0;
        // 0 を非表示にしたい場合は次行をONに
        // if (!raw) return;

        const pos = elem.tooltipPosition(true);
        let x = pos.x;
        let y = pos.y - 6; // 棒の少し上

        // 上端からはみ出さないようクランプ
        y = Math.max(chartArea.top + 8, y);

        ctx.fillText(fmtYen(raw), x, y);
      });

      ctx.restore();
    }
  };

  /* -----------------------------
   * Chart builder（カード側と同じパラメータ）
   * ---------------------------*/
  function buildChart(ctx, buckets, canvasEl){
    const s = toSeries(buckets);
    const yMax = suggestedMaxForRevenue(s.bar);
    const thickness = calcBarThickness(s.labels.length, canvasEl);

    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels: s.labels,
        datasets: [
          {
            type:'bar',
            label:'売上（円）',
            data:s.bar,
            yAxisID:'y',
            borderWidth:0,
            borderRadius: 6,
            // 割合指定ではなく実寸で太さ調整
            categoryPercentage: 1.0,
            barPercentage: 0.92,
            barThickness: thickness,
            maxBarThickness: 64
          },
          {
            type:'line',
            label:'注文数',
            data:s.line,
            yAxisID:'y2',
            tension:0.25,
            pointRadius:3,
            pointHoverRadius:5,
            borderWidth:2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode:'index', intersect:false },
        layout: { padding: { top: 18, right: 8, bottom: 0, left: 0 } },
        plugins: {
          legend:{ display:true, position:'bottom' },
          tooltip: {
            callbacks: {
              label(ctx){
                const v = ctx.raw;
                return ctx.dataset.type === 'bar'
                  ? `${ctx.dataset.label}: ${fmtYen(v)}`
                  : `${ctx.dataset.label}: ${fmtInt(v)}件`;
              }
            }
          }
        },
        scales: {
          y:  {
            position:'left',
            beginAtZero:true,
            suggestedMax: yMax,
            ticks:{ callback:v=>fmtYen(v) },
            grid:{ color:'rgba(0,0,0,.06)' }
          },
          y2: {
            position:'right',
            beginAtZero:true,
            grid:{ drawOnChartArea:false },
            ticks:{ precision:0 }
          },
          x:  { grid:{ display:false } }
        }
      },
      plugins: [ valueLabelPlugin ]
    });
  }

  /* -----------------------------
   * bootstrap
   * ---------------------------*/
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof Chart === 'undefined') return;

    const payload = window.__ANALYTICS__ || { buckets: [] };
    const canvas  = document.getElementById('analyticsCombo');
    if (!canvas) return;

    // 既存チャートがあれば破棄
    if (canvas._chart) {
      try { canvas._chart.destroy(); } catch {}
    }

    // 空データ時は1点ダミー
    const buckets = Array.isArray(payload.buckets) && payload.buckets.length
      ? payload.buckets
      : [{ label: '—', revenue: 0, orders: 0 }];

    chart = buildChart(canvas.getContext('2d'), buckets, canvas);
    canvas._chart = chart;

    // リサイズで棒太さを再計算（カード側と同様）
    let rid = 0;
    window.addEventListener('resize', () => {
      if (!chart) return;
      cancelAnimationFrame(rid);
      rid = requestAnimationFrame(() => {
        const count = chart.data.labels?.length || 0;
        chart.data.datasets[0].barThickness = calcBarThickness(count, canvas);
        chart.update('none');
      });
    });
  });
})();