var Utils = {
  generateTrackedCollectionNames: function generateTrackedCollectionNames(collection_name) {
    return {
      entity: collection_name,
      entityHistory: collection_name + '_history',
      entityEdges: collection_name + '_edges',
      entityRevisionGraph: collection_name + '_revGraph'
    };
  },
  strEndsWith: function(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
  }
};
module.exports = Utils;