var hprose = require("hprose");
var CompressFilter = require("./CompressFilter.js");
var SizeFilter = require("./SizeFilter.js");
var statfilter = require("./statfilter.js");
function echo(value) {
    return value;
}
var server = hprose.Server.create("http://0.0.0.0:8080");
server.addFunction(echo);
server.addFilter(statfilter);
server.addFilter(new SizeFilter('Non compressed'));
server.addFilter(new CompressFilter('Lzp3'));
server.addFilter(new SizeFilter('Compressed'));
server.addFilter(statfilter);
server.start();
