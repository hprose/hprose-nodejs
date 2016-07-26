/*jshint node:true, eqeqeq:true */
'use strict';

var hprose = require('../lib/hprose.js');
var client = hprose.Client.create('ws://127.0.0.1:8080', []);
client.keepAlive = false;
client.simple = true;
var var_dump = hprose.Future.wrap(console.log, console);
var proxy = client.useService(['hello']);

var_dump(proxy.hello('async world1'));
var_dump(proxy.hello('async world2'));
var_dump(proxy.hello('async world3'));
var_dump(proxy.hello('async world4'));
var_dump(proxy.hello('async world5'));
var_dump(proxy.hello('async world6'));

proxy.hello("world1")
.then(function(result) {
    console.log(result);
    return proxy.hello("world2");
})
.then(function(result) {
    console.log(result);
    return proxy.hello("world3");
})
.then(function(result) {
    console.log(result);
    return proxy.hello("world4");
})
.then(function(result) {
    console.log(result);
    return proxy.hello("world5");
})
.then(function(result) {
    console.log(result);
    return proxy.hello("world6");
})
.then(function(result) {
    console.log(result);
});

var_dump(proxy.hello('async world1'));
var_dump(proxy.hello('async world2'));
var_dump(proxy.hello('async world3'));
var_dump(proxy.hello('async world4'));
var_dump(proxy.hello('async world5'));
var_dump(proxy.hello('async world6'));

