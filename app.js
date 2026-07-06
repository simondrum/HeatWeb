(function(){
"use strict";

var CODE = (new URLSearchParams(location.search)).get("code");
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

// ----- progress bar -----
var progressStep = 100 / REFRESH;
var progressVal = 100;
setInterval(function(){
  progressVal = Math.max(0, progressVal - progressStep);
  progress.value = progressVal;
}, 1000);

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

// ----- update a tile -----
function updateTile(sensor, item){
  var tile = document.getElementById(sensor.tile);
  if(!tile) return;

  var val = parseFloat(item.value);
  if(isNaN(val)) return;

  var valEl = tile.querySelector(".value");
  var trendEl = tile.querySelector(".trend");

  valEl.textContent = val.toFixed(1) + sensor.unit;

  updateHistory(sensor.name, val);
  var trend = getTrend(sensor.name, val);

  // trend arrow
  if(trend === true) trendEl.textContent = "▲";
  else if(trend === false) trendEl.textContent = "▼";
  else trendEl.textContent = "";

  // color classes
  tile.classList.remove("hot-bg","cold-bg","mid-bg","cooling","warming");
  if(val > sensor.hot) tile.classList.add("hot-bg");
  else if(val < sensor.cold) tile.classList.add("cold-bg");
  else tile.classList.add("mid-bg");

  // trend glow
  if(trend === true) tile.classList.add("warming");
  else if(trend === false) tile.classList.add("cooling");
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
function updateWeather(data){
  var cur = data.current;
  var desc = cur.description;
  var descFr = {
    "Clear":"Ciel dégagé","Clouds":"Nuageux","Rain":"Pluvieux",
    "Drizzle":"Bruine","Thunderstorm":"Orageux","Snow":"Neige",
    "Mist":"Brume","Fog":"Brouillard","Haze":"Brume","Overcast":"Couvert"
  };

  var tmp = cur.temperature;
  document.getElementById("weather-temp").textContent = tmp.value + tmp.unit;
  document.getElementById("weather-desc").textContent = descFr[desc] || desc;

  var wind = cur.wind;
  var details = [];
  if(cur.humidity) details.push(cur.humidity.value + cur.humidity.unit + " humidité");
  if(cur.pressure) details.push(cur.pressure.value + " hPa");
  if(wind){
    var dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"];
    var dir = dirs[Math.round(wind.direction.value / 22.5) % 16];
    details.push(wind.speed.value + " m/s " + dir);
  }
  document.getElementById("weather-details").textContent = details.join(" · ");

  if(data.location && data.location.city){
    document.getElementById("weather-location").textContent = data.location.city;
  }

  lastWeather = wind ? wind.speed.value : 0;
  document.getElementById("weather-tile").dataset.wind = lastWeather;
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
      progressVal = 100;
      progress.value = 100;

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
  fetch("https://www.vbus.net/api/weather/locationId/11302/timezone/Europe-Paris")
    .then(function(r){ if(!r.ok) throw Error(r.status); return r.json(); })
    .then(updateWeather)
    .catch(function(e){ console.error("Weather error:", e); });
}

// ----- init -----
fetchData();
fetchWeather();
setInterval(fetchData, REFRESH * 1000);
weatherInterval = setInterval(fetchWeather, WEATHER_REFRESH * 1000);
initParticles();

})();