var util = require('util');
var extend = util._extend;
var _ = require('lodash');
var Arango = require('arangojs');
var urlParser = require('urlparser');

function ArangoExtended(db, options) {
  ArangoExtended.super_.call(this, db, options);
}

util.inherits(ArangoExtended, Arango);
ArangoExtended = _.extend(ArangoExtended, ArangoExtended.super_);

ArangoExtended.Connection = function() {

  var options = {};
  for (var i = 0; arguments[i]; i++) {
    if (typeof arguments[i] === 'object')
      extend(options, arguments[i]);
    else if (typeof arguments[i] === 'string')
      extend(options, path2db(arguments[i]));
  }

  // add extended APIs
  options.api = {
    trackedCollection:  __dirname + '/api/TrackedCollection.js',
    trackedDocument:    __dirname + '/api/TrackedDocument.js'
  };

  return new ArangoExtended(options);
};

function path2db(path) {
  var o = {}, c = urlParser.parse(path);
  if (c.host) {
    o._server = {};
    extend(o._server, c.host);
  }
  if (c.path) {
    if (c.path.base) o._name = c.path.base;
    if (c.path.name) o._collection = c.path.name;
  }
  return o;
}

module.exports = ArangoExtended;