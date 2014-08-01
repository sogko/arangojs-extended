var _ = require('lodash');
var should = require('should');
var ArangoExtended = require('../../../index');
var DatabaseSupport = require('../../support/database');
var db = DatabaseSupport.connect();

describe('arango-extended', function () {

  it('should have extended APIs', function (done) {
    should.exists(db);

    db.should.have.enumerable('trackedCollection');
    db.should.have.enumerable('trackedDocument');
    done();
  });
});
