var editableLayers;
var drawControl;
var bboxes;
var overlay;

$(document).ready(function() {
  initMap();
  initPanels();
});

function initMap() {
  // MAP
  map = L.map('map', {
    center: [50, 0],  // shows Europe even when sidebar opened
    zoom: 4  // most of Europe
  });
  
  // BASEMAPS
  var osm = L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  L.control.layers({"OpenStreetMap": osm, "Esri": osm}).addTo(map);  // fake choice :D
  
  // SENTINEL IMAGE
  overlay = L.imageOverlay('http://sentinel-s2-l1c.s3.amazonaws.com/tiles/32/U/MC/2017/10/15/0/preview.jpg', [[52,7],[53,9]]);
  
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
}

function initPanels() {
  // HOME panel
  sidebar.addPanel({
    id: 'home',
    tab: '<i class="fa fa-home fa-lg"></i>',
    pane: `
<h3>Amun Sphinx</h3>
<p>Explore the wealth of Sentinel-2 data available and use their full potential!</p>    
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
  <input placeholder="Identifier">
  <input placeholder="Start date">
  <input placeholder="End date">
  <input type="submit" value="Filter">
</form>
<h3>Results</h3>
<ol>
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
  
  // DETAIL panel
  sidebar.addPanel({
    id: 'detail',
    tab: '<i class="fa fa-picture-o fa-lg"></i>',
    pane: `
<h3>Details</h3>
<p><em>Identifier: S2A_&shy;MSIL2A_&shy;20170927T103021_&shy;N0205_&shy;R108_&shy;T32UMC_&shy;20170927T103018</em></p>
<p>
<strong>Captured:</strong> 2017-09-27 10:30:21<br>
<strong>Cloud Coverage:</strong> 1.2 %<br>
<strong>UTM Zone:</strong> T32UMC<br>
</p>
<p>
<input type="checkbox"> Grayscale
<table>
<tr><td><strong>Red:</strong></td><td><select><option>Red</option></select></td><td><input placeholder="min"></td><td><input placeholder="max"></td><td><input type="range"></td></tr>
<tr><td><strong>Green:</strong></td><td><select><option>Infrared</option></select></td><td><input placeholder="min"></td><td><input placeholder="max"></td><td><input type="range"></td></tr>
<tr><td><strong>Blue:</strong></td><td><select><option>Green</option></select></td><td><input placeholder="min"></td><td><input placeholder="max"></td><td><input type="range"></td></tr>
<tr><td><strong>Grayscale:</strong></td><td><select><option>Green</option></select></td><td><input placeholder="min"></td><td><input placeholder="max"></td><td><input type="range"></td></tr>
</table>
</p>
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
      map.addControl(drawControl);
      bboxes.addTo(map);
    } else {
      map.removeControl(drawControl);
      bboxes.removeFrom(map)
    }
    
    if(e.id=='detail') {
      overlay.addTo(map);
    } else {
      overlay.removeFrom(map);
    }
  });
}