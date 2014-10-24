/*jshint node:true, eqeqeq:true */
'use strict';

var hprose = require('hprose');
var client = new hprose.client.TcpClient('tcp://127.0.0.1:4321/');
//client.setSimpleMode();
client.on('error', function(func, e) {
    console.log(func, e);
});
var proxy = client.useService();
var start = new Date().getTime();
var max = 10;
var n = 0;
var callback = function(result) {
    console.log(result);
    n++;
    if (n >= max) {
        var end = new Date().getTime();
        console.log(end - start);
    }
    else {
        proxy.hello(n, callback);
    }
};

proxy.hello(0, callback);

var end = new Date().getTime();
console.log(end - start);

client.beginBatch();
for (var i = 0; i < max; i++) {
    proxy.hello(i, callback);
}
proxy.getMaps('name', 'age', 'age', function(result) {
    console.log(result);
});
client.endBatch();
proxy.getMaps('name', 'age', 'birthday', function(result) {
    console.log(result.toString());
    console.log(hprose.unserialize(result));
    console.log(hprose.serialize(hprose.unserialize(result)).toString());
}, hprose.Serialized);
