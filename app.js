var editableLayers;
var drawControl;
var bboxes;
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

function showFootprintOnMap(event) {
  var polygonlatlngs = JSON.parse(event.target.parentElement.dataset.polygoncoords);
  polygon.setLatLngs(polygonlatlngs);
  map.panInsideBounds(polygon.getBounds());
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

function showDetails(event) {
  const info = (event.target.tagName=='LI' ? event.target.dataset : event.target.parentElement.dataset);
  sidebar.open('details');
  document.getElementById('details-identifier').innerHTML = info.scenename.replace(/_/g, '_&#8203;');
  document.getElementById('details-datetime').innerHTML = info.datetime;
  document.getElementById('details-cloudcoverage').innerHTML = info.cloudcoverage;
  var bandselector = info.tmsurls
    .split(',')
    .map((e)=>'<option value="' + e + '">' + e.replace(/^.*IMG_DATA\//, '') + '</option>')
    .join("\r\n");
  ['', '-red', '-green', '-blue'].forEach((postfix) => document.getElementById('details-availablebands'+postfix).innerHTML = bandselector);
  map.fitBounds(polygon.getBounds());
  changeTmsUrl(info.tmsurls.split(',')[0] + '/{z}/{x}/{y}.png');
}

function changeTmsUrl(tmsurl = undefined) {
  if(tmsurl != undefined && document.querySelector('input[name=colormode]:checked').value == 'grayscale') {
    sentinel.setUrl(tmsurl + '/{z}/{x}/{y}.png');
  } else {
    sentinel.setUrl('http://gis-bigdata:11014/api/tiles?z={z}&x={x}&y={y}&option=TCI'
      + '&resolution=' + (document.getElementById('details-availablebands-red')  .selectedOptions[0].text.split('/').reverse()[1] || 'NULL')
      + '&r='          +  document.getElementById('details-availablebands-red')  .selectedOptions[0].text.split('/').pop()
      + '&g='          +  document.getElementById('details-availablebands-green').selectedOptions[0].text.split('/').pop()
      + '&b='          +  document.getElementById('details-availablebands-blue') .selectedOptions[0].text.split('/').pop()
      + '&scene='      +  document.getElementById('details-identifier').innerHTML.replace('.SAFE', '').replace(/\W/g, '')
      + '&rmin='       + (parseInt(document.getElementById('contrast-min-r').value) || 0)
      + '&gmin='       + (parseInt(document.getElementById('contrast-min-g').value) || 0)
      + '&bmin='       + (parseInt(document.getElementById('contrast-min-b').value) || 0)
      + '&rmax='       + (parseInt(document.getElementById('contrast-max-r').value) || 255)
      + '&gmax='       + (parseInt(document.getElementById('contrast-max-g').value) || 255)
      + '&bmax='       + (parseInt(document.getElementById('contrast-max-b').value) || 255)
    );
  }
}

function changeOpacity(event) {
  console.log('changed opacity');
  sentinel.setOpacity(event.target.value / 100);
  event.target.nextElementSibling.innerHTML = event.target.value + '&nbsp;%';
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
  
  // SEARCH BBOXES
  bboxes = L.layerGroup();
  L.rectangle([[52,7],[53,8]]).addTo(bboxes);
  L.rectangle([[54,8],[55,9]]).addTo(bboxes);
  L.rectangle([[52.5,12.5],[53.5,13.5]]).addTo(bboxes);
  L.rectangle([[48,10],[49,11]]).addTo(bboxes);
  L.rectangle([[48.5,12],[49.5,13]]).addTo(bboxes);
  
  // ORIGINAL VALUE
  map.on('click', function(e) {
    L.marker(e.latlng).bindPopup('Original value:<br>42.1337').addTo(map).openPopup();
  });
  
  // POLYGON
  polygon = new L.polygon([], {color: 'red', fill: false}).addTo(map);
}

function initPanels() {
  // HOME panel
  sidebar.addPanel({
    id: 'home',
    tab: '<i class="fa fa-home fa-lg"></i>',
    pane: `
<h3>Amun Sphinx</h3>
<p>Explore the wealth of Sentinel-2 data available and use their full potential!</p>
<p>Click the maginfying glass on the left to start browsing the datasets.</p>
    `,
    position: 'top'
  });
  
  // SEARCH panel
  sidebar.addPanel({
    id: 'search',
    tab: '<i class="fa fa-search fa-lg"></i>',
    pane: `
<h3>Search</h3>
<form>
  <input placeholder="Identifier" id="identifier" onkeyup="filterResults()">
  <input placeholder="Start date" id="startdate" onchange="filterResults()" data-toggle="datepicker">
  <input placeholder="End date" id="enddate" onchange="filterResults()" data-toggle="datepicker">
  <input type="submit" value="Filter">
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
</nav>
    `,
    position: 'top'
  });
  
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
  <input type="range" min="0" max="100" step="1" value="100" id="details-opacity" onchange="changeOpacity(event)" />
  <span>100&nbsp;%</span>
</div>

<div>
  <strong>Color mode:</strong>
  <input type="radio" name="colormode" id="grayscale" value="grayscale" checked/><label for="grayscale">Grayscale</label>
  <input type="radio" name="colormode" id="rgb" value="rgb"/><label for="rgb">RGB</label>
  <div>
    <strong>Band to display:</strong> <select id="details-availablebands" onchange="changeTmsUrl(event.target.value)"></select>
  </div>
  <div>
    <table>
      <tr><td><strong>Red:  </strong></td><td><select id="details-availablebands-red"   onchange="changeTmsUrl()"></select></td><td><input placeholder="min" id="contrast-min-r" onchange="changeTmsUrl()"></td><td><input placeholder="max" id="contrast-max-r" onchange="changeTmsUrl()"></td></tr>
      <tr><td><strong>Green:</strong></td><td><select id="details-availablebands-green" onchange="changeTmsUrl()"></select></td><td><input placeholder="min" id="contrast-min-g" onchange="changeTmsUrl()"></td><td><input placeholder="max" id="contrast-max-g" onchange="changeTmsUrl()"></td></tr>
      <tr><td><strong>Blue: </strong></td><td><select id="details-availablebands-blue"  onchange="changeTmsUrl()"></select></td><td><input placeholder="min" id="contrast-min-b" onchange="changeTmsUrl()"></td><td><input placeholder="max" id="contrast-max-b" onchange="changeTmsUrl()"></td></tr>
    </table>
  </div>
</div>
`,
    position: 'top'
  });
  
  // IMPRINT panel
  sidebar.addPanel({
    id: 'imprint',
    tab: '<i class="fa fa-info-circle fa-lg"></i>',
    pane: `
      <h3>Legal stuff</h3>
      <p>Amun Software Inc.</p>
      <p>Devs: Gözde, Philipp², Niklas, Christoph</p>
    `,
    position: 'bottom'
  });
  
  // SHOWING/HIDING stuff when appropriate
  sidebar.on('content', function(e) {
    if(e.id=='search') {
      $.get('http://gis-bigdata:11016/datasets', function(result) {
        document.getElementById('searchresults').innerHTML = result
        .sort((e1,e2) => e1.MTD.metadata[''].PRODUCT_START_TIME < e2.MTD.metadata[''].PRODUCT_START_TIME)
        .map((e) =>
          `<li
            onclick="showFootprintOnMap(event)"
            ondblclick="showDetails(event)"
            data-footprint="${e.MTD.metadata[''].FOOTPRINT}"
            data-polygoncoords="${JSON.stringify(getPolygonCoords(e.MTD.metadata[''].FOOTPRINT))}"
            data-tmsurls="${(e.tmsUrls.R10m != undefined ? Object.values(e.tmsUrls.R10m).join(',').concat(Object.values(e.tmsUrls.R20m).join(',').concat(Object.values(e.tmsUrls.R60m).join(','))) : Object.values(e.tmsUrls).join(','))}"
            data-scenename="${e.sceneName}"
            data-datetime="${e.MTD.metadata[''].DATATAKE_1_DATATAKE_SENSING_START}"
            data-cloudcoverage="${e.MTD.metadata[''].CLOUD_COVERAGE_ASSESSMENT}">
            <strong>${e.sceneName.replace(/_/g, '_&#8203;')}</strong>
            <br>
            ${new Date(e.MTD.metadata[''].PRODUCT_START_TIME).toLocaleString()}
          </li>`
        ).join('\r\n');
        totalcount = result.length;
        document.getElementById('resultcount').innerHTML = totalcount;
        filterResults();
      });
      map.addControl(drawControl);
      //bboxes.addTo(map);
    } else {
      map.removeControl(drawControl);
      bboxes.removeFrom(map)
    }
  });
  
  sidebar.open('home');
}