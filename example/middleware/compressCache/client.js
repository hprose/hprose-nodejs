var hprose = require("hprose");
var CompressFilter = require("./CompressFilter.js");
var cachehandler = require("./cachehandler.js");
var sizehandler = require("./sizehandler.js");
var stathandler = require("./stathandler.js");
var client = hprose.Client.create("http://127.0.0.1:8080/", ['echo']);
client.beforeFilter.use(cachehandler)
                   .use(stathandler('BeforeFilter'))
                   .use(sizehandler('Non compressed'));
client.addFilter(new CompressFilter('Lzp3'));
client.afterFilter.use(stathandler('AfterFilter'))
                  .use(sizehandler('compressed'));
var value = [];
for (var i = 0; i < 100000; i++) {
    value[i] = i;
}
client.echo(value, function(result) {
    console.log(result.length);
}, { userdata: { cache: true } });
client.echo(value, function(result) {
    console.log(result.length);
}, { userdata: { cache: true } });
