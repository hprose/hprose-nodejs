var hprose = require("hprose");
var loghandler = require("./loghandler.js");
function hello(name) {
    return "Hello " + name + "!";
}
var server = hprose.Server.create("http://0.0.0.0:8080");
server.addFunction(hello);
server.beforeFilter.use(loghandler);
server.start();
