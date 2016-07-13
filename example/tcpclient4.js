/*jshint node:true, eqeqeq:true */
'use strict';

var hprose = require('../lib/hprose.js');
var client = hprose.Client.create('tcp://127.0.0.1:4321/', ['hello']);
client.fullDuplex = true;
client.maxPoolSize = 1;
var log = hprose.Future.wrap(console.log, console);
log(client.hello("async world1"));
log(client.hello("async world2"));
log(client.hello("async world3"));
log(client.hello("async world4"));
log(client.hello("async world5"));
log(client.hello("async world6"));

// 串行异步
client.hello("world1")
.then(function(result) {
    console.log(result);
    return client.hello("world2");
})
.then(function(result) {
    console.log(result);
    return client.hello("world3");
})
.then(function(result) {
    console.log(result);
    return client.hello("world4");
})
.then(function(result) {
    console.log(result);
    return client.hello("world5");
})
.then(function(result) {
    console.log(result);
    return client.hello("world6");
})
.then(function(result) {
    console.log(result);
    client.close();
});
