var hprose = require("hprose");
var logfilter = require("./logfilter.js");
var client = hprose.Client.create("http://127.0.0.1:8080/", ['hello']);
client.addFilter(logfilter);
client.hello("world", function(result) {
    console.log(result);
});
