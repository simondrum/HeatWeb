(function(){
"use strict";

var params = new URLSearchParams(location.search);
var CODE = params.get("code");
var LOCATION_ID = params.get("locationId") || params.get("locationid");
var ENCRYPTED_ID = params.get("encryptedId") || params.get("encryptedid") || params.get("eid");
var REFRESH = 45;
var WEATHER_REFRESH = 1200;
var weatherInterval = 0;
var lastWeather = 0;

var history = {};
var MAX_HIST = 6;

var progress = document.getElementById("progress");
var grid = document.getElementById("grid");

// ----- sensors map: API name -> tile id + thresholds -----
var sensors = [
  { name:"M1 S2 SONDE AMBIANCE MUR CHAUFFANT ",  tile:"in-tile",    hot:21, cold:19, unit:"°" },
  { name:"12 SONDE EXTERIEUR",                  tile:"out-tile",   hot:30, cold:10, unit:"°" },
  { name:"M1 S3 SONDE DE COMPENSATION INTERRUPTEUR CHAUFFAGE", tile:"consigne-tile", hot:1, cold:-1, unit:"°" },
  { name:"5 SONDE HAUT BALLON ECS",             tile:"tank-top",   hot:60, cold:54, unit:"°" },
  { name:"7 SONDE BALLON DÉPART ",              tile:"tank-mid",   hot:55, cold:45, unit:"°" },
  { name:"2 SONDE BAS BALLON ",                 tile:"tank-low",   hot:50, cold:40, unit:"°" },
  { name:"8 SONDE POELE",                       tile:"stove-tile", hot:55, cold:45, unit:"°" },
  { name:"1 SONDE CAPTEUR",                     tile:"solar-tile", hot:55, cold:45, unit:"°" }
];

var pumps = [
  { name:"M1 R1 POMPE CHAUFFAGE MUR CHAUFFANT ", id:"pump-wall" },
  { name:"R5 POMPE SOLAIRE PRIMAIRE ",           id:"pump-solar" },
  { name:"R9 POMPE BOUILLEUR",                   id:"pump-stove" }
];

// ----- trend tracking -----
function updateHistory(key, val){
  if(!history[key]) history[key] = [];
  history[key].push(val);
  if(history[key].length > MAX_HIST) history[key].shift();
}

function getTrend(key, current){
  var arr = history[key];
  if(!arr || arr.length < 2) return null;
  var sum = 0;
  for(var i = 0; i < arr.length; i++) sum += arr[i];
  var avg = sum / arr.length;
  return current > avg;
}

// ----- sparkline rendering via box-shadow positions -----
function updateSparkline(tile, values, current){
  var spark = tile.querySelector(".sparkline");
  if(!spark || values.length < 2){ spark.classList.remove("visible"); return; }

  spark.classList.add("visible");
  var min = values[0], max = values[0];
  for(var v=0;v<values.length;v++){
    if(values[v] < min) min = values[v];
    if(values[v] > max) max = values[v];
  }
  var range = max - min || 1;
  var h = 28; /* px range in the shadow space */
  var gaps = [];
  for(var k=0;k<values.length;k++){
    var norm = (values[k] - min) / range;
    var y = Math.round((1 - norm) * h);
    gaps.push((k * 7) + "px " + y + "px 0");
  }
  var color = current > max * .5 ? "#ff6b6b" : current > min + range * .5 ? "#f0c060" : "#60b0f0";
  spark.style.color = color;
  spark.style.setProperty("--drops", gaps.join(","));
}

// ----- update a tile -----
function updateTile(sensor, item){
  var tile = document.getElementById(sensor.tile);
  if(!tile) return;

  var val = parseFloat(item.value);
  if(isNaN(val)) return;

  var valEl = tile.querySelector(".value");
  valEl.textContent = val.toFixed(1) + sensor.unit;

  updateHistory(sensor.name, val);
  var trend = getTrend(sensor.name, val);

  var arr = history[sensor.name] || [];
  updateSparkline(tile, arr, val);

  // color classes
  tile.classList.remove("hot-bg","cold-bg","mid-bg","warming","cooling");
  if(val > sensor.hot) tile.classList.add("hot-bg");
  else if(val < sensor.cold) tile.classList.add("cold-bg");
  else tile.classList.add("mid-bg");

  // trend glow (warming only, no blue cooling glow)
  if(trend === true) tile.classList.add("warming");

  // stove heat indicator (>45°)
  if(sensor.tile === "stove-tile"){
    if(val > 45) tile.classList.add("stove-hot");
    else tile.classList.remove("stove-hot");
  }
}

// ----- update pump -----
function updatePump(pump, item){
  var el = document.getElementById(pump.id);
  if(!el) return;
  var val = parseFloat(item.value);
  if(!isNaN(val) && val > 0) el.classList.add("on");
  else el.classList.remove("on");
}

// ----- weather -----
var weatherIcons = {
  "Clear":"☀","Clouds":"☁","Few clouds":"🌤","Scattered clouds":"⛅",
  "Rain":"🌧","Drizzle":"🌦","Thunderstorm":"⛈","Snow":"❄",
  "Mist":"🌫","Fog":"🌫","Haze":"🌫","Overcast":"☁"
};
var weatherRain = {Rain:true,Drizzle:true,Thunderstorm:true};
var weatherSnow = {Snow:true};

function updateWeather(data){
  var cur = data.current;
  var desc = cur.description;

  var tile = document.getElementById("weather-tile");
  tile.classList.remove("weather-clear","weather-clouds","weather-rain","weather-snow","weather-mist");
  if(desc === "Clear" || desc === "Few clouds") tile.classList.add("weather-clear");
  else if(weatherRain[desc]) tile.classList.add("weather-rain");
  else if(weatherSnow[desc]) tile.classList.add("weather-snow");
  else if(desc === "Mist" || desc === "Fog" || desc === "Haze") tile.classList.add("weather-mist");
  else tile.classList.add("weather-clouds");

  var icon = weatherIcons[desc] || "🌡";
  document.getElementById("weather-icon").textContent = icon;

  var tmp = cur.temperature;
  document.getElementById("weather-temp").textContent = tmp.value + tmp.unit;

  var wind = cur.wind;
  var parts = [];
  if(cur.humidity) parts.push("💧" + cur.humidity.value + "%");
  if(cur.pressure) parts.push("⏲" + cur.pressure.value);
  if(wind){
    var dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"];
    var dir = dirs[Math.round(wind.direction.value / 22.5) % 16];
    parts.push("💨" + dir + " " + wind.speed.value);
  }
  document.getElementById("weather-details").textContent = parts.join("  ");

  lastWeather = wind ? wind.speed.value : 0;

  var canvas = document.getElementById("rain-canvas");
  if(weatherRain[desc]) canvas.style.display = "";
  else canvas.style.display = "none";
}

// ----- particles -----
function initParticles(){
  // fire
  var fireCanvas = document.getElementById("fire-canvas");
  var fireCtx = fireCanvas.getContext("2d");
  var fireParticles = [];
  var fireMax = function(){
    var el = document.getElementById("stove-tile");
    var v = el.querySelector(".value").textContent.replace("°","");
    var t = parseFloat(v);
    if(isNaN(t) || t < 30) return 0;
    if(t > 50) return Math.floor(t);
    return Math.floor((t-30)/20 * t);
  };

  function spawnFire(){
    var w = fireCanvas.width, h = fireCanvas.height;
    return {
      x:Math.random()*w, y:h + 2,
      vx:(Math.random()-.5)*1.2,
      vy:-(Math.random()*1.5 + .5),
      life:1, decay:.008 + Math.random()*.02,
      size:2 + Math.random()*4
    };
  }

  function drawFire(){
    var w = fireCanvas.width = fireCanvas.clientWidth;
    var h = fireCanvas.height = fireCanvas.clientHeight;
    fireCtx.clearRect(0,0,w,h);
    var max = fireMax();
    while(fireParticles.length < max) fireParticles.push(spawnFire());
    while(fireParticles.length > max) fireParticles.pop();
    for(var i=0;i<fireParticles.length;i++){
      var p = fireParticles[i];
      p.x += p.vx; p.y += p.vy; p.life -= p.decay;
      if(p.life <= 0 || p.y < -10){ fireParticles[i] = spawnFire(); p = fireParticles[i]; }
      var alpha = p.life;
      var r = Math.floor(255);
      var g = Math.floor(120 + p.life*100);
      fireCtx.fillStyle = "rgba("+r+","+g+",20,"+alpha.toFixed(2)+")";
      fireCtx.beginPath();
      fireCtx.ellipse(p.x, p.y, p.size, p.size*.6, 0, 0, Math.PI*2);
      fireCtx.fill();
    }
  }

  setInterval(drawFire, 16);

  // rain
  var rainCanvas = document.getElementById("rain-canvas");
  var rainCtx = rainCanvas.getContext("2d");
  var rainParticles = [];
  var rainMax = 300;

  function spawnRain(wind){
    var w = rainCanvas.width, h = rainCanvas.height;
    return {
      x:Math.random()*w*1.3 - w*.15,
      y:-(Math.random()*h),
      vy:3 + Math.random()*4,
      vx:wind * (0.5 + Math.random()),
      len:6 + Math.random()*12,
      opacity:.15 + Math.random()*.25
    };
  }

  function drawRain(){
    if(rainCanvas.style.display === "none") return;
    var w = rainCanvas.width = rainCanvas.clientWidth;
    var h = rainCanvas.height = rainCanvas.clientHeight;
    rainCtx.clearRect(0,0,w,h);
    while(rainParticles.length < rainMax) rainParticles.push(spawnRain(lastWeather));
    while(rainParticles.length > rainMax) rainParticles.shift();
    for(var i=0;i<rainParticles.length;i++){
      var p = rainParticles[i];
      p.x += p.vx; p.y += p.vy;
      if(p.y > h + 20){ rainParticles[i] = spawnRain(lastWeather); p = rainParticles[i]; }
      rainCtx.strokeStyle = "rgba(130,180,230,"+p.opacity.toFixed(2)+")";
      rainCtx.lineWidth = 1;
      rainCtx.beginPath();
      rainCtx.moveTo(p.x, p.y);
      rainCtx.lineTo(p.x + p.vx*.3, p.y + p.len);
      rainCtx.stroke();
    }
  }

  setInterval(drawRain, 16);
}

// ----- main fetch -----
function fetchData(){
  fetch("https://www.vbus.net/api/v5/data/live-system/" + CODE)
    .then(function(r){ if(!r.ok) throw Error(r.status); return r.json(); })
    .then(function(data){
      var nameMap = {};
      for(var i=0;i<data.length;i++) nameMap[data[i].name] = data[i];

      for(var s=0;s<sensors.length;s++){
        var item = nameMap[sensors[s].name];
        if(item) updateTile(sensors[s], item);
      }
      for(var p=0;p<pumps.length;p++){
        var item = nameMap[pumps[p].name];
        if(item) updatePump(pumps[p], item);
      }
    })
    .catch(function(e){
      console.error("Fetch error:", e);
    });
}

function fetchWeather(){
  if(!LOCATION_ID) return;
  fetch("https://www.vbus.net/api/weather/locationId/" + LOCATION_ID + "/timezone/Europe-Paris")
    .then(function(r){ if(!r.ok) throw Error(r.status); return r.json(); })
    .then(updateWeather)
    .catch(function(e){ console.error("Weather error:", e); });
}

// ----- click tile -> chart -----
var activeTile = null;
document.querySelectorAll(".tile").forEach(function(t){
  if(t.querySelector(".sparkline")){
    t.style.cursor = "pointer";
    t.addEventListener("click", function(e){
      var sensor = null;
      for(var s=0;s<sensors.length;s++){
        if(sensors[s].tile === t.id){ sensor = sensors[s]; break; }
      }
      if(!sensor) return;
      activeTile = sensor;
      openChart(sensor);
    });
  }
});

function openChart(sensor){
  if(!ENCRYPTED_ID) return;
  var overlay = document.getElementById("chart-overlay");
  overlay.style.display = "";
  document.getElementById("chart-title").textContent = sensor.name.trim();

  fetch("https://www.vbus.net/api/v5/data/diagram", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      encrypted_id: ENCRYPTED_ID,
      output_type:"json-series",
      direction:0,
      isZoom:false
    })
  })
  .then(function(r){ if(!r.ok) throw Error(r.status); return r.json(); })
  .then(function(data){
    document.getElementById("chart-subtitle").textContent = data.params ? data.params.subtitle || "" : "";
    var seriesData = null;
    for(var i=0;i<data.series.length;i++){
      if(data.series[i].name.trim() === sensor.name.trim()){
        seriesData = data.series[i];
        break;
      }
    }
    drawChart(seriesData);
  })
  .catch(function(e){
    console.error("Chart error:", e);
    document.getElementById("chart-subtitle").textContent = "Erreur";
  });
}

