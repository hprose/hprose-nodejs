/*jshint node:true, eqeqeq:true */
'use strict';

var hprose = require('../lib/hprose.js');
var client = hprose.Client.create('tcp://127.0.0.1:4321/', []);
client.fullDuplex = true;
client.maxPoolSize = 1;
//client.simple = true;
client.on('error', function(func, e) {
    console.log(func, e);
});
var proxy = client.useService(['hello']);
var start = new Date().getTime();
var max = 100;
var n = 0;
var callback = function(result) {
    console.log(result);
    n++;
    if (n === max) {
        var end = new Date().getTime();
        console.log(end - start);
    }
};
for (var i = 0; i < max; i++) {
    proxy.hello(i, callback);
}
var end = new Date().getTime();
console.log(end - start);
