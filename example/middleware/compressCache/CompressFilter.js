var hprose = require('hprose');
var compressjs = require('compressjs');
function CompressFilter(algorithmName) {
    this.algorithm = compressjs[algorithmName];
}
CompressFilter.prototype.inputFilter = function(data) {
    return this.algorithm.decompressFile(data);
};
CompressFilter.prototype.outputFilter = function(data) {
    return this.algorithm.compressFile(data);
};
module.exports = CompressFilter;
