var hprose = require('hprose');

hprose.co(function*() {
    var client = hprose.Client.create('http://hprose.com/example/');
    yield client.useService();
    console.log(yield client.hello("Hprose"));
    var a = client.sum(1, 2, 3);
    var b = client.sum(4, 5, 6);
    var c = client.sum(7, 8, 9);
    console.log(yield client.sum(a, b, c));
    console.log(yield client.hello("World"));
});
