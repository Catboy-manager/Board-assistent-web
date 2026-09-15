'use strict';

(function () {
  const WMO = {
    0: ['☀️', 'Ясно'], 1: ['🌤️', 'Преимущественно ясно'], 2: ['⛅', 'Переменная облачность'],
    3: ['☁️', 'Пасмурно'], 45: ['🌫️', 'Туман'], 48: ['🌫️', 'Изморозь'],
    51: ['🌦️', 'Мелкая морось'], 53: ['🌦️', 'Морось'], 55: ['🌧️', 'Сильная морось'],
    56: ['🌦️', 'Ледяная морось'], 57: ['🌧️', 'Ледяная морось'],
    61: ['🌧️', 'Небольшой дождь'], 63: ['🌧️', 'Дождь'], 65: ['🌧️', 'Сильный дождь'],
    66: ['🌧️', 'Ледяной дождь'], 67: ['🌧️', 'Сильный ледяной дождь'],
    71: ['🌨️', 'Небольшой снег'], 73: ['🌨️', 'Снег'], 75: ['❄️', 'Сильный снег'],
    77: ['🌨️', 'Снежная крупа'],
    80: ['🌦️', 'Ливень'], 81: ['🌧️', 'Сильный ливень'], 82: ['⛈️', 'Очень сильный ливень'],
    85: ['🌨️', 'Снежные заряды'], 86: ['❄️', 'Сильные снежные заряды'],
    95: ['⛈️', 'Гроза'], 96: ['⛈️', 'Гроза с градом'], 99: ['⛈️', 'Гроза с сильным градом']
  };

  function wmo(code) { return WMO[code] || ['🌥️', 'Облачно']; }

  async function load() {
    try {
      const res = await fetch('/api/weather');
      const d = await res.json();
      render(d);
    } catch (e) {
      document.getElementById('w-temp').textContent = '—';
    }
  }

  function render(d) {
    const now = wmo(d.current.weather_code);
    document.getElementById('w-ico').textContent = now[0];
    document.getElementById('w-temp').textContent = Math.round(d.current.temperature_2m) + '°';
    document.getElementById('w-desc').textContent = now[1];

    const t = wmo(d.tomorrow.code);
    document.getElementById('w-tomorrow').innerHTML =
      `Завтра: ${t[0]} ${t[1]}, ${Math.round(d.tomorrow.tmin)}…${Math.round(d.tomorrow.tmax)}°`;

    document.getElementById('weather').title =
      `Сейчас: ${now[1]}, ${Math.round(d.current.temperature_2m)}° (ощущается ${Math.round(d.current.apparent_temperature)}°)\n` +
      `Ветер ${Math.round(d.current.wind_speed_10m)} км/ч, влажность ${d.current.relative_humidity_2m}%`;

    const pop = document.getElementById('weather-pop');
    if (pop) pop.innerHTML = hourlyHtml(d.hourly);
  }

  function openPopup(d) {
    const rect = document.getElementById('weather').getBoundingClientRect();
    let pop = document.getElementById('weather-pop');
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'weather-pop';
      pop.style.cssText = 'position:fixed;z-index:150;background:#10151c;border:1px solid #ffffff22;border-radius:12px;padding:4px 12px 14px;box-shadow:0 10px 30px #00000066;max-width:92vw;width:420px;';
      document.body.appendChild(pop);
      document.addEventListener('click', (e) => { if (pop && !pop.contains(e.target) && e.target.id !== 'weather') pop.style.display = 'none'; });
    }
    pop.style.top = (rect.bottom + 8) + 'px';
    pop.style.left = 'auto';
    pop.style.right = '10px';
    pop.style.display = 'block';
    pop.innerHTML = `<div style="font-size:13px;color:#9aa7b8;padding:8px 2px">Почасовая погода в ${('city' in d ? d.city : 'Москве')} — ближайшие 24 часа</div>` + hourlyHtml(d.hourly);
  }

  function hourlyHtml(hourly) {
    const rows = hourly.map(h => {
      const t = wmo(h.code);
      const hh = new Date(h.time).getHours().toString().padStart(2, '0') + ':00';
      return `<div style="display:flex;align-items:center;gap:10px;padding:6px 2px;border-bottom:1px solid #ffffff12;font-size:14px">
        <span style="width:42px;color:#9aa7b8">${hh}</span>
        <span style="font-size:16px">${t[0]}</span>
        <span style="flex:1;font-size:12px;color:#9aa7b8">${t[1]}</span>
        <span style="font-weight:600;width:44px;text-align:right">${Math.round(h.t2m)}°</span>
        <span style="width:52px;text-align:right;font-size:12px;color:#9aa7b8">💧${h.precip}%</span>
      </div>`;
    }).join('');
    return `<div style="max-height:60vh;overflow-y:auto">${rows}</div>`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    load();
    document.getElementById('weather').onclick = async () => {
      try {
        const res = await fetch('/api/weather');
        const d = await res.json();
        render(d);
        openPopup(d);
      } catch (e) {}
    };
    setInterval(load, 30 * 60000);
  });
})();