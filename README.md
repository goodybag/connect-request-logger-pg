## Connect Request Logger for PostgreSQL

Log http request to postgres.
- Automatically does table partitioning by year/month/week/day (default: month)
- Stores user defined fields (look at properties attached to the req object, supports nested properties as well)


### Example
```javascript
var uuid = require('node-uuid');
var express = require('express');
var requestLogger = require('./');

var app = express();

app.use(function(req, res, next) {
  req.uuid = uuid.v1();
  next();
});

app.use(requestLogger({
  connStr: 'postgres://localhost:5432/test'
, table: 'requests'
, plan: 'month'
, customFields: {uuid: 'uuid'}
}));

app.get('/hello', function(req, res){
  var body = 'Hello World';
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Length', body.length);
  res.end(body);
});

app.listen(3000);
console.log('Listening on port 3000');
```
