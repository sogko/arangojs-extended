arangojs-extended
=================

Extended APIs for [ArangoJS driver](https://github.com/triAGENS/ArangoDB-JavaScript)
Currently, this library features an extension to enable collections with revision history for its documents.

## Install
```npm install arangojs-extended```

## Usage
Same usage experience as ArangoJS

```javascript
var arango = require('arangojs-extended');
var db = arango.Connection('http://localhost:8529');

// create a tracked collection
db.trackedCollection.create('trackedCollection1', ...);

// add a document to a tracked collection, comes with a revision history
db.trackedDocument.create('collection1', { name: 'new document' }, ...);

// in addition to that, we can still access the default APIs available in ArangoJS
// create a vanilla, non-tracked collection
db.collection.create('collection1', ...);

// add a document to a collection
db.document.create('collection1', { name: 'new document' }, ...);


```

## Extended APIs
In addition to the [APIs in available in ArangoJS](https://github.com/triAGENS/ArangoDB-JavaScript#api), the following extended APIs are available

### TrackedCollection (db.trackedCollection)
* create(collection_name, opts, cb)
    * Creates a tracked collection that has its document revision history enabled
* get(id, cb)
    * Retrieves an existing tracked collection (an alias to db.collection.get)
* delete(id, cb)
    * Deletes an existing tracked collection and its revision history
* truncate(id, cb)
    * Deletes all documents of a tracked collection and its revision history
* count(id, cb)
    * Counts the document in the collection 

### TrackedDocument (db.trackedDocument)
* create(collection, data, opt, cb)
    * Creates a document in a tracked collection.
    * If data has ```._key``` specified and it belongs to an an existing document in the collection, the document will then be replaced with the data and a new revision point will be created if data has changed.
* get(id, opt, cb)
    * Retrieves a document from a tracked collection (an aliast to db.document.get)
* exists(id, cb)
    * Checks if a document exists
* put(id, data, opt, cb)
    * Replaces an existing document with new data and a new revision point will be created if data has changes.
    * No revision point will be created if no changes are made since last revision.
* delete(id, opt, cb)
    * Deletes an existing document and its revision history
* list(collection, cb)
    * Lists all documents in a collection


## Motivations
ArangoJS is a Javascript client library for ArangoDB and provides a mechanism to extend the API of the client library.

While working on a project that uses ArangoDB as a document store, there was a need for a way to track history of revisions for documents added/updated in a collection.
There have been [discussions about the possibility of returning revisions for a document right off from ArangoDB](https://github.com/triAGENS/ArangoDB/issues/106) but at the moment, its still in planning stages.
 
This extensions implements a collection that keeps a history of document state whenever its content changes.

To open up possibility for more custom extended APIs, the implementation was designed generic enough so that its easy to add more APIs if more use-cases arises that are not currently covered by ArangoDB/ArangoJS 

## Implementation details
### TrackedCollection
* Internally, a ```trackedCollection``` has an associated ```*_history``` and ```*_edges``` collection associated with it.
* For e.g, ```db.trackedCollection.create('col1', ...);``` will create the following collections in ArangoDB:
    * col1
    * col1_history
    * col1_edges (an edges collection)
* The additional two collections will be used to track revision history for documents in that collection

### TrackedDocument
* Each ```trackedDocument``` will have an edge (type:headRevision) pointing to its HEAD revision (current revision)
* Each revision will have an edge (type:prevRevision) pointing to the previous revision, creating a linked list of revisions. This allows linearly traversing through revision history.
* In addition to that, each revision will have an edge to it the primary document.
* Revisions for a document for a collection are stored in ```*_history``` collection
* Revision edges for a document are stored in ```*_edges``` collection

* Below illustrates the relationshop between a document (doc1) and its revisions and edges
```
    doc1 --- HEAD ---> doc1.revision(N)
                        '---> doc1.revision(N-1)
                                '---> doc.revision(N-2)
                                        ...
                                        '--> doc.revision(1);
```

## Tests

```npm test```


## TODO
* expose APIs to manage revision history
    * return a list of revisions for a tracked document
    * return a particular revision or HEAD revision for a document
    * allow traversal of revision history from a particular revision point (linked list)
* write tests for cases when a trying to create a trackedDocument in a vanilla collection

## Known Issues

## Credits

* [Hafiz Ismail](https://github.com/sogko) 

## Links
* [wehavefaces.net](http://wehavefaces.net)
* [twitter.com/sogko](https://twitter.com/sogko)
* [github.com/sogko](https://github.com/sogko)
* [medium.com/@sogko](https://medium.com/@sogko)

## License
Copyright (c) 2014 Hafiz Ismail. This software is licensed under the [MIT License](https://github.com/sogko/arangojs-extended/raw/master/LICENSE).
