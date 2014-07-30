var _ = require('lodash');
var should = require('should');
var async = require('async');
var arango = require('../../../index');

var db = arango.Connection('http://localhost:8529/');

describe('arango-extended', function () {

  it('should have extended APIs', function (done) {
    should.exists(db);

    db.should.have.enumerable('trackedCollection');
    db.should.have.enumerable('trackedDocument');
    done();
  });

});
