var hprose = require("hprose");
var CompressFilter = require("./CompressFilter.js");
var SizeFilter = require("./SizeFilter.js");
var statfilter = require("./statfilter.js");
var client = hprose.Client.create("http://127.0.0.1:8080/", ['echo']);
client.addFilter(statfilter);
client.addFilter(new SizeFilter('Non compressed'));
client.addFilter(new CompressFilter('Lzp3'));
client.addFilter(new SizeFilter('Compressed'));
client.addFilter(statfilter);
var value = [];
for (var i = 0; i < 100000; i++) {
    value[i] = i;
}
client.echo(value, function(result) {
    console.log(result.length);
});
