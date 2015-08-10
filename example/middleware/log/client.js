var hprose = require("hprose");
var loghandler = require("./loghandler.js");
var client = hprose.Client.create("http://127.0.0.1:8080/", ['hello']);
client.use(loghandler);
client.hello("world", function(result) {
    console.log(result);
});
