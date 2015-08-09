/*jshint node:true, eqeqeq:true */
'use strict';

var hprose = require('hprose');
var client = hprose.Client.create('tcp://127.0.0.1:1234/', ['hello']);
client.fullDuplex = true;
client.maxPoolSize = 1;
client.hello("World", function(result) {
    console.log(result);
}, function(name, error) {
    console.error(error);
});
