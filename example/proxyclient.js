/*jshint node:true, eqeqeq:true */
'use strict';

var hprose = require('hprose');
var client = hprose.Client.create('tcp://127.0.0.1:1234/', []);
client.fullDuplex = true;
client.maxPoolSize = 1;
var proxy = client.useService();

proxy.hello("World", function(result) {
    console.log(result);
}, function(name, error) {
    console.error(error);
});

var weeks = {
    'Monday': 'Mon',
    'Tuesday': 'Tue',
    'Wednesday': 'Wed',
    'Thursday': 'Thu',
    'Friday': 'Fri',
    'Saturday': 'Sat',
    'Sunday': 'Sun',
};

proxy.swapKeyAndValue.onsuccess = function(result, args) {
    console.log(weeks.constructor, weeks);
    console.log(result.constructor, result);
    console.log(args.constructor, args);
};

proxy.swapKeyAndValue.byref = true;

proxy.swapKeyAndValue(weeks);