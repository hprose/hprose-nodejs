var hprose = require('hprose');

hprose.co(function*() {
    var client = hprose.Client.create('http://hprose.com/example/');
    yield client.useService();
    for (var i = 0; i < 5; i++) {
        console.log(yield client.hello("1-" + i));
    }
    var console_log = hprose.wrap(console.log, console);
    for (var i = 0; i < 5; i++) {
        console_log(client.hello("2-" + i));
    }
    for (var i = 0; i < 5; i++) {
        console.log(yield client.hello("3-" + i));
    }
});
