var hprose = require("hprose");
var logfilter = require("./logfilter.js");
function hello(name) {
    return "Hello " + name + "!";
}
var server = hprose.Server.create("http://0.0.0.0:8080");
server.addFunction(hello);
server.addFilter(logfilter);
server.start();
