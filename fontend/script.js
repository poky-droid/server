const maxDataPoints = 30;
    const historicalData = {
      cpu: Array(maxDataPoints).fill(0),
      memory: Array(maxDataPoints).fill(0),
      networkSent: Array(maxDataPoints).fill(0),
      networkRecv: Array(maxDataPoints).fill(0)
    };
function shadeColor(color, percent) {
      const num = parseInt(color.replace('#',''), 16);
      const amt = Math.round(2.55 * percent);
      let R = (num >> 16) + amt;
      let G = (num >> 8 & 0x00FF) + amt;
      let B = (num & 0x0000FF) + amt;
      R = Math.max(0, Math.min(255, R));
      G = Math.max(0, Math.min(255, G));
      B = Math.max(0, Math.min(255, B));
      return '#' + (R.toString(16).padStart(2,'0') + G.toString(16).padStart(2,'0') + B.toString(16).padStart(2,'0'));
    }

    // ---------- Donut chart creator ----------
    function createDonutChart(id, label, color) {
      const el = document.getElementById(id);
      if (!el) throw new Error('Canvas not found: ' + id);
      const ctx = el.getContext('2d');

      // gradient for fill slice
      const gradient = ctx.createLinearGradient(0, 0, 0, el.height || 150);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, shadeColor(color, -20));

      return new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: [label, 'Free'],
          datasets: [{
            data: [0, 100],
            backgroundColor: [gradient, '#20262f'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          animation: { animateRotate: true, animateScale: true },
          plugins: {
            legend: { display: false },
            tooltip: {
              displayColors: false,
              callbacks: {
                label: (ctx) => `${ctx.label}: ${ctx.formattedValue}${label === 'CPU' || label === 'Memory' ? '%' : ''}`
              }
            }
          }
        }
      });
    }

    // ---------- Line chart creator ----------
    function createLineChart(id, label, color, isPercent = true) {
      const el = document.getElementById(id);
      if (!el) throw new Error('Canvas not found: ' + id);
      const ctx = el.getContext('2d');

      // gradient background (top -> transparent)
      const gradient = ctx.createLinearGradient(0, 0, 0, el.height || 200);
      gradient.addColorStop(0, shadeColor(color, 20));
      gradient.addColorStop(1, 'rgba(0,0,0,0)');

      return new Chart(ctx, {
        type: 'line',
        data: {
          labels: Array(maxDataPoints).fill(''),
          datasets: [{
            label,
            data: Array(maxDataPoints).fill(0),
            borderColor: color,
            backgroundColor: gradient,
            borderWidth: 2,
            tension: 0.36,
            pointRadius: 0,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              mode: 'index',
              intersect: false,
              callbacks: {
                label: (ctx) => {
                  const val = ctx.raw;
                  if (isPercent) return `${ctx.dataset.label}: ${val}%`;
                  return `${ctx.dataset.label}: ${Number(val).toFixed(2)} MB`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (v) => isPercent ? v + '%' : v + ' MB',
                color: '#9aa4b2'
              },
              grid: { color: 'rgba(255,255,255,0.04)' }
            },
            x: {
              grid: { display: false },
              ticks: { display: false }
            }
          },
          interaction: { intersect: false, mode: 'index' }
        }
      });
    }

    // ---------- Create charts ----------
    const cpuChart = createDonutChart('cpuChart', 'CPU', '#ff4b5c');
    const memChart = createDonutChart('memChart', 'Memory', '#3ac569');
    const diskChart = createDonutChart('diskChart', 'Disk', '#0096ff');

    const cpuHistoryChart = createLineChart('cpuHistoryChart', 'CPU', '#ff4b5c', true);
    const memHistoryChart = createLineChart('memHistoryChart', 'Memory', '#3ac569', true);
    const networkChart = createLineChart('networkChart', 'Upload', '#0096ff', false);

    // Add second dataset for network download (receive)
    networkChart.data.datasets.push({
      label: 'Download',
      data: Array(maxDataPoints).fill(0),
      borderColor: '#3ac569',
      backgroundColor: (function(){
        const ctx = networkChart.ctx;
        const g = ctx.createLinearGradient(0, 0, 0, document.getElementById('networkChart').height || 200);
        g.addColorStop(0, shadeColor('#3ac569', 20));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        return g;
      })(),
      borderWidth: 2,
      tension: 0.36,
      pointRadius: 0,
      fill: true
    });

    // ---------- Helpers ----------
    function formatBytes(bytes) {
      if (!bytes || bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
      return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    }

    function safePushShift(arr, value) {
      if (arr.length >= maxDataPoints) arr.shift();
      arr.push(value);
    }

    let lastSent = 0;
let lastRecv = 0;

// ---------- Update loop ----------
async function updateStats() {
  try {
    const res = await fetch('http://localhost:8082/api/stats', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    const cpuVal = Number(data.cpu ?? 0);
    const memVal = Number(data.memory ?? 0);
    const diskVal = Number(data.disk ?? 0);

    const bytesSentTotal = Number(data.network?.totalSent ?? 0);
    const bytesRecvTotal = Number(data.network?.totalRecv ?? 0);

    // ---------- Hitung kecepatan (MB/s) ----------
    let sentSpeed = 0, recvSpeed = 0;
    if (lastSent && lastRecv) {
      sentSpeed = (bytesSentTotal - lastSent) / 1024 / 1024 / 2; // interval 2 detik
      recvSpeed = (bytesRecvTotal - lastRecv) / 1024 / 1024 / 2;
    }
    lastSent = bytesSentTotal;
    lastRecv = bytesRecvTotal;

    // ---------- Update historical arrays ----------
    safePushShift(historicalData.cpu, cpuVal);
    safePushShift(historicalData.memory, memVal);
    safePushShift(historicalData.networkSent, sentSpeed);
    safePushShift(historicalData.networkRecv, recvSpeed);

    // ---------- Update donut charts ----------
    cpuChart.data.datasets[0].data = [cpuVal, Math.max(0, 100 - cpuVal)];
    memChart.data.datasets[0].data = [memVal, Math.max(0, 100 - memVal)];
    diskChart.data.datasets[0].data = [diskVal, Math.max(0, 100 - diskVal)];

    // ---------- Update line charts ----------
    cpuHistoryChart.data.datasets[0].data = [...historicalData.cpu];
    memHistoryChart.data.datasets[0].data = [...historicalData.memory];
    networkChart.data.datasets[0].data = [...historicalData.networkSent];
    if (networkChart.data.datasets[1]) networkChart.data.datasets[1].data = [...historicalData.networkRecv];

    // ---------- Update text ----------
    document.getElementById('cpuValue').innerText = `${cpuVal}%`;
    document.getElementById('memValue').innerText = `${memVal}%`;
    document.getElementById('diskValue').innerText = `${diskVal}%`;
    document.getElementById('sent').innerText = sentSpeed.toFixed(2) + ' MB/s';
    document.getElementById('recv').innerText = recvSpeed.toFixed(2) + ' MB/s';

    document.getElementById('serverStatus').classList.add('status-online');
    document.getElementById('lastUpdate').innerText = new Date().toLocaleTimeString();

    // ---------- Update charts ----------
    cpuChart.update();
    memChart.update();
    diskChart.update();
    cpuHistoryChart.update();
    memHistoryChart.update();
    networkChart.update();

  } catch (err) {
    console.error('Gagal fetch data', err);
    document.getElementById('serverStatus').classList.remove('status-online');
    document.getElementById('lastUpdate').innerText = 'Offline';
  }
}

// run immediately and interval
updateStats();
setInterval(updateStats, 2000);
