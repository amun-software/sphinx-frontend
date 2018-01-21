var editableLayers;
var drawControl;
var sentinel;
var polygon;
var totalcount;

$(document).ready(function() {
  initMap();
  initPanels();
});

function getPolygonCoords(footprint) {
  return JSON.parse(
    footprint
    .replace('POLYGON((','[[')
    .replace('))', ']]')
    .replace(/, /g, '],[')
    .replace(/ /g, ',')
  )
  .map((e)=>[e[1],e[0]]);
}

function getTmsUrlsAsList(tmsUrls) {
  const allurls = 
    tmsUrls.R10m == undefined ?
    Object.values(tmsUrls) :
    Object.values(tmsUrls.R10m).concat(Object.values(tmsUrls.R20m).concat(Object.values(tmsUrls.R60m)));
  return allurls.map((e) => e.replace(/^.*IMG_DATA\//, '')).join(',');
}

function getSearchResults() {
  $.get('http://gis-bigdata:11016/datasets', function(result) {
    document.getElementById('searchresults').innerHTML = result
    .sort((e1,e2) => e1.MTD.metadata[''].PRODUCT_START_TIME < e2.MTD.metadata[''].PRODUCT_START_TIME)
    .map((e) =>
      `<li
        onclick="showFootprintOnMap(JSON.parse(this.dataset.polygoncoords))"
        ondblclick="showDetails(this.dataset)"
        data-footprint="${e.MTD.metadata[''].FOOTPRINT}"
        data-polygoncoords="${JSON.stringify(getPolygonCoords(e.MTD.metadata[''].FOOTPRINT))}"
        data-tmsurls="${getTmsUrlsAsList(e.tmsUrls)}"
        data-scenename="${e.sceneName}"
        data-datetime="${e.MTD.metadata[''].DATATAKE_1_DATATAKE_SENSING_START}"
        data-cloudcoverage="${e.MTD.metadata[''].CLOUD_COVERAGE_ASSESSMENT}">
        <strong>${e.sceneName.replace(/_/g, '_&#8203;')}</strong>
        <br>
        ${new Date(e.MTD.metadata[''].PRODUCT_START_TIME).toLocaleString()}
      </li>`
    ).join('\r\n');
    totalcount = result.length;
    filterResults();
  });
}
  
function filterResults() {
  var identifier = document.getElementById('identifier').value.toLowerCase();
  var identifiersubstrings = identifier.split(' ');
  var startdate = document.getElementById('startdate').value.toLowerCase();
  var enddate = document.getElementById('enddate').value.toLowerCase();
  var bbox = (editableLayers.getLayers().length > 0 ? editableLayers.getLayers()[0].getBounds() : undefined);
  Array.from(document.getElementById('searchresults').children).forEach(function(e) {
    if(
      identifiersubstrings
        .map((substring) => e.dataset.scenename.toLowerCase().indexOf(substring) < 0)
        .reduce((e1,e2) => e1||e2) ||
      startdate != '' && e.dataset.datetime < startdate ||
      enddate   != '' && e.dataset.datetime > enddate ||
      bbox != undefined && bbox.intersects(JSON.parse(e.dataset.polygoncoords)) == false
    )
      e.classList.add('invisible');
    else
      e.classList.remove('invisible');
  });
  document.getElementById('resultcount').innerHTML = totalcount - parseInt($('.invisible').length);
}

function showFootprintOnMap(polygonlatlngs) {
  polygon.setLatLngs(polygonlatlngs);
  map.panInsideBounds(polygon.getBounds());
}

function showDetails(info) {
  sidebar.open('details');
  document.getElementById('details-identifier').innerHTML = info.scenename.replace(/_/g, '_&#8203;');
  document.getElementById('details-datetime').innerHTML = info.datetime;
  document.getElementById('details-cloudcoverage').innerHTML = info.cloudcoverage;
  var bandselector = info.tmsurls
    .split(',')
    .map((e)=>'<option value="' + e + '">' + e.replace(/^.*IMG_DATA\//, '') + '</option>')
    .join("\r\n");
  ['', '-r', '-g', '-b'].forEach((postfix) => document.getElementById('availablebands'+postfix).innerHTML = bandselector);
  map.fitBounds(polygon.getBounds());
  changeTmsUrl(info.tmsurls.split(',')[0]);
}

function getColormode() {
  // may be 'rgb' or 'grayscale'
  return document.querySelector('input[name=colormode]:checked').value;
}

function changeTmsUrl() {
  const scene = document.getElementById('details-identifier').innerHTML.replace('.SAFE', '').replace(/\W/g, '');
  if(getColormode() == 'grayscale') {
    const band = document.getElementById('availablebands').value;
    const min = (parseInt(document.getElementById('contrast-min').value) || 0);
    const max = (parseInt(document.getElementById('contrast-max').value) || 255);
    if(min==0 && max==255) {
      // use TMS directly for default settings
      sentinel.setUrl(`http://gis-bigdata:11016/img/${scene}.SAFE/IMG_DATA/${band}/{z}/{x}/{y}.png`);
    } else {
      // use processing service for special settings
      sentinel.setUrl(`http://gis-bigdata:11014/api/tiles?z={z}&x={x}&y={y}&option=grayscale&scene=${scene}&band=${band}&min=${min}&max=${max}`);
    }
  } else {
    sentinel.setUrl('http://gis-bigdata:11014/api/tiles?z={z}&x={x}&y={y}&option=RGB'
      + '&scene='      +  scene
      + '&r='          +  document.getElementById('availablebands-r').value
      + '&g='          +  document.getElementById('availablebands-g').value
      + '&b='          +  document.getElementById('availablebands-b').value
      + '&rmin='       + (parseInt(document.getElementById('contrast-min-r').value) || 0)
      + '&gmin='       + (parseInt(document.getElementById('contrast-min-g').value) || 0)
      + '&bmin='       + (parseInt(document.getElementById('contrast-min-b').value) || 0)
      + '&rmax='       + (parseInt(document.getElementById('contrast-max-r').value) || 255)
      + '&gmax='       + (parseInt(document.getElementById('contrast-max-g').value) || 255)
      + '&bmax='       + (parseInt(document.getElementById('contrast-max-b').value) || 255)
    );
  }
}

function changeOpacity(value) {
  sentinel.setOpacity(value / 100);
  document.getElementById('opacity-label').innerHTML = value + '&nbsp;%';
}

function initMap() {
  // MAP
  map = L.map('map', {
    center: [50, 0],  // shows Europe even when sidebar opened
    zoom: 4  // most of Europe
  });
  
  // BASEMAPS
  var basemaps = {
    'OpenStreetMap': L.tileLayer.provider('OpenStreetMap.Mapnik').addTo(map),
    'Esri Road': L.tileLayer.provider('Esri.WorldStreetMap'),
    'OpenTopoMap': L.tileLayer.provider('OpenTopoMap'),
    'Esri Topo': L.tileLayer.provider('Esri.WorldTopoMap'),
    'Esri Shaded Relief': L.tileLayer.provider('Esri.WorldShadedRelief'),
    'Esri Satellite': L.tileLayer.provider('Esri.WorldImagery'),
    'OpenStreetMap Gray': L.tileLayer.provider('OpenStreetMap.BlackAndWhite'),
    'Esri Gray': L.tileLayer.provider('Esri.WorldGrayCanvas'),
    'Stamen Gray': L.tileLayer.provider('Stamen.TonerLite')
  };
  
  // SENTINEL OVERLAY
  sentinel = L.tileLayer('', {
    tms: true,
    attribution: 'Sentinel data, public domain'
  }).addTo(map);
  
  // LAYER CONTROL
  L.control.layers(basemaps, {'Sentinel Overlay': sentinel}).addTo(map);
  
  // SIDEBAR
  sidebar = L.control.sidebar('sidebar').addTo(map);
  
  // DRAW PLUGIN
  editableLayers = new L.FeatureGroup();
  map.addLayer(editableLayers);
  var options = {
    position: 'bottomright',
    draw: {
      polyline: false,
      polygon: false,
      circle: false,
      marker: false,
      circlemarker: false,
      rectangle: {},  // disable all but rectangle
    },
    edit: {
      featureGroup: editableLayers, //REQUIRED!!
    }
  };
  drawControl = new L.Control.Draw(options);
  map.on(L.Draw.Event.CREATED, function (e) {
    editableLayers.addLayer(e.layer);
    filterResults();
  });
  map.on('draw:drawstart', function (e) {
    editableLayers.clearLayers();  // remove old rectangle when drawing a new one
  });
  
  // ORIGINAL VALUE
  map.on('click', function(e) {
    L.marker(e.latlng).bindPopup('Original value:<br>42.1337').addTo(map).openPopup();
  });
  
  // POLYGON
  polygon = new L.polygon([], {color: 'red', fill: false}).addTo(map);
  
  // LOADING SYMBOL
  var loadingControl = L.Control.loading({
    position: 'topright',
    separate: true
  });
  map.addControl(loadingControl);
}

function initPanels() {
  // HOME panel
  sidebar.addPanel({
    id: 'home',
    tab: '<i class="fa fa-home fa-lg"></i>',
    position: 'top',
    pane: `
      <h3>Amun Sphinx</h3>
      <p>Explore the wealth of Sentinel-2 data available and use their full potential!</p>
      <p>Click the maginfying glass on the left to start browsing the datasets.</p>`
  });
  
  // SEARCH panel
  sidebar.addPanel({
    id: 'search',
    tab: '<i class="fa fa-search fa-lg"></i>',
    position: 'top',
    pane: `
      <h3>Search</h3>
      <form onsubmit="return false">
        <input placeholder="Identifier" id="identifier" onkeyup="filterResults()">
        <input placeholder="Start date" id="startdate" onchange="filterResults()" data-toggle="datepicker">
        <input placeholder="End date" id="enddate" onchange="filterResults()" data-toggle="datepicker">
        <button id="filter" onclick="filterResults()">Filter</button>
      </form>
      <h3>Results (<span id="resultcount"></span>)</h3>
      <ol id='searchresults'>
        <li><strong>S2A_MSIL2A N0205_R108_T32UMC</strong><br>2017-09-27 10:30:21</li>
        <li><strong>S2A_MSIL2A N0205_R109_T32UMC</strong><br>2017-09-27 10:35:18</li>
        <li><strong>S2A_MSIL2A N0205_R110_T32UMC</strong><br>2017-09-27 10:40:27</li>
        <li><strong>S2A_MSIL2A N0205_R111_T32UMC</strong><br>2017-09-27 10:45:22</li>
        <li><strong>S2A_MSIL2A N0205_R112_T32UMC</strong><br>2017-09-27 10:50:13</li>
      </ol>
      <nav>
        <button>&lt;</button>
        <div>
          <button>1</button>
          <button>2</button>
          <button>3</button>
        </div>
        <button>&gt;</button>
      </nav>`
  });
  
  // DATE PICKER for search panel
  $.fn.datepicker.languages['de-DE'] = {
    days: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
    daysShort: ['Son', 'Mon', 'Die', 'Mit', 'Don', 'Fre', 'Sam'],
    daysMin: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
    months: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
    monthsShort: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
  };
  $('[data-toggle="datepicker"]').datepicker({autoHide: true, format: 'yyyy-mm-dd', language: 'de-DE', zIndex:3000});
  
  // DETAIL panel
  sidebar.addPanel({
    id: 'details',
    tab: '<i class="fa fa-picture-o fa-lg"></i>',
    position: 'top',
    pane: `
      <h3>Details</h3>
      
      <div>
        <strong>Identifier:</strong> <em id="details-identifier"></em>
      </div>
      
      <div>
        <strong>Captured:</strong> <span id="details-datetime"></span><br>
        <strong>Cloud Coverage:</strong> <span id="details-cloudcoverage"></span>&nbsp;%<br>
        <!--<strong>UTM Zone:</strong><br>-->
      </div>
      
      <div>
        <strong>Opacity:</strong>
        <input type="range" min="0" max="100" step="1" value="100" id="opacity" onchange="changeOpacity(this.value)" />
        <label id="opacity-label" for="opacity">100&nbsp;%</label>
      </div>
      
      <div>
        <strong>Color mode:</strong>
        <input type="radio" name="colormode" id="grayscale" value="grayscale" checked/><label for="grayscale">Grayscale</label>
        <input type="radio" name="colormode" id="rgb" value="rgb"/><label for="rgb">RGB</label>
        <div>
          <strong>Band to display:</strong> <select id="availablebands" onchange="changeTmsUrl()"></select>
          <input placeholder="min" id="contrast-min" onchange="changeTmsUrl()">
          <input placeholder="max" id="contrast-max" onchange="changeTmsUrl()">
        </div>
        <div>
          <table>
            <tr><td><strong>Red:  </strong></td><td><select id="availablebands-r" onchange="changeTmsUrl()"></select></td><td><input placeholder="min" id="contrast-min-r" onchange="changeTmsUrl()"></td><td><input placeholder="max" id="contrast-max-r" onchange="changeTmsUrl()"></td></tr>
            <tr><td><strong>Green:</strong></td><td><select id="availablebands-g" onchange="changeTmsUrl()"></select></td><td><input placeholder="min" id="contrast-min-g" onchange="changeTmsUrl()"></td><td><input placeholder="max" id="contrast-max-g" onchange="changeTmsUrl()"></td></tr>
            <tr><td><strong>Blue: </strong></td><td><select id="availablebands-b" onchange="changeTmsUrl()"></select></td><td><input placeholder="min" id="contrast-min-b" onchange="changeTmsUrl()"></td><td><input placeholder="max" id="contrast-max-b" onchange="changeTmsUrl()"></td></tr>
          </table>
        </div>
      </div>`
  });
  
  // IMPRINT panel
  sidebar.addPanel({
    id: 'imprint',
    tab: '<i class="fa fa-info-circle fa-lg"></i>',
    position: 'bottom',
    pane: `
      <h3>Legal stuff</h3>
      <p>Amun Software Inc.</p>
      <p>Devs: Gözde, Philipp², Niklas, Christoph</p>`
  });
  
  // SHOWING/HIDING stuff when appropriate
  sidebar.on('content', function(e) {
    if(e.id=='search') {
      getSearchResults();
      map.addControl(drawControl);
    } else {
      map.removeControl(drawControl);
    }
  });
  
  sidebar.open('home');
}