function drawChart(series){
  var canvas = document.getElementById("chart-canvas");
  var ctx = canvas.getContext("2d");
  var w = canvas.width = canvas.clientWidth;
  var h = canvas.height = canvas.clientHeight;
  if(!series || !series.data || series.data.length < 2){ ctx.clearRect(0,0,w,h); return; }

  var pad = {top:20, right:20, bottom:40, left:55};
  var pw = w - pad.left - pad.right;
  var ph = h - pad.top - pad.bottom;
  var pts = series.data;
  var min = Infinity, max = -Infinity;
  for(var i=0;i<pts.length;i++){
    if(pts[i][1] < min) min = pts[i][1];
    if(pts[i][1] > max) max = pts[i][1];
  }
  var range = max - min || 1;
  var t0 = pts[0][0], t1 = pts[pts.length-1][0];
  var trange = t1 - t0 || 1;

  function x(i){ return pad.left + ((pts[i][0]-t0)/trange) * pw; }
  function y(i){ return pad.top + ph - ((pts[i][1]-min)/range) * ph; }

  ctx.clearRect(0,0,w,h);

  // grid
  ctx.strokeStyle = "rgba(255,255,255,.06)";
  ctx.lineWidth = 1;
  var steps = 5;
  for(var g=0;g<=steps;g++){
    var gy = pad.top + (ph/steps)*g;
    ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(pad.left+pw, gy); ctx.stroke();
    var label = (max - (range/steps)*g);
    ctx.fillStyle = "rgba(255,255,255,.35)";
    ctx.font = "10px system-ui";
    ctx.textAlign = "right";
    ctx.fillText(label.toFixed(1), pad.left-6, gy+4);
  }

  // time labels
  ctx.fillStyle = "rgba(255,255,255,.3)";
  ctx.font = "9px system-ui";
  ctx.textAlign = "center";
  var td = new Date(t0);
  ctx.fillText(td.toLocaleDateString("fr",{day:"numeric",month:"short"}), pad.left, h-8);
  td = new Date(t1);
  ctx.textAlign = "right";
  ctx.fillText(td.toLocaleDateString("fr",{day:"numeric",month:"short"}), pad.left+pw, h-8);

  // unit
  ctx.fillStyle = "rgba(255,255,255,.3)";
  ctx.font = "9px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(series.unitText || "", pad.left, pad.top-6);

  // line
  var color = series.color || "#479ef5";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x(0), y(0));
  for(var i=1;i<pts.length;i++) ctx.lineTo(x(i), y(i));
  ctx.stroke();

  // gradient fill
  var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top+ph);
  grad.addColorStop(0, color + "33");
  grad.addColorStop(1, color + "04");
  ctx.fillStyle = grad;
  ctx.lineTo(x(pts.length-1), pad.top+ph);
  ctx.lineTo(x(0), pad.top+ph);
  ctx.closePath();
  ctx.fill();

  // last value dot
  var lx = x(pts.length-1), ly = y(pts.length-1);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(lx, ly, 2, 0, Math.PI*2); ctx.fill();

  // last value label
  ctx.fillStyle = "#fff";
  ctx.font = "bold 11px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(pts[pts.length-1][1].toFixed(1), lx+8, ly+4);
}

document.getElementById("chart-back").addEventListener("click", function(){
  document.getElementById("chart-overlay").style.display = "none";
  activeTile = null;
});

// ----- init -----
fetchData();
fetchWeather();
setInterval(fetchData, REFRESH * 1000);
weatherInterval = setInterval(fetchWeather, WEATHER_REFRESH * 1000);
initParticles();

})();