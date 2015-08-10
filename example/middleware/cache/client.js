var hprose = require("hprose");
var loghandler = require("./loghandler.js");
var cachehandler = require("./cachehandler.js");
var client = hprose.Client.create("http://127.0.0.1:8080/", ['hello']);
client.use(cachehandler)
      .use(loghandler);
client.hello("cache world", function(result) {
    console.log(result);
}, { userdata: { cache: true } });
client.hello("cache world", function(result) {
    console.log(result);
}, { userdata: { cache: true } });
client.hello("no cache world", function(result) {
    console.log(result);
});
client.hello("no cache world", function(result) {
    console.log(result);
});
