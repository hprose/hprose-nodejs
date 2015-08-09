/*jshint node:true, eqeqeq:true */
'use strict';

var hprose = require('hprose');
var client = hprose.Client.create("http://0.0.0.0:8080");
var count = 0;
client.subscribe('time', function(date) {
    if (++count > 10) {
        client.unsubscribe('time');
    }
    else {
        console.log(date);
    }
});
