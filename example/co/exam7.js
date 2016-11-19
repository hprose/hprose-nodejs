var hprose = require('hprose');

var client = hprose.Client.create('http://hprose.com/example/');
var proxy = client.useService();

hprose.co(function*() {
    var client = yield proxy;
    for (var i = 0; i < 5; i++) {
        console.log((yield client.hello("1-" + i)));
    }
});

hprose.co(function*() {
    var client = yield proxy;
    for (var i = 0; i < 5; i++) {
        console.log((yield client.hello("2-" + i)));
    }
});
