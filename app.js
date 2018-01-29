var editableLayers;
var drawControl;
var originalValue;
var sentinel;
var polygon;

var panelid;
var currentscene;

var totalcount;
var foundcount;
var itemsperpage = 10;
var page = 0;
var numberofpages;

var permalinkactive = false;

// const DISCOVERYENDPOINT = 'http://gis-bigdata:11016';
const DISCOVERYENDPOINT = 'http://10.66.1.238:3000';
// const PROCESSINGENDPOINT = 'http://gis-bigdata:11014';
const PROCESSINGENDPOINT = 'http://10.66.1.238:8080';

$(document).ready(function() {
  initMap();
  initPanels();
  initFromPermalink();
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
  $.get(DISCOVERYENDPOINT+'/datasets', function(result) {
    document.getElementById('searchresults').innerHTML = result
    .sort((e1,e2) => e1.MTD.metadata[''].PRODUCT_START_TIME < e2.MTD.metadata[''].PRODUCT_START_TIME)
    .map((e) =>
      `<li
        onclick="showFootprintOnMap(JSON.parse(this.dataset.polygoncoords))"
        ondblclick="showDetails(this.dataset.scenename)"
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
    e.classList.remove('filtered');
    if(
      identifiersubstrings
        .map((substring) => e.dataset.scenename.toLowerCase().indexOf(substring) < 0)
        .reduce((e1,e2) => e1||e2) ||
      startdate != '' && e.dataset.datetime < startdate ||
      enddate   != '' && e.dataset.datetime > enddate ||
      bbox != undefined && bbox.intersects(JSON.parse(e.dataset.polygoncoords)) == false
    ) {
      e.classList.add('filtered');
    }
  });
  
  foundcount = totalcount - parseInt($('.filtered').length);
  document.getElementById('resultcount').innerHTML = foundcount;
  
  numberofpages = Math.ceil(foundcount/itemsperpage);
  if(page > numberofpages) page = numberofpages-1;  // page is zero-indexed
  pageResults();
  
  updatePermalink();
}

function pageResults() {
  var counter = 0;
  Array.from(document.getElementById('searchresults').children).forEach(function(e) {
    e.classList.remove('paged');
    if(! e.classList.contains('filtered')) {
      counter++;
      if(counter <= page*itemsperpage || counter > page*itemsperpage + itemsperpage) {
        e.classList.add('paged');
      }
    }
  });
  
  document.getElementById('searchresults').start = page*itemsperpage + 1;
  document.getElementById('resultnav-pages').innerHTML = Array.from(Array(numberofpages), (e,i) =>
    '<button' + (page==i ? ' disabled' : '') + ' onclick="page=parseInt(this.innerHTML)-1; filterResults();">'+(i+1)+'</button>'
  ).join("\n");
  document.getElementById('resultnav-backwards').disabled = (page == 0);
  document.getElementById('resultnav-forwards').disabled = (page == Math.floor(foundcount/itemsperpage));
  
  // paging info not yet included in permalink
  //updatePermalink();
}

function showFootprintOnMap(polygonlatlngs) {
  polygon.setLatLngs(polygonlatlngs);
  map.panInsideBounds(polygon.getBounds());
  updatePermalink();
}

function showDetails(scenename) {
  $.get(DISCOVERYENDPOINT+'/datasets?identifiers='+scenename, function(result) {
    currentscene = scenename;
    const info = result[0];
    
    polygon.setLatLngs(getPolygonCoords(info.MTD.metadata[''].FOOTPRINT));
    map.fitBounds(polygon.getBounds()); 
    
    sidebar.open('details');
    const datetime = info.MTD.metadata[''].DATATAKE_1_DATATAKE_SENSING_START;
    const cloudcoverage = info.MTD.metadata[''].CLOUD_COVERAGE_ASSESSMENT;
    document.getElementById('details-identifier').innerHTML = scenename;
    document.getElementById('details-datetime').innerHTML = datetime;
    document.getElementById('details-cloudcoverage').innerHTML = cloudcoverage;
    
    const tmsurls = getTmsUrlsAsList(info.tmsUrls);
    const bandselector = tmsurls
      .split(',')
      .map((e)=>'<option value="' + e + '">' + e.replace(/^.*IMG_DATA\//, '') + '</option>')
      .join("\r\n");
    ['', '-r', '-g', '-b'].forEach((postfix, i) => {
      const select = document.getElementById('availablebands'+postfix);
      select.innerHTML = bandselector;
      const defaultvalue = (bandselector.indexOf('R60m')!=-1 ? 'R60m/' : '') + ['B01','B04','B03','B02'][i];
      const permalinkvalue = getParamFromPermalink(select.id);
      if(Array.from(select.options).some((e)=>e.value==permalinkvalue)) {
        select.value = permalinkvalue;
      } else {
        select.value = defaultvalue;
      }
    });
    changeTmsUrl(); // -> updates the permalink in the end
    permalinkactive = true;
  });
}

function getColormode() {
  // may be 'rgb' or 'grayscale'
  return document.querySelector('input[name=colormode]:checked').value;
}

function changeTmsUrl() {
  if(getColormode() == 'grayscale') {
    const band = document.getElementById('availablebands').value;
    const min = (parseInt(document.getElementById('contrast-min').value) || 0);
    const max = (parseInt(document.getElementById('contrast-max').value) || 255);
    if(min==0 && max==255) {
      // use TMS directly for default settings
      sentinel.setUrl(DISCOVERYENDPOINT+`/img/${currentscene}/IMG_DATA/${band}/{z}/{x}/{y}.png`);
    } else {
      // use processing service for special settings
      sentinel.setUrl(PROCESSINGENDPOINT+`/api/tiles?z={z}&x={x}&y={y}&option=grayscale&scene=${currentscene}&band=${band}&min=${min}&max=${max}`);
    }
  } else {
    sentinel.setUrl(PROCESSINGENDPOINT+'/api/tiles?z={z}&x={x}&y={y}&option=RGB'
      + '&scene='      +  currentscene.replace('.SAFE', '')
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
  updatePermalink();
}

function changeOpacity(value) {
  sentinel.setOpacity(value / 100);
  document.getElementById('opacity-label').innerHTML = value + '&nbsp;%';
  updatePermalink();
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
  originalValue = new L.marker([100, 200]).addTo(map);
  map.on('click', function(e) {
    originalValue.setLatLng(e.latlng).bindPopup('Original value:<br>Loading...').openPopup();
    $.get(DISCOVERYENDPOINT+`/pixelValue?identifier=${currentscene}&band=TCI&lat=${e.latlng.lat}&long=${e.latlng.lng}`, function(result) {
      result = JSON.parse(result);
      originalValue.bindPopup('Original value:<br>' + (result.Report.Alert || result.Report.BandReport.Value || result.Report.BandReport.map((e)=>`Band ${e.band}: ${e.Value}`).join('<br>')));
    });
  });
  
  // POLYGON
  polygon = new L.polygon([], {color: 'red', fill: false}).addTo(map);
  
  // LOADING SYMBOL
  var loadingControl = L.Control.loading({
    position: 'topright',
    separate: true
  });
  map.addControl(loadingControl);
  
  // PERMALINKS
  map.on('zoomend', updatePermalink);
  map.on('moveend', updatePermalink);
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
      </ol>
      <nav id="resultnav">
        <button id="resultnav-backwards" onclick="if(page != 0) { page--; pageResults(); }">&lt;</button>
        <div id="resultnav-pages">
        </div>
        <button id="resultnav-forwards" onclick="if(page != Math.floor(foundcount/itemsperpage)) { page++; pageResults(); }">&gt;</button>
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
      
      <div id="details-identifier-container">
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
        <input type="radio" name="colormode" id="grayscale" value="grayscale" checked onchange="changeTmsUrl()"/><label for="grayscale">Grayscale</label>
        <input type="radio" name="colormode" id="rgb" value="rgb" onchange="changeTmsUrl()"/><label for="rgb">RGB</label>
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
  sidebar.on('content', function(panel) {
    if(panel.id == 'search') {
      map.addControl(drawControl);
      if(document.getElementById('searchresults').children.length == 0) {
        getSearchResults();
      }
    } else {
      map.removeControl(drawControl);
    }
  });
  
  // KEEP PERMALINK in urlbar updated
  sidebar.on('content', function(panel) {
    panelid = panel.id;
    updatePermalink();
  });
}

function getSearchAndVisualisationState() {
  return Array.from(document.querySelectorAll('input:not(.leaflet-control-layers-selector)'))
    .concat(Array.from(document.getElementsByTagName('select')))
    .map((e) => e.id + '=' + (e.type=='radio' ? e.checked : e.value))
    .join('&')
    +`&mapstate=${map.getCenter().lat},${map.getCenter().lng}@${map.getZoom()}`;
}

function updatePermalink() {
  if(permalinkactive) {
    var newhash;
    
    switch(panelid) {
      case 'home':
      case 'imprint':
        newhash = panelid;
        break;
      case 'search':
        newhash = panelid + '?' + getSearchAndVisualisationState();
        break;
      case 'details':
        newhash = panelid + '/' + currentscene + '?' + getSearchAndVisualisationState();
        break;
      default:
        return;
        break;                      
    }
    
    window.location.hash = newhash;
    console.log(newhash);
  }
}

function getParamFromPermalink(param) {
  return window.location.hash.match(new RegExp(param+'=([^&]*)'))[1];
}

function initFromPermalink() {
  if(window.location.hash == '' || window.location.hash == '#home') {
    sidebar.open('home');
    return;
  }
  
  if(window.location.hash == '#imprint') {
    sidebar.open('imprint');
    return;
  }
  
  if(window.location.hash.substr(0,9) == '#details/') {
    showDetails(window.location.hash.substr(9,65));
  }
  
  if(window.location.hash.indexOf('?') != -1) {
    window.location.hash
      .substr(window.location.hash.indexOf('?')+1)
      .split('&')
      .map((keyvalue) => keyvalue.split('='))
      .forEach((keyvalue) => {
        if(keyvalue[0] == 'mapstate') {
          const coordszoom = keyvalue[1].split('@');
          map.setView(coordszoom[0].split(','), coordszoom[1]);
        } else {
          const element = document.getElementById(keyvalue[0]);
          if(keyvalue[1] == 'true') {
            element.checked = true;
          } else if(keyvalue[1] == 'false') {
            element.checked = false;
          } else {
            element.value = keyvalue[1];
            if(keyvalue[0] == 'opacity') {
              changeOpacity(keyvalue[1]);
            }
          }
        }
      })
    ;
  }
  
  if(window.location.hash.substr(0,7) == '#search') {
    sidebar.open('search');
  }
}