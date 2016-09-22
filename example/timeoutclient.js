/*jshint node:true, eqeqeq:true */
'use strict';

var hprose = require('../lib/hprose.js');
var client = hprose.Client.create('tcp://127.0.0.1:4321/', ['sum']);
// client.fullDuplex = false;
client.keepAlive = false;
client.timeout = 600;

client.sum(1, 2);
client.sum(1, 2).then(function(result) {
    console.log("1 + 2 = " + result);
}).catch(function() {
    client.sum(2, 3, function(result) {
        console.log("2 + 3 = " + result);
    }, { timeout: 20000 });
})