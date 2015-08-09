/*jshint node:true, eqeqeq:true */
'use strict';

var hprose = require('../lib/hprose.js');
var client = hprose.Client.create('tcp://127.0.0.1:4321/', []);
client.fullDuplex = false;
//client.maxPoolSize = 1;
client.simple = true;
client.on('error', function(func, e) {
    console.log(func, e);
});
var proxy = client.useService(['hello']);
proxy.hello('world').delay(10000).then(function() {
    proxy.hello('world').then(function(result) {
        console.log(result);
    });
});
