(function(){
  let chart = null;
  const fmtYen = (n) => '¥' + Number(n || 0).toLocaleString('ja-JP');

  // 棒の上限を適度に持ち上げる
  function suggestedMaxForRevenue(arr){
    const max = Math.max(0, ...arr.map(Number));
    if (max === 0) return 10;
    const mag = Math.pow(10, String(Math.floor(max)).length - 1);
    const rounded = Math.ceil(max / mag) * mag;
    return Math.ceil(rounded * 1.15);
  }

  function toSeries(buckets){
    const labels = buckets.map(b => b.label);
    return {
      labels,
      bar:  buckets.map(b => Number(b.revenue || 0)),
      line: buckets.map(b => Number(b.orders  || 0))
    };
  }

  // キャンバス幅とラベル数から棒の太さを動的に決定
  function calcBarThickness(labelsCount, canvasEl){
    const w = canvasEl?.clientWidth || 0;
    if (!labelsCount || !w) return undefined;
    // カテゴリ幅 ≒ (チャート幅 - 余白) / ラベル数
    const pad = 24; // 左右の総パディング想定
    const perCat = Math.max(1, (w - pad) / labelsCount);
    // その 75% を棒に割り当てつつ、18〜48pxにクランプ
    const px = Math.max(18, Math.min(48, Math.floor(perCat * 0.75)));
    return px;
  }

  // 棒グラフの上に金額を描画するプラグイン（外部依存なし）
  const valueLabelPlugin = {
    id: 'valueLabelPlugin',
    afterDatasetsDraw(chart, args, pluginOptions) {
      const {ctx, chartArea, data} = chart;
      const ds = chart.data.datasets?.[0]; // 先頭（棒）だけ
      if (!ds) return;

      const meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data) return;

      ctx.save();
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'center';
      // 既定フォント（Chart.js のフォント設定を尊重）
      const font = Chart.helpers?.toFont?.(chart.options.font || {size: 12}) || {string: '12px sans-serif'};
      ctx.font = font.string;
      ctx.fillStyle = '#111';

      meta.data.forEach((elem, i) => {
        const raw = ds.data?.[i] ?? 0;
        // 0 でも表示したい場合は次行をコメントアウト
        // if (!raw) return;

        // 要素の上端座標を取得
        const pos = elem.tooltipPosition(true);
        let x = pos.x;
        let y = pos.y - 6; // 棒の少し上に

        // キャンバス上端からはみ出さないようクランプ
        y = Math.max(chartArea.top + 8, y);

        const label = fmtYen(raw);
        ctx.fillText(label, x, y);
      });

      ctx.restore();
    }
  };

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
            // ★ 棒の太さ制御（カテゴリ幅を目一杯使う）
            categoryPercentage: 1.0,
            barPercentage: 0.92,
            barThickness: thickness,       // ← ここが効きます
            maxBarThickness: 64            // ← 上限も少し緩めておく
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
                  : `${ctx.dataset.label}: ${Number(v||0).toLocaleString()}件`;
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
      plugins: [ valueLabelPlugin ]   // ← 追加
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const data = window.__REV_CARD__ || { month:[], week:[], all:[] };
    const canvas = document.getElementById('revCombo');
    if (!canvas || typeof Chart === 'undefined') return;

    // 初期データ
    const initial =
      (data.month && data.month.length) ? data.month :
      (data.week  && data.week.length)  ? data.week  :
      (data.all   || []);

    chart = buildChart(canvas.getContext('2d'), initial, canvas);

    // タブ切替：データとY軸上限 & 棒太さを更新
    document.querySelectorAll('.tabs .tab[data-range]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tabs .tab').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');

        const range = btn.getAttribute('data-range');
        const buckets = data[range] || [];
        const s = toSeries(buckets);

        chart.data.labels = s.labels;
        chart.data.datasets[0].data = s.bar;
        chart.data.datasets[1].data = s.line;

        chart.options.scales.y.suggestedMax = suggestedMaxForRevenue(s.bar);
        // ★ ラベル数に合わせて棒太さを再計算
        chart.data.datasets[0].barThickness = calcBarThickness(s.labels.length, canvas);

        chart.update();
      });
    });

    // ウィンドウのリサイズに応じて棒太さを再計算（レスポンシブで細くなりすぎるのを防ぐ）
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