/*jshint node:true, eqeqeq:true */
'use strict';

var hprose = require('../lib/hprose.js');
var client = hprose.Client.create('http://127.0.0.1:8080/', []);
client.simple = true;
client.on('error', function (func, e) {
    console.log(func, e);
});
hprose.co(function* () {
    var proxy = client.useService(['Hello','Asynchello']);
    //console.log(proxy);
    
    {
        let start = new Date().getTime();
        for (var i = 0; i < 32; i++) {
            let result = yield proxy.Hello(i);
            console.log(result);
        }
        let end = new Date().getTime();
        console.log("time: " + (end - start));
    }
    // */
    
    {
        let start = new Date().getTime();
        for (var i = 0; i < 32; i++) {
            let result = yield proxy.Asynchello(i);
            console.log(result);
        }
        let end = new Date().getTime();
        console.log("time: " + (end - start));
    }
    // */
});
