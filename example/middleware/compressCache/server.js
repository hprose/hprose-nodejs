var hprose = require("hprose");
var CompressFilter = require("./CompressFilter.js");
var sizehandler = require("./sizehandler.js");
var stathandler = require("./stathandler.js");
function echo(value) {
    return value;
}
var server = hprose.Server.create("http://0.0.0.0:8080");
server.beforeFilter.use(stathandler('BeforeFilter'))
                   .use(sizehandler('Non compressed'));
server.addFilter(new CompressFilter('Lzp3'));
server.afterFilter.use(stathandler('AfterFilter'))
                  .use(sizehandler('compressed'));
server.add(echo);
server.start();
