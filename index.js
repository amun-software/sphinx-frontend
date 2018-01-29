const express = require('express');
const compression = require('compression')
const cors = require('cors');
const routes = require('./routes');
const app = express();

app.set('port', process.env.PORT || 80);
app.use(cors());
app.use(compression());

console.log('Serving static content from folder ' + __dirname + '/public')
app.use(express.static('public'));
app.use(routes);

app.listen(app.get('port'), function() {
  console.log('Server started on port ' + app.get('port'));
});
