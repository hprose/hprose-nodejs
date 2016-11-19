var hprose = require('hprose');

function *hello(n, client) {
    var result = [];
    for (var i = 0; i < 5; i++) {
        result[i] = client.hello(n + "-" + i);
    }
    return Promise.all(result);
}

hprose.co(function*() {
    var client = hprose.Client.create('http://hprose.com/example/');
    yield client.useService();
    var result = yield hprose.co(function *(client) {
        var result = [];
        for (var i = 0; i < 3; i++) {
            result[i] = hprose.co(hello, i, client);
        }
        return Promise.all(result);
    }, client);
    console.log(result);
});
