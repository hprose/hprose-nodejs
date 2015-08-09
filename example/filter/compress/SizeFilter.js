var hprose = require('hprose');
function SizeFilter(message) {
    this.message = message;
}
SizeFilter.prototype.inputFilter = function(data) {
    console.log(this.message + ' input size: ' + data.length);
    return data;
};
SizeFilter.prototype.outputFilter = function(data) {
    console.log(this.message + ' output size: ' + data.length);
    return data;
};
module.exports = SizeFilter;
