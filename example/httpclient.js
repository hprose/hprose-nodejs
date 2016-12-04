/*jshint node:true, eqeqeq:true */
'use strict';

var hprose = require('../lib/hprose.js');
var client = hprose.Client.create('http://127.0.0.1:8080/', []);
client.simple = true;
client.on('error', function(func, e) {
    console.log(func, e);
});
hprose.co(function*() {
  var proxy = client.useService(['hello']);
  var start = new Date().getTime();
  for (var i = 0; i < 100; i++) {
      var result = yield proxy.hello(i);
      console.log(result);
  }
  var end = new Date().getTime();
  console.log("time: " + (end - start));
});